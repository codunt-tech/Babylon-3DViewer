import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
    Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3,
    StandardMaterial, Color3, Color4, DirectionalLight, SceneLoader,
    Animation, CubicEase, EasingFunction,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraKeyboardMoveInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput';
import { TestFPSOStruc } from '../src/shipData';
import { ContextMenu, HierarchicalSidebar } from './babylonViewerUi';
import { AppHeader, LoadingPill, ComponentTypesRail } from './viewerShell';

// ─── Data helpers ─────────────────────────────────────────────────────────────

const getCompartmentNamesFromShipData = () => {
    const names = new Set();
    ['plates', 'brackets', 'stiffeners', 'shells'].forEach((t) => {
        (TestFPSOStruc[t] || []).forEach((item) => names.add(item.compartmentName));
    });
    return Array.from(names);
};

const organizeByCompartments = () => {
    const compartments = {};
    ['plates', 'brackets', 'stiffeners', 'shells'].forEach((componentType) => {
        (TestFPSOStruc[componentType] || []).forEach((item) => {
            const { compartmentName, uid, link } = item;
            if (!compartments[compartmentName]) {
                compartments[compartmentName] = { compartmentName, uid, components: {} };
            }
            compartments[compartmentName].components[componentType] = {
                name: `${compartmentName}_${componentType.toUpperCase()}`,
                path: link,
                type: componentType,
                uid,
            };
        });
    });
    return compartments;
};

const initialOrganizedCompartments = organizeByCompartments();

const INTERIOR_TYPES = new Set(['plates', 'brackets', 'stiffeners']);
const SHELL_TYPES    = new Set(['shells', 'shell']);

const COMPONENT_COLORS = {
    brackets:   new Color3(0.76, 0.71, 0.26),
    stiffeners: new Color3(0.73, 0.73, 0.73),
    plates:     new Color3(0.286, 0.239, 0.459),
    shells:     new Color3(0.29, 0.565, 0.886),
    shell:      new Color3(0.29, 0.565, 0.886),
};
const DECK_COLOR    = new Color3(0.561, 0.737, 0.561);
const DEFAULT_COLOR = new Color3(0.6, 0.6, 0.6);

// ─── GLB loader ───────────────────────────────────────────────────────────────

const loadGLBFile = async (scene, filePath, compartmentName, componentName, componentType) => {
    try {
        const result = await SceneLoader.ImportMeshAsync('', '', filePath, scene, null, '.glb');
        const geometryMeshes = result.meshes.filter((m) => m.getTotalVertices() > 0);

        geometryMeshes.forEach((mesh) => {
            mesh.metadata = { ...mesh.metadata, compartmentName, componentType, componentName };

            const isShellType = SHELL_TYPES.has(componentType);
            const targetColor = isShellType
                ? (mesh.name.toLowerCase().includes('deck') ? DECK_COLOR : COMPONENT_COLORS.shells)
                : (COMPONENT_COLORS[componentType] ?? DEFAULT_COLOR);

            const matName = `mat_${componentType}_${compartmentName}`;
            let mat = scene.getMaterialByName(matName);
            if (!mat) {
                mat = new StandardMaterial(matName, scene);
                mat.diffuseColor     = targetColor;
                mat.specularColor    = new Color3(0, 0, 0);
                mat.specularPower    = 0;
                mat.backFaceCulling  = false;
                mat.alpha            = 1.0;
                mat.transparencyMode = 0;
                if (componentType === 'plates') mat.zOffset = 1;
            }
            mesh.material = mat;

            if (isShellType) {
                mesh.enableEdgesRendering(0.9, true);
                mesh.edgesWidth = 2.0;
                mesh.edgesColor = new Color4(1, 1, 1, 0.85);
            }

            mesh.freezeWorldMatrix();
            // FIX: Start pickable; applyMeshStates will set false when hidden
            mesh.isPickable = true;
        });

        return { meshes: geometryMeshes, success: geometryMeshes.length > 0, compartmentName, componentName, componentType };
    } catch (error) {
        console.error(`Error loading GLB: ${filePath}`, error);
        return { meshes: [], success: false };
    }
};

// ─── Emissive constants ───────────────────────────────────────────────────────

const EMISSIVE_NONE     = new Color3(0, 0, 0);
const EMISSIVE_PART     = new Color3(0, 0.55, 0.1);
const EMISSIVE_COMP     = new Color3(0, 0.2, 0);
const EMISSIVE_MILD     = new Color3(0, 0.08, 0);
const EMISSIVE_SELECTED = new Color3(0.05, 0.28, 0.08);

function getOrCreateSelectionMaterial(mesh, scene) {
    const selMatName = `${mesh.material.name}_SEL`;
    let selMat = scene.getMaterialByName(selMatName);
    if (!selMat) selMat = mesh.material.clone(selMatName);
    selMat.emissiveColor = EMISSIVE_PART;
    return selMat;
}

// ─── applyMeshStates ──────────────────────────────────────────────────────────
// FIX: also sets mesh.isPickable = visible so hidden meshes are never raycasted

function applyMeshStates({
    loadedCompartments, compartmentVisibility, componentTypeVisibility,
    viewMode, selectedCompartment, selectedPart, selectedComponentType,
    hiddenParts, scene,
}) {
    Object.values(loadedCompartments).forEach((compartment) => {
        Object.values(compartment.loadedComponents).forEach((component) => {
            (component.meshes || []).forEach((mesh) => {
                if (!mesh || mesh.isDisposed() || !mesh.material) return;

                const isShellType  = SHELL_TYPES.has(component.type);
                const isInterior   = INTERIOR_TYPES.has(component.type);
                const partId       = `${compartment.compartmentName}-${mesh.name}`;

                // ── Visibility ────────────────────────────────────────────────
                let visible =
                    compartmentVisibility[compartment.compartmentName] !== false &&
                    componentTypeVisibility[component.type] !== false;

                if (viewMode === 'asset' && isInterior) visible = false;

                if (viewMode === 'compartment' || viewMode === 'hullPart') {
                    visible = visible && compartment.compartmentName === selectedCompartment;
                }
                if (viewMode === 'hullPart' && selectedComponentType) {
                    visible = visible && component.type === selectedComponentType;
                }
                if (viewMode === 'compartment' && hiddenParts.has(partId)) visible = false;

                mesh.isVisible  = visible;
                // FIX: disable picking on hidden meshes so they don't intercept raycasts
                mesh.isPickable = visible;

                if (!visible) {
                    const baseMat = scene?.getMaterialByName(`mat_${component.type}_${compartment.compartmentName}`);
                    if (baseMat && mesh.material !== baseMat) mesh.material = baseMat;
                    return;
                }

                // ── Emissive / highlight ──────────────────────────────────────
                const isPartSelected      = selectedPart === partId && viewMode === 'compartment';
                const isAssetSelected     = selectedCompartment === compartment.compartmentName && viewMode === 'asset';
                const isInOpenCompartment = viewMode === 'compartment' && compartment.compartmentName === selectedCompartment;

                const baseMat = scene?.getMaterialByName(`mat_${component.type}_${compartment.compartmentName}`);

                if (isPartSelected) {
                    if (scene) mesh.material = getOrCreateSelectionMaterial(baseMat || mesh.material, scene);
                    mesh.enableEdgesRendering(0.9, true);
                    mesh.edgesWidth = 6.0;
                    mesh.edgesColor = new Color4(0.2, 1.0, 0.4, 1.0);
                } else {
                    if (baseMat && mesh.material !== baseMat) mesh.material = baseMat;

                    if (isAssetSelected) {
                        mesh.material.emissiveColor = EMISSIVE_SELECTED;
                        if (isShellType) {
                            mesh.enableEdgesRendering(0.9, true);
                            mesh.edgesWidth = 4.0;
                            mesh.edgesColor = new Color4(0.3, 1.0, 0.5, 1.0);
                        }
                    } else if (isInOpenCompartment) {
                        mesh.material.emissiveColor = EMISSIVE_MILD;
                        if (!isShellType && mesh._edgesRenderer) mesh.disableEdgesRendering();
                    } else {
                        mesh.material.emissiveColor = EMISSIVE_NONE;
                        if (!isShellType && mesh._edgesRenderer) mesh.disableEdgesRendering();
                        if (isShellType && mesh._edgesRenderer) {
                            mesh.edgesWidth = 2.0;
                            mesh.edgesColor = new Color4(1, 1, 1, 0.85);
                        }
                    }
                }
            });
        });
    });
}

// ─── Camera animation ─────────────────────────────────────────────────────────

function animateCameraTo(camera, scene, targetCenter, targetRadius, durationFrames = 30) {
    if (!camera || !scene) return;
    const clampedRadius = Math.max(
        camera.lowerRadiusLimit || 1,
        Math.min(camera.upperRadiusLimit || 3000, targetRadius)
    );
    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    Animation.CreateAndStartAnimation('camTargetX', camera, 'target.x', 60, durationFrames, camera.target.x, targetCenter.x, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    Animation.CreateAndStartAnimation('camTargetY', camera, 'target.y', 60, durationFrames, camera.target.y, targetCenter.y, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    Animation.CreateAndStartAnimation('camTargetZ', camera, 'target.z', 60, durationFrames, camera.target.z, targetCenter.z, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    Animation.CreateAndStartAnimation('camRadius',  camera, 'radius',   60, durationFrames, camera.radius,   clampedRadius,  Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
}

function animateCameraAngle(camera, scene, targetAlpha, targetBeta, durationFrames = 40) {
    if (!camera || !scene) return;
    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    Animation.CreateAndStartAnimation('camAlpha', camera, 'alpha', 60, durationFrames, camera.alpha, targetAlpha, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    Animation.CreateAndStartAnimation('camBeta',  camera, 'beta',  60, durationFrames, camera.beta,  targetBeta,  Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
}

const centerModel = (scene, meshes, camera, animate = false) => {
    const valid = meshes.filter((m) => m && !m.isDisposed() && m.getTotalVertices() > 0);
    if (!valid.length) return;
    valid.forEach((m) => m.refreshBoundingInfo());

    let min = new Vector3(Infinity, Infinity, Infinity);
    let max = new Vector3(-Infinity, -Infinity, -Infinity);
    valid.forEach((mesh) => {
        const bi = mesh.getBoundingInfo();
        if (!bi) return;
        min = Vector3.Minimize(min, bi.boundingBox.minimumWorld);
        max = Vector3.Maximize(max, bi.boundingBox.maximumWorld);
    });

    const center  = Vector3.Center(min, max);
    const size    = max.subtract(min);
    const maxDim  = Math.max(size.x, size.y, size.z);
    const fov     = camera.fov || Math.PI / 4;
    const fitDist = ((maxDim / 2) / Math.tan(fov / 2)) * 1.8;

    camera.lowerRadiusLimit = fitDist * 0.05;
    camera.upperRadiusLimit = fitDist * 12;

    if (animate) {
        animateCameraTo(camera, scene, center, fitDist);
    } else {
        camera.target = center;
        camera.radius = fitDist;
        camera.alpha  = -Math.PI / 4;
        camera.beta   = Math.PI / 3;
    }
};

// ─── Axis Controls UI ─────────────────────────────────────────────────────────
// Floating panel: snap camera to X / Y / Z axis views + step-rotate buttons

const AXIS_VIEWS = [
    { label: '+Y',  title: 'Top',    alpha: -Math.PI / 2, beta: 0.01 },
    { label: '−Y',  title: 'Bottom', alpha: -Math.PI / 2, beta: Math.PI - 0.01 },
    { label: '+Z',  title: 'Front',  alpha: -Math.PI / 2, beta: Math.PI / 2 },
    { label: '−Z',  title: 'Back',   alpha:  Math.PI / 2, beta: Math.PI / 2 },
    { label: '+X',  title: 'Right',  alpha:  0,           beta: Math.PI / 2 },
    { label: '−X',  title: 'Left',   alpha:  Math.PI,     beta: Math.PI / 2 },
    { label: '⟳',   title: 'Iso',    alpha: -Math.PI / 4, beta: Math.PI / 3 },
];

const STEP = Math.PI / 12; // 15°

const AxisControls = ({ sceneRef }) => {
    const snapTo = (alpha, beta) => {
        const cam = sceneRef.current?.activeCamera;
        if (cam) animateCameraAngle(cam, sceneRef.current, alpha, beta);
    };
    const rotateAlpha = (dir) => {
        const cam = sceneRef.current?.activeCamera;
        if (cam) animateCameraAngle(cam, sceneRef.current, cam.alpha + dir * STEP, cam.beta);
    };
    const rotateBeta = (dir) => {
        const cam = sceneRef.current?.activeCamera;
        if (!cam) return;
        const next = Math.max(0.05, Math.min(Math.PI * 0.49, cam.beta + dir * STEP));
        animateCameraAngle(cam, sceneRef.current, cam.alpha, next);
    };

    const panel = {
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        userSelect: 'none',
    };
    const group = {
        display: 'flex',
        flexDirection: 'column',
        background: 'rgba(18,28,40,0.88)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 10,
        overflow: 'hidden',
        backdropFilter: 'blur(8px)',
    };
    const rowStyle = { display: 'flex' };
    const btnBase = {
        width: 46,
        height: 34,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.02em',
        cursor: 'pointer',
        color: 'rgba(200,220,255,0.85)',
        background: 'transparent',
        border: 'none',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        transition: 'background 0.12s, color 0.12s',
        fontFamily: 'system-ui, sans-serif',
    };

    const Btn = ({ onClick, title, children, style = {} }) => {
        const [hov, setHov] = useState(false);
        return (
            <button
                onClick={onClick}
                title={title}
                style={{
                    ...btnBase,
                    ...style,
                    background: hov ? 'rgba(77,162,255,0.18)' : 'transparent',
                    color: hov ? '#7dd4fc' : 'rgba(200,220,255,0.85)',
                }}
                onMouseEnter={() => setHov(true)}
                onMouseLeave={() => setHov(false)}
            >
                {children}
            </button>
        );
    };

    // Label strip
    const label = {
        padding: '4px 0 2px',
        textAlign: 'center',
        fontSize: 9,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: 'rgba(150,180,220,0.5)',
        fontFamily: 'system-ui, sans-serif',
    };

    return (
        <div style={panel}>
            {/* Axis snap views */}
            <div style={group}>
                <div style={label}>Axis Views</div>
                <div style={rowStyle}>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[0].alpha, AXIS_VIEWS[0].beta)} title="Top (+Y)">Top</Btn>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[1].alpha, AXIS_VIEWS[1].beta)} title="Bottom (−Y)">Bot</Btn>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[6].alpha, AXIS_VIEWS[6].beta)} title="Isometric" style={{ borderRight: 'none' }}>Iso</Btn>
                </div>
                <div style={rowStyle}>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[2].alpha, AXIS_VIEWS[2].beta)} title="Front (+Z)">Frt</Btn>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[3].alpha, AXIS_VIEWS[3].beta)} title="Back (−Z)">Bck</Btn>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[4].alpha, AXIS_VIEWS[4].beta)} title="Right (+X)" style={{ borderRight: 'none' }}>Rgt</Btn>
                </div>
                <div style={rowStyle}>
                    <Btn onClick={() => snapTo(AXIS_VIEWS[5].alpha, AXIS_VIEWS[5].beta)} title="Left (−X)" style={{ borderBottom: 'none' }}>Lft</Btn>
                </div>
            </div>

            {/* Step-rotate controls */}
            <div style={group}>
                <div style={label}>Rotate</div>
                {/* Orbit left/right = alpha */}
                <div style={rowStyle}>
                    <Btn onClick={() => rotateAlpha(-1)} title="Rotate left (−X orbit)" style={{ width: 69, borderBottom: 'none' }}>
                        ← X
                    </Btn>
                    <Btn onClick={() => rotateAlpha(+1)} title="Rotate right (+X orbit)" style={{ width: 69, borderRight: 'none', borderBottom: 'none' }}>
                        X →
                    </Btn>
                </div>
                {/* Elevation up/down = beta */}
                <div style={{ ...rowStyle, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <Btn onClick={() => rotateBeta(-1)} title="Tilt up (−Y)" style={{ width: 69 }}>
                        ↑ Y
                    </Btn>
                    <Btn onClick={() => rotateBeta(+1)} title="Tilt down (+Y)" style={{ width: 69, borderRight: 'none' }}>
                        Y ↓
                    </Btn>
                </div>
            </div>
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

const BabylonScene = () => {
    const HEADER_HEIGHT = 54;
    const SIDEBAR_WIDTH = 300;

    const canvasRef  = useRef(null);
    const sceneRef   = useRef(null);
    const engineRef  = useRef(null);

    const handleCompartmentSelectRef = useRef(null);
    const loadedCompartmentsRef      = useRef({});

    const compartmentNames = useMemo(() => getCompartmentNamesFromShipData(), []);

    // ── State ────────────────────────────────────────────────────────────────
    const [loadedCompartments,      setLoadedCompartments]      = useState({});
    const [loadingProgress,         setLoadingProgress]         = useState({ loaded: 0, total: 0 });
    const [organizedCompartments]                               = useState(initialOrganizedCompartments);
    const [compartmentVisibility,   setCompartmentVisibility]   = useState({});
    const [componentTypeVisibility, setComponentTypeVisibility] = useState({
        plates: true, brackets: true, stiffeners: true,
        compartment: true, shell: true, shells: true,
    });

    const [viewMode,              setViewMode]             = useState('asset');
    const [selectedCompartment,   setSelectedCompartment]  = useState(null);
    const [selectedPart,          setSelectedPart]         = useState(null);
    const [contextMenu,           setContextMenu]          = useState({ visible: false, position: { x: 0, y: 0 } });
    const [isolatedCompartments,  setIsolatedCompartments] = useState(new Set());
    const [isolatedParts,         setIsolatedParts]        = useState(new Set());
    const [hiddenParts,           setHiddenParts]          = useState(new Set());
    const [selectedComponentType, setSelectedComponentType]= useState(null);
    const [gaugingPointsEnabled,  setGaugingPointsEnabled] = useState(false);

    useEffect(() => { loadedCompartmentsRef.current = loadedCompartments; }, [loadedCompartments]);

    useEffect(() => {
        const init = {};
        compartmentNames.forEach((n) => { init[n] = true; });
        setCompartmentVisibility(init);
    }, [compartmentNames]);

    // ── Camera centering ─────────────────────────────────────────────────────
    const centerOnSelection = useCallback((targetType, targetName) => {
        const scene = sceneRef.current;
        if (!scene) return;
        const camera = scene.activeCamera;
        if (!camera) return;

        let min = new Vector3(Infinity, Infinity, Infinity);
        let max = new Vector3(-Infinity, -Infinity, -Infinity);
        let hasBounds = false;

        scene.meshes.forEach((mesh) => {
            if (!mesh.metadata || !mesh.isVisible) return;
            const match =
                targetType === 'compartment'
                    ? mesh.metadata.compartmentName === targetName
                    : `${mesh.metadata.compartmentName}-${mesh.name}` === targetName;
            if (!match) return;
            mesh.computeWorldMatrix(true);
            mesh.refreshBoundingInfo();
            const bi = mesh.getBoundingInfo();
            if (!bi) return;
            min = Vector3.Minimize(min, bi.boundingBox.minimumWorld);
            max = Vector3.Maximize(max, bi.boundingBox.maximumWorld);
            hasBounds = true;
        });

        if (hasBounds) {
            const center  = Vector3.Center(min, max);
            const size    = max.subtract(min);
            const maxDim  = Math.max(size.x, size.y, size.z);
            const fov     = camera.fov || Math.PI / 4;
            const fitDist = ((maxDim / 2) / Math.tan(fov / 2)) * 1.8;
            animateCameraTo(camera, scene, center, fitDist);
        }
    }, []);

    // ── Lazy interior loader ──────────────────────────────────────────────────
    const loadCompartmentInterior = useCallback(async (compartmentName) => {
        const scene = sceneRef.current;
        if (!scene) return;

        const compartmentData = organizedCompartments[compartmentName];
        if (!compartmentData) return;

        const interiorFiles = Object.values(compartmentData.components)
            .filter((comp) => INTERIOR_TYPES.has(comp.type))
            .map((comp) => ({ type: comp.type, data: comp, compartmentName }));

        if (interiorFiles.length === 0) return;

        setLoadingProgress({ loaded: 0, total: interiorFiles.length });

        const current = loadedCompartmentsRef.current;
        Object.entries(current).forEach(([cName, compartment]) => {
            if (cName === compartmentName) return;
            Object.values(compartment.loadedComponents || {}).forEach((comp) => {
                if (!INTERIOR_TYPES.has(comp.type)) return;
                (comp.meshes || []).forEach((mesh) => {
                    if (mesh && !mesh.isDisposed()) mesh.dispose(false, true);
                });
            });
        });

        const newLoaded = {};
        Object.entries(current).forEach(([cName, compartment]) => {
            const filteredComponents = {};
            Object.entries(compartment.loadedComponents || {}).forEach(([type, comp]) => {
                if (SHELL_TYPES.has(comp.type)) filteredComponents[type] = comp;
            });
            newLoaded[cName] = { ...compartment, loadedComponents: filteredComponents };
        });

        if (!newLoaded[compartmentName]) {
            newLoaded[compartmentName] = { ...compartmentData, loadedComponents: {} };
        }

        let allInteriorMeshes = [];
        for (const { type, data } of interiorFiles) {
            const result = await loadGLBFile(scene, data.path, compartmentName, data.name, type);
            setLoadingProgress((prev) => ({ ...prev, loaded: prev.loaded + 1 }));
            if (result.success) {
                newLoaded[compartmentName].loadedComponents[type] = { ...data, meshes: result.meshes };
                allInteriorMeshes.push(...result.meshes);
            }
        }

        setLoadedCompartments({ ...newLoaded });
        loadedCompartmentsRef.current = { ...newLoaded };
        setTimeout(() => setLoadingProgress({ loaded: 0, total: 0 }), 400);
        return allInteriorMeshes;
    }, [organizedCompartments]);

    // ── applySceneState ───────────────────────────────────────────────────────
    const applySceneState = useCallback((overrides = {}) => {
        applyMeshStates({
            loadedCompartments:      loadedCompartmentsRef.current,
            compartmentVisibility,
            componentTypeVisibility,
            viewMode,
            selectedCompartment,
            selectedPart,
            selectedComponentType,
            hiddenParts,
            scene: sceneRef.current,
            ...overrides,
        });
    }, [compartmentVisibility, componentTypeVisibility, viewMode, selectedCompartment, selectedPart, selectedComponentType, hiddenParts]);

    useEffect(() => {
        if (Object.keys(loadedCompartments).length === 0) return;
        applySceneState();
    }, [loadedCompartments, compartmentVisibility, componentTypeVisibility, viewMode, selectedCompartment, selectedPart, selectedComponentType, hiddenParts]);

    useEffect(() => {
        if (viewMode === 'compartment' && selectedCompartment) {
            setTimeout(() => centerOnSelection('compartment', selectedCompartment), 80);
        } else if (viewMode === 'hullPart' && selectedPart) {
            setTimeout(() => centerOnSelection('part', selectedPart), 80);
        }
    }, [viewMode, selectedCompartment, selectedPart, centerOnSelection]);

    useEffect(() => {
        if (isolatedCompartments.size === 1) {
            setTimeout(() => centerOnSelection('compartment', Array.from(isolatedCompartments)[0]), 80);
        } else if (isolatedParts.size === 1) {
            setTimeout(() => centerOnSelection('part', Array.from(isolatedParts)[0]), 80);
        }
    }, [isolatedCompartments, isolatedParts, centerOnSelection]);

    useEffect(() => {
        if (!contextMenu.visible) return;
        const close = () => setContextMenu((p) => ({ ...p, visible: false }));
        document.addEventListener('click', close);
        return () => document.removeEventListener('click', close);
    }, [contextMenu.visible]);

    // ── Action handlers ───────────────────────────────────────────────────────

    const handleShowAll = useCallback(() => {
        setIsolatedCompartments(new Set());
        const allVisible = {};
        Object.keys(loadedCompartmentsRef.current).forEach((n) => { allVisible[n] = true; });
        setCompartmentVisibility(allVisible);
    }, []);

    const handleReset = useCallback(() => {
        setViewMode('asset');
        setSelectedCompartment(null);
        setSelectedPart(null);
        setSelectedComponentType(null);
        setIsolatedCompartments(new Set());
        setIsolatedParts(new Set());
        setHiddenParts(new Set());
        handleShowAll();
    }, [handleShowAll]);

    const handleHide = useCallback((compartmentName) => {
        setCompartmentVisibility((prev) => ({ ...prev, [compartmentName]: false }));
    }, []);

    const handleIsolateCompartment = useCallback((compartmentName) => {
        setIsolatedCompartments((prev) => {
            if (prev.has(compartmentName)) {
                const all = {};
                Object.keys(organizedCompartments).forEach((k) => { all[k] = true; });
                setCompartmentVisibility(all);
                return new Set();
            }
            return new Set([compartmentName]);
        });
    }, [organizedCompartments]);

    const handleHidePart = useCallback((partId) => {
        setHiddenParts((prev) => new Set([...prev, partId]));
    }, []);

    const togglePartVisibility = useCallback((partId) => {
        if (!partId) return;
        setHiddenParts((prev) => {
            const next = new Set(prev);
            next.has(partId) ? next.delete(partId) : next.add(partId);
            return next;
        });
    }, []);

    const toggleCompartmentVisibility = useCallback((compartmentName) => {
        setCompartmentVisibility((prev) => {
            const next = { ...prev, [compartmentName]: !prev[compartmentName] };
            applyMeshStates({
                loadedCompartments: loadedCompartmentsRef.current,
                compartmentVisibility: next,
                componentTypeVisibility, viewMode, selectedCompartment,
                selectedPart, selectedComponentType, hiddenParts,
                scene: sceneRef.current,
            });
            return next;
        });
    }, [componentTypeVisibility, viewMode, selectedCompartment, selectedPart, selectedComponentType, hiddenParts]);

    const toggleComponentTypeVisibility = useCallback((componentType) => {
        setComponentTypeVisibility((prev) => {
            const next = { ...prev, [componentType]: !prev[componentType] };
            applyMeshStates({
                loadedCompartments: loadedCompartmentsRef.current,
                compartmentVisibility,
                componentTypeVisibility: next,
                viewMode, selectedCompartment, selectedPart, selectedComponentType, hiddenParts,
                scene: sceneRef.current,
            });
            return next;
        });
    }, [compartmentVisibility, viewMode, selectedCompartment, selectedPart, selectedComponentType, hiddenParts]);

    // ── Navigation ────────────────────────────────────────────────────────────

    const enterCompartmentView = useCallback((compartmentName) => {
        if (!compartmentName) return;

        const alreadyLoaded = loadedCompartmentsRef.current[compartmentName];
        const hasInterior   = alreadyLoaded && Object.values(alreadyLoaded.loadedComponents || {})
            .some((c) => INTERIOR_TYPES.has(c.type));

        setSelectedCompartment(compartmentName);
        setSelectedPart(null);
        setSelectedComponentType(null);
        setViewMode('compartment');
        setIsolatedParts(new Set());
        setHiddenParts(new Set());

        if (!hasInterior) {
            loadCompartmentInterior(compartmentName).then((meshes) => {
                if (meshes && meshes.length > 0) {
                    const scene  = sceneRef.current;
                    const camera = scene?.activeCamera;
                    if (scene && camera) setTimeout(() => centerModel(scene, meshes, camera, true), 100);
                }
            });
        }
    }, [loadCompartmentInterior]);

    const handleEnterCompartmentView  = useCallback(() => {
        if (selectedCompartment && viewMode === 'asset') enterCompartmentView(selectedCompartment);
    }, [selectedCompartment, viewMode, enterCompartmentView]);

    const handleEnterHullPartView     = useCallback(() => {
        if (selectedComponentType && selectedCompartment && viewMode === 'compartment') setViewMode('hullPart');
    }, [selectedComponentType, selectedCompartment, viewMode]);

    const handleBackToAssetView       = useCallback(() => {
        setViewMode('asset');
        setSelectedCompartment(null);
        setSelectedPart(null);
        setSelectedComponentType(null);
        setIsolatedParts(new Set());
        setHiddenParts(new Set());
    }, []);

    const handleBackToCompartmentView = useCallback(() => {
        setViewMode('compartment');
        setSelectedPart(null);
        setSelectedComponentType(null);
    }, []);

    const handleSelectComponentType   = useCallback((componentType) => {
        if (viewMode === 'compartment' && selectedCompartment) setSelectedComponentType(componentType);
    }, [viewMode, selectedCompartment]);

    // ── Context action dispatcher ─────────────────────────────────────────────

    const handleContextAction = useCallback((action) => {
        switch (action) {
            case 'compartmentView':   handleEnterCompartmentView();   break;
            case 'hullPartView':      handleEnterHullPartView();      break;
            case 'backToAsset':       handleBackToAssetView();        break;
            case 'backToCompartment': handleBackToCompartmentView();  break;
            case 'hide':
                if (viewMode === 'compartment' && selectedPart) {
                    handleHidePart(selectedPart);
                    sceneRef.current?.meshes.forEach((mesh) => {
                        if (`${selectedCompartment}-${mesh.name}` === selectedPart) {
                            mesh.isVisible  = false;
                            mesh.isPickable = false;
                        }
                    });
                } else if (viewMode === 'asset' && selectedCompartment) {
                    handleHide(selectedCompartment);
                }
                break;
            case 'fitToScreen': {
                const scene = sceneRef.current;
                if (!scene) break;
                if (viewMode === 'compartment' && selectedCompartment) {
                    centerOnSelection('compartment', selectedCompartment);
                } else if (viewMode === 'hullPart' && selectedPart) {
                    centerOnSelection('part', selectedPart);
                } else {
                    const all = scene.meshes.filter((m) => m.isVisible && m.getTotalVertices?.() > 0);
                    centerModel(scene, all, scene.activeCamera, true);
                }
                break;
            }
            case 'isolate': handleIsolateCompartment(selectedCompartment); break;
            case 'showAll': handleShowAll();  break;
            case 'reset':   handleReset();    break;
        }
    }, [
        viewMode, selectedCompartment, selectedPart,
        handleEnterCompartmentView, handleEnterHullPartView,
        handleBackToAssetView, handleBackToCompartmentView,
        handleHide, handleHidePart, handleShowAll, handleReset,
        handleIsolateCompartment, centerOnSelection,
    ]);

    // ─────────────────────────────────────────────────────────────────────────
    // ── handleCompartmentSelect
    //
    //  LEFT CLICK
    //   asset view        → toggle compartment highlight (no view change)
    //   compartment view  → toggle part selection
    //   empty canvas      → deselect everything
    //
    //  RIGHT CLICK
    //   any view          → select compartment/part + open context menu
    //
    //  SIDEBAR CLICK (partId === null)
    //   → always enter compartment view (lazy-load interior)
    // ─────────────────────────────────────────────────────────────────────────

    const handleCompartmentSelect = useCallback((compartmentName, partId, position, isRightClick) => {

        // ── RIGHT CLICK → select + open context menu ─────────────────────────
        if (isRightClick) {
            if (compartmentName) setSelectedCompartment(compartmentName);
            if (partId && (viewMode === 'compartment' || viewMode === 'hullPart')) {
                setSelectedPart(partId);
            }
            if (position) setContextMenu({ visible: true, position });
            return;
        }

        // ── Close context menu on any left click ─────────────────────────────
        setContextMenu({ visible: false, position: { x: 0, y: 0 } });

        // ── SIDEBAR CLICK (no partId) → enter compartment view ───────────────
        if (!partId && compartmentName) {
            enterCompartmentView(compartmentName);
            return;
        }

        // ── LEFT CLICK in ASSET view → highlight only ────────────────────────
        if (viewMode === 'asset' && compartmentName) {
            setSelectedCompartment((prev) => (prev === compartmentName ? null : compartmentName));
            setSelectedPart(null);
            return;
        }

        // ── LEFT CLICK in COMPARTMENT view → toggle part ─────────────────────
        if ((viewMode === 'compartment' || viewMode === 'hullPart')
            && compartmentName === selectedCompartment) {
            setSelectedPart((prev) => (prev === partId ? null : partId));
            return;
        }

        // ── LEFT CLICK on a different compartment mesh (edge case) ────────────
        if ((viewMode === 'compartment' || viewMode === 'hullPart') && compartmentName) {
            setSelectedCompartment(compartmentName);
            setSelectedPart(null);
        }
    }, [viewMode, selectedCompartment, enterCompartmentView]);

    useEffect(() => { handleCompartmentSelectRef.current = handleCompartmentSelect; }, [handleCompartmentSelect]);

    // ── Babylon engine init (runs once) ───────────────────────────────────────

    useEffect(() => {
        if (!canvasRef.current) return;

        const engine = new Engine(canvasRef.current, true, {
            alpha: true, premultipliedAlpha: false,
            preserveDrawingBuffer: true, adaptToDeviceRatio: true,
        });
        engineRef.current = engine;
        setTimeout(() => engine.resize(), 100);

        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.878, 0.914, 0.941, 1.0);
        sceneRef.current = scene;

        const camera = new ArcRotateCamera('Camera', -Math.PI / 2, Math.PI / 3, 100, Vector3.Zero(), scene);
        camera.attachControl(canvasRef.current, true);
        camera.inertia              = 0.88;
        camera.angularSensibilityX  = 700;
        camera.angularSensibilityY  = 700;
        camera.panningSensibility   = 80;
        camera.wheelDeltaPercentage = 0.012;
        camera.pinchDeltaPercentage = 0.012;
        camera.minZ                 = 0.5;
        camera.maxZ                 = 8000;
        camera.lowerRadiusLimit     = 1;
        camera.upperRadiusLimit     = 5000;
        camera.lowerBetaLimit       = 0.05;
        camera.upperBetaLimit       = Math.PI * 0.49;

        const hemi = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
        hemi.intensity   = 1.2;
        hemi.diffuse     = new Color3(1, 1, 1);
        hemi.specular    = new Color3(0, 0, 0);
        hemi.groundColor = new Color3(0.4, 0.4, 0.4);

        const dir1 = new DirectionalLight('dir1', new Vector3(-1, -1, -0.5), scene);
        dir1.intensity = 0.5; dir1.specular = new Color3(0, 0, 0);

        const dir2 = new DirectionalLight('dir2', new Vector3(1, -0.5, 0.5), scene);
        dir2.intensity = 0.3; dir2.specular = new Color3(0, 0, 0);

        scene.skipFrustumClipping         = false;
        scene.autoClear                   = true;
        scene.autoClearDepthAndStencil    = true;
        scene.blockMaterialDirtyMechanism = true;
        engine.setHardwareScalingLevel(1.0);

        // ── Pointer handling ──────────────────────────────────────────────────
        const canvas = canvasRef.current;
        let pointerDownX = 0, pointerDownY = 0, isDrag = false;

        const onPointerDown = (e) => {
            pointerDownX = e.clientX; pointerDownY = e.clientY; isDrag = false;
        };
        const onPointerMove = (e) => {
            const dx = e.clientX - pointerDownX, dy = e.clientY - pointerDownY;
            if (Math.sqrt(dx * dx + dy * dy) > 6) isDrag = true;
        };

        /**
         * FIX: Pass predicate `m => m.isVisible && m.isPickable` to scene.pick
         * so that hidden meshes (e.g. shells of other compartments in compartment view)
         * are NEVER hit-tested and do not swallow clicks meant for visible interior meshes.
         */
        const PICK_PREDICATE = (m) => m.isVisible && m.isPickable;

        const pick = (clientX, clientY, isRight) => {
            const rect    = canvas.getBoundingClientRect();
            const canvasX = clientX - rect.left;
            const canvasY = clientY - rect.top;

            // FIX: supply predicate — only visible+pickable meshes are candidates
            const r   = scene.pick(canvasX, canvasY, PICK_PREDICATE);
            const pos = { x: clientX, y: clientY };

            if (r.hit && r.pickedMesh?.metadata?.compartmentName) {
                const { compartmentName } = r.pickedMesh.metadata;
                const partId = `${compartmentName}-${r.pickedMesh.name || 'unnamed'}`;
                handleCompartmentSelectRef.current?.(compartmentName, partId, pos, isRight, r.pickedMesh);
            } else if (!isRight) {
                // Click on empty canvas → deselect everything
                setSelectedCompartment(null);
                setSelectedPart(null);
                setContextMenu({ visible: false, position: { x: 0, y: 0 } });
            }
            // Right-click on empty canvas → no-op (no target to act on)
        };

        const onPointerUp = (e) => { if (!isDrag && e.button === 0) pick(e.clientX, e.clientY, false); };
        const onCtxMenu   = (e) => { e.preventDefault(); if (!isDrag) pick(e.clientX, e.clientY, true); };

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup',   onPointerUp);
        canvas.addEventListener('contextmenu', onCtxMenu);
        canvas.style.cursor      = 'grab';
        canvas.style.touchAction = 'none';

        // ── Initial load: shells only ─────────────────────────────────────────
        const loadAllShells = async () => {
            const shellFiles = [];
            Object.values(initialOrganizedCompartments).forEach((compartment) => {
                const shellComp = compartment.components['shells'] || compartment.components['shell'];
                if (shellComp) shellFiles.push({ type: shellComp.type, data: shellComp, compartmentName: compartment.compartmentName });
            });

            setLoadingProgress({ loaded: 0, total: shellFiles.length });

            const newLoaded = {};
            Object.keys(initialOrganizedCompartments).forEach((k) => {
                newLoaded[k] = { ...initialOrganizedCompartments[k], loadedComponents: {} };
            });

            let allMeshes = [];
            const BATCH = 6;
            for (let i = 0; i < shellFiles.length; i += BATCH) {
                const batch = shellFiles.slice(i, i + BATCH);
                const results = await Promise.all(
                    batch.map(({ type, data, compartmentName }) =>
                        loadGLBFile(scene, data.path, compartmentName, data.name, type).then((result) => {
                            setLoadingProgress((prev) => ({ ...prev, loaded: prev.loaded + 1 }));
                            return { type, data, result, compartmentName };
                        })
                    )
                );
                results.forEach(({ type, data, result, compartmentName }) => {
                    if (result.success) {
                        newLoaded[compartmentName].loadedComponents[type] = { ...data, meshes: result.meshes };
                        allMeshes.push(...result.meshes);
                    }
                });
            }

            setLoadedCompartments(newLoaded);
            loadedCompartmentsRef.current = newLoaded;

            const initVis = {};
            Object.keys(newLoaded).forEach((n) => { initVis[n] = true; });
            setCompartmentVisibility(initVis);

            if (allMeshes.length > 0) {
                setTimeout(() => {
                    if (sceneRef.current) centerModel(sceneRef.current, allMeshes, sceneRef.current.activeCamera, false);
                }, 300);
            }
            setTimeout(() => setLoadingProgress({ loaded: 0, total: 0 }), 400);
        };

        loadAllShells();
        engine.runRenderLoop(() => scene.render());

        const onResize = () => engine.resize();
        window.addEventListener('resize', onResize);

        return () => {
            window.removeEventListener('resize', onResize);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup',   onPointerUp);
            canvas.removeEventListener('contextmenu', onCtxMenu);
            scene.dispose();
            engine.dispose();
        };
    }, []);

    // ── Breadcrumbs ───────────────────────────────────────────────────────────

    const getFunctionalityGroup = (name) => {
        if (!name) return '';
        const u = name.toUpperCase();
        if (/^CARGO_TANK/.test(u))      return 'Cargo';
        if (/^AFT_PEAK/.test(u))        return 'Aft Peak';
        if (/^FORE_PEAK/.test(u))       return 'Fore Peak';
        if (/^ENGINE_ROOM/.test(u))     return 'Engine Room';
        if (/^CHAIN_LOCKER/.test(u))    return 'Chain Locker';
        if (/^DISTILLED_WATER/.test(u)) return 'Distilled Water';
        if (/^FWD_DEEP/.test(u))        return 'Fwd Deep';
        if (/^POTABLE_WATER/.test(u))   return 'Potable Water';
        if (/^PUMP_ROOM/.test(u))       return 'Pump Room';
        if (/^SLOP_TANK/.test(u))       return 'Slop Tank';
        if (/^STEERING_GEAR/.test(u))   return 'Steering Gear';
        if (/^STERN_TB/.test(u))        return 'Stern TB';
        if (/^STORAGE_SPACES/.test(u))  return 'Storage Spaces';
        return name.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };

    const renderBreadcrumbs = () => {
        const sep  = <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.4)' }}>/</span>;
        const link = (label, onClick) => (
            <span
                style={{ color: '#4DA2FF', cursor: 'pointer' }}
                onClick={onClick}
                onMouseEnter={(e) => (e.target.style.color = '#73bbff')}
                onMouseLeave={(e) => (e.target.style.color = '#4DA2FF')}
            >
                {label}
            </span>
        );

        const crumbs = [link('TEST FPSO', handleReset)];

        if (selectedCompartment && viewMode !== 'asset') {
            const fg = getFunctionalityGroup(selectedCompartment);
            if (fg) { crumbs.push(sep); crumbs.push(<span key="fg" style={{ color: '#4DA2FF' }}>{fg}</span>); }
            crumbs.push(sep);
            crumbs.push(
                selectedPart
                    ? link(selectedCompartment.replace(/_/g, ' '), () =>
                        handleCompartmentSelectRef.current?.(selectedCompartment, null, null, false))
                    : <span key="comp" style={{ color: 'rgba(255,255,255,0.92)' }}>{selectedCompartment.replace(/_/g, ' ')}</span>
            );
            if (selectedPart) {
                crumbs.push(sep);
                crumbs.push(<span key="part" style={{ color: 'rgba(255,255,255,0.92)' }}>{selectedPart.split('-').slice(1).join('-')}</span>);
            }
        } else {
            crumbs.push(sep);
            crumbs.push(<span key="full" style={{ color: 'rgba(255,255,255,0.92)' }}>Full Asset</span>);
        }

        return (
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {crumbs}
            </div>
        );
    };

    const isLoading = loadingProgress.total > 0 && loadingProgress.loaded < loadingProgress.total;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ width: '100%', height: '100vh', position: 'relative' }}>

            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 5000 }}>
                <AppHeader breadcrumbs={renderBreadcrumbs()} />
            </div>

            <canvas
                ref={canvasRef}
                style={{
                    position: 'fixed',
                    top: HEADER_HEIGHT,
                    left: SIDEBAR_WIDTH,
                    width:  `calc(100% - ${SIDEBAR_WIDTH}px - ${viewMode !== 'asset' ? 220 : 0}px)`,
                    height: `calc(100vh - ${HEADER_HEIGHT}px)`,
                    display: 'block',
                    outline: 'none',
                    touchAction: 'none',
                    background: 'linear-gradient(180deg, #dce8f0 0%, #c8dae8 100%)',
                    zIndex: 1,
                }}
            />

            {Object.keys(loadedCompartments).length === 0 && !isLoading && (
                <div style={{
                    position: 'fixed', top: '50%', left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 500, textAlign: 'center', pointerEvents: 'none',
                    color: '#5a7fa8', fontFamily: 'Inter, system-ui, sans-serif',
                }}>
                    <svg width="64" height="64" fill="none" stroke="currentColor"
                        strokeWidth="1.2" viewBox="0 0 24 24"
                        style={{ opacity: 0.4, marginBottom: 16 }}>
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    <div style={{ fontSize: 16, fontWeight: 600, opacity: 0.6 }}>Select a compartment from the sidebar</div>
                    <div style={{ fontSize: 13, opacity: 0.4, marginTop: 6 }}>Click any compartment name to load its 3D model</div>
                </div>
            )}

            <LoadingPill progress={loadingProgress.loaded} total={loadingProgress.total} />

            {Object.keys(organizedCompartments).length > 0 && (
                <HierarchicalSidebar
                    shipData={TestFPSOStruc}
                    loadedCompartments={loadedCompartments}
                    loadingPhase={0}
                    isLoading={isLoading}
                    selectedCompartment={selectedCompartment}
                    selectedPart={selectedPart}
                    compartmentViewMode={viewMode === 'compartment'}
                    onCompartmentSelect={handleCompartmentSelect}
                    isolatedCompartments={isolatedCompartments}
                    isolatedParts={isolatedParts}
                    hiddenParts={hiddenParts}
                    onTogglePartVisibility={togglePartVisibility}
                    onShowAll={handleShowAll}
                    onReset={handleReset}
                    onBack={handleBackToAssetView}
                    onBackToCompartment={handleBackToCompartmentView}
                    viewMode={viewMode}
                    centerOnSelection={centerOnSelection}
                    compartmentVisibility={compartmentVisibility}
                    componentTypeVisibility={componentTypeVisibility}
                    onToggleCompartment={toggleCompartmentVisibility}
                    onToggleComponentType={toggleComponentTypeVisibility}
                    onSelectComponentType={handleSelectComponentType}
                    selectedComponentType={selectedComponentType}
                    onIsolateCompartment={handleIsolateCompartment}
                    gaugingPointsEnabled={gaugingPointsEnabled}
                    setGaugingPointsEnabled={setGaugingPointsEnabled}
                    topOffset={54}
                    hideBottomActions
                    hideGaugingPoints
                    hideComponentTypes
                />
            )}

            {viewMode !== 'asset' && (
                <ComponentTypesRail
                    componentTypeVisibility={componentTypeVisibility}
                    onToggle={toggleComponentTypeVisibility}
                />
            )}

            {/* ── Axis / Rotation controls (always visible bottom-right) ── */}
            <AxisControls sceneRef={sceneRef} />

            <ContextMenu
                position={contextMenu.position}
                visible={contextMenu.visible}
                selectedCompartment={selectedCompartment}
                selectedPart={selectedPart}
                selectedComponentType={selectedComponentType}
                compartmentViewMode={viewMode === 'compartment'}
                viewMode={viewMode}
                onClose={() => setContextMenu({ visible: false, position: { x: 0, y: 0 } })}
                onAction={handleContextAction}
            />
        </div>
    );
};

export default BabylonScene;