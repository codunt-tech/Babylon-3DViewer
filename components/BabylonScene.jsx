import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
    Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, StandardMaterial, Color3, Color4,
    DirectionalLight, SceneLoader, Animation, CubicEase, EasingFunction
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraKeyboardMoveInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput';
import { TestFPSOStruc } from '../src/shipData';
import { encodePartId, decodePartId, getPartDisplayName } from './partIdUtils';
import { ContextMenu, HierarchicalSidebar } from './babylonViewerUi';
import { AppHeader, LoadingPill, ComponentTypesRail, HEADER_HEIGHT as SHELL_HEADER_HEIGHT, SIDEBAR_WIDTH as SHELL_SIDEBAR_WIDTH } from './viewerShell';

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
const SHELL_TYPES = new Set(['shells', 'shell']);

const COMPONENT_COLORS = {
    brackets: new Color3(0.76, 0.71, 0.26),
    stiffeners: new Color3(0.73, 0.73, 0.73),
    plates: new Color3(0.286, 0.239, 0.459),
    shells: new Color3(0.29, 0.565, 0.886),
    shell: new Color3(0.29, 0.565, 0.886),
};
const DECK_COLOR = new Color3(0.561, 0.737, 0.561);
const DEFAULT_COLOR = new Color3(0.6, 0.6, 0.6);

const getHullPartName = (mesh) => mesh?.metadata?.hullPartName || mesh?.name || 'unnamed';
const getMeshPartId = (mesh) => {
    if (!mesh?.metadata?.compartmentName) return null;
    return encodePartId(mesh.metadata.compartmentName, getHullPartName(mesh));
};

const POINTER_DRAG_THRESHOLD_PX = 5;
const INTERIOR_LRU_MAX = 4;

const scheduleAfterSceneUpdate = (fn) => {
    requestAnimationFrame(() => requestAnimationFrame(fn));
};

// ─── GLB loader ───────────────────────────────────────────────────────────────

/**
 * Build a serialisable tree from the TransformNode hierarchy that came out of
 * a GLB import.  Each node stores its own name, its children, and the names
 * of geometry meshes that are direct children.
 */
const buildNodeTree = (transformNodes, geometryMeshes) => {
    // Map node id → node record
    const nodeMap = new Map();
    transformNodes.forEach((tn) => {
        nodeMap.set(tn.uniqueId, {
            id: tn.uniqueId,
            name: tn.name,
            children: [],
            meshNames: [],
        });
    });

    // Attach geometry mesh names to their direct parent node
    const meshParentIds = new Set();
    geometryMeshes.forEach((m) => {
        let p = m.parent;
        while (p && !nodeMap.has(p.uniqueId)) p = p.parent;
        if (p && nodeMap.has(p.uniqueId)) {
            nodeMap.get(p.uniqueId).meshNames.push(m.name);
            meshParentIds.add(p.uniqueId);
        }
    });

    // Wire children
    transformNodes.forEach((tn) => {
        let p = tn.parent;
        while (p && !nodeMap.has(p.uniqueId)) p = p.parent;
        if (p && nodeMap.has(p.uniqueId)) {
            nodeMap.get(p.uniqueId).children.push(nodeMap.get(tn.uniqueId));
        }
    });

    // Find root(s): nodes whose parent is __root__ or has no parent in the map
    const roots = [];
    transformNodes.forEach((tn) => {
        let p = tn.parent;
        while (p && !nodeMap.has(p.uniqueId)) p = p.parent;
        if (!p) roots.push(nodeMap.get(tn.uniqueId));
    });

    return roots;
};

const buildHullPartMap = (nodeTree) => {
    const map = new Map();
    const walk = (nodes) => {
        (nodes || []).forEach((node) => {
            (node.meshNames || []).forEach((mn) => map.set(mn, node.name));
            walk(node.children);
        });
    };
    walk(nodeTree);
    return map;
};

const resolveHullPartName = (mesh, hullPartMap) => {
    const fromTree = hullPartMap.get(mesh.name);
    if (fromTree) return fromTree;
    let p = mesh.parent;
    while (p) {
        if (p.name && p.name !== '__root__' && !p.name.startsWith('__')) return p.name;
        p = p.parent;
    }
    return mesh.name;
};

const extractHullPartNames = (nodeTree, meshes) => {
    const names = new Set();
    const walk = (nodes) => {
        (nodes || []).forEach((node) => {
            if (node.name && node.meshNames?.length > 0) names.add(node.name);
            walk(node.children);
        });
    };
    walk(nodeTree);
    meshes.forEach((m) => {
        const hpn = m.metadata?.hullPartName || m.name;
        if (hpn && hpn !== '__root__' && !hpn.startsWith('__')) names.add(hpn);
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b));
};

const compartmentHasInterior = (compartment) =>
    Object.values(compartment?.loadedComponents || {}).some((c) => INTERIOR_TYPES.has(c.type));

const evictInteriorFromCompartment = (compartment) => {
    Object.values(compartment?.loadedComponents || {}).forEach((comp) => {
        if (!INTERIOR_TYPES.has(comp.type)) return;
        (comp.meshes || []).forEach((mesh) => {
            if (mesh?.material && !mesh.isDisposed()) mesh.material.dispose();
            if (mesh && !mesh.isDisposed()) mesh.dispose(false, true);
        });
    });
};

const loadGLBFile = async (scene, filePath, compartmentName, componentName, componentType) => {
    try {
        const result = await SceneLoader.ImportMeshAsync('', '', filePath, scene, null, '.glb');
        const geometryMeshes = result.meshes.filter((m) => m.getTotalVertices() > 0);

        const transformNodes = (result.transformNodes || []).filter(
            (tn) => tn.name && tn.name !== '__root__' && !tn.name.startsWith('__')
        );
        const nodeTree = buildNodeTree(transformNodes, geometryMeshes);
        const hullPartMap = buildHullPartMap(nodeTree);

        geometryMeshes.forEach((mesh) => {
            const hullPartName = resolveHullPartName(mesh, hullPartMap);
            const matName = `mat_${componentType}_${compartmentName}`;

            const isShellType = SHELL_TYPES.has(componentType);
            const targetColor = isShellType
                ? (mesh.name.toLowerCase().includes('deck') ? DECK_COLOR : COMPONENT_COLORS.shells)
                : (COMPONENT_COLORS[componentType] ?? DEFAULT_COLOR);

            let baseMat = scene.getMaterialByName(matName);
            if (!baseMat) {
                baseMat = new StandardMaterial(matName, scene);
                baseMat.diffuseColor = targetColor;
                baseMat.specularColor = new Color3(0, 0, 0);
                baseMat.specularPower = 0;
                baseMat.backFaceCulling = false;
                baseMat.alpha = 1.0;
                baseMat.transparencyMode = 0;
                if (componentType === 'plates') baseMat.zOffset = 1;
            }

            const instanceMat = baseMat.clone(`${matName}_inst_${mesh.uniqueId}`);
            mesh.material = instanceMat;
            mesh.metadata = {
                ...mesh.metadata,
                compartmentName,
                componentType,
                componentName,
                hullPartName,
                baseMaterialName: matName,
            };

            if (isShellType) {
                mesh.enableEdgesRendering(0.9, true);
                mesh.edgesWidth = 2.0;
                mesh.edgesColor = new Color4(1, 1, 1, 0.85);
            }

            mesh.freezeWorldMatrix();
            mesh.isPickable = true;
        });

        const hullPartNames = extractHullPartNames(nodeTree, geometryMeshes);

        return {
            meshes: geometryMeshes,
            transformNodes,
            nodeTree,
            hullPartNames,
            success: geometryMeshes.length > 0,
            compartmentName,
            componentName,
            componentType,
        };
    } catch (error) {
        console.error(`Error loading GLB: ${filePath}`, error);
        return { meshes: [], transformNodes: [], nodeTree: [], hullPartNames: [], success: false, error };
    }
};

// ─── Emissive constants ───────────────────────────────────────────────────────

const EMISSIVE_NONE = new Color3(0, 0, 0);
const EMISSIVE_PART = new Color3(0.05, 0.05, 0.05); // Subtle white glow for selected part
const EMISSIVE_MILD = new Color3(0.04, 0.04, 0.04);
const EMISSIVE_SELECTED = new Color3(0.12, 0.12, 0.12);

function getOrCreateSelectionMaterial(mat, scene) {
    if (!mat || !mat.name) return null;
    const selMatName = `${mat.name}_SEL`;
    let selMat = scene.getMaterialByName(selMatName);
    if (!selMat) {
        selMat = mat.clone(selMatName);
        selMat.diffuseColor = new Color3(
            mat.diffuseColor.r * 0.4 + 0.5,
            mat.diffuseColor.g * 0.4 + 0.5,
            mat.diffuseColor.b * 0.4 + 0.5,
        );
    }
    selMat.emissiveColor = EMISSIVE_PART;
    return selMat;
}

// ─── applyMeshStates ──────────────────────────────────────────────────────────

function applyMeshStates({
    loadedCompartments, compartmentVisibility, componentTypeVisibility,
    viewMode, selectedCompartment, selectedParts, selectedComponentType,
    hiddenPartsByCompartment, scene,
}) {
    Object.values(loadedCompartments).forEach((compartment) => {
        Object.values(compartment.loadedComponents).forEach((component) => {
            (component.meshes || []).forEach((mesh) => {
                if (!mesh || mesh.isDisposed() || !mesh.material) return;

                const isShellType = SHELL_TYPES.has(component.type);
                const isInterior = INTERIOR_TYPES.has(component.type);
                const partId = getMeshPartId(mesh);
                if (!partId) return;

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
                const hiddenSet = hiddenPartsByCompartment?.[compartment.compartmentName];
                if ((viewMode === 'compartment' || viewMode === 'hullPart') && hiddenSet?.has(partId)) visible = false;

                mesh.isVisible = visible;
                mesh.isPickable = visible;

                if (!visible) {
                    return;
                }

                const isPartSelected = (selectedParts || []).includes(partId) && (viewMode === 'compartment' || viewMode === 'hullPart');
                const isAssetSelected = selectedCompartment === compartment.compartmentName && viewMode === 'asset';
                const isInOpenCompartment = (viewMode === 'compartment' || viewMode === 'hullPart')
                    && compartment.compartmentName === selectedCompartment;

                const baseMatName = mesh.metadata?.baseMaterialName || `mat_${component.type}_${compartment.compartmentName}`;
                const baseMat = mesh.material;

                if (isPartSelected) {
                    if (scene) {
                        const selMat = getOrCreateSelectionMaterial(baseMat, scene);
                        if (selMat) mesh.material = selMat;
                    }
                    if (isShellType) {
                        mesh.enableEdgesRendering(0.9, true); // Enable edge rendering
                        mesh.edgesWidth = 5.0; // Set edge width
                        mesh.edgesColor = new Color4(1, 1, 1, 1.0); // White edges
                    } else {
                        if (mesh._edgesRenderer) mesh.disableEdgesRendering();
                    }
                } else {
                    if (mesh.material?.name?.endsWith('_SEL')) {
                        const inst = scene?.getMaterialByName(`${baseMatName}_inst_${mesh.uniqueId}`);
                        if (inst) mesh.material = inst;
                    }

                    if (isAssetSelected) {
                        mesh.material.emissiveColor = EMISSIVE_SELECTED.clone();
                        if (isShellType) {
                            mesh.enableEdgesRendering(0.9, true);
                            mesh.edgesWidth = 3.5;
                            mesh.edgesColor = new Color4(1, 1, 1, 1);
                        }
                    } else if (isInOpenCompartment) {
                        mesh.material.emissiveColor = EMISSIVE_MILD.clone();
                        if (!isShellType && mesh._edgesRenderer) mesh.disableEdgesRendering();
                    } else {
                        mesh.material.emissiveColor = EMISSIVE_NONE.clone();
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
    Animation.CreateAndStartAnimation('camRadius', camera, 'radius', 60, durationFrames, camera.radius, clampedRadius, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
}

function animateCameraAngle(camera, scene, targetAlpha, targetBeta, durationFrames = 40) {
    if (!camera || !scene) return;
    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    Animation.CreateAndStartAnimation('camAlpha', camera, 'alpha', 60, durationFrames, camera.alpha, targetAlpha, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    Animation.CreateAndStartAnimation('camBeta', camera, 'beta', 60, durationFrames, camera.beta, targetBeta, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
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

    const center = Vector3.Center(min, max);
    const size = max.subtract(min);
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov || Math.PI / 4;
    const fitDist = ((maxDim / 2) / Math.tan(fov / 2)) * 1.8;

    camera.lowerRadiusLimit = fitDist * 0.05;
    camera.upperRadiusLimit = fitDist * 12;

    if (animate) {
        animateCameraTo(camera, scene, center, fitDist);
    } else {
        camera.target = center;
        camera.radius = fitDist;
        camera.alpha = -Math.PI / 4;
        camera.beta = Math.PI / 3;
    }
};

// ─── Axis Controls UI ─────────────────────────────────────────────────────────

const AXIS_VIEWS = [
    { label: '+Y', title: 'Top', alpha: -Math.PI / 2, beta: 0.01 },
    { label: '−Y', title: 'Bottom', alpha: -Math.PI / 2, beta: Math.PI - 0.01 },
    { label: '+Z', title: 'Front', alpha: -Math.PI / 2, beta: Math.PI / 2 },
    { label: '−Z', title: 'Back', alpha: Math.PI / 2, beta: Math.PI / 2 },
    { label: '+X', title: 'Right', alpha: 0, beta: Math.PI / 2 },
    { label: '−X', title: 'Left', alpha: Math.PI, beta: Math.PI / 2 },
    { label: '⟳', title: 'Iso', alpha: -Math.PI / 4, beta: Math.PI / 3 },
];

const STEP = Math.PI / 12;

const AxisControls = ({ sceneRef }) => {
    const snapTo = (alpha, beta) => {
        const cam = sceneRef.current?.activeCamera;
        if (cam) animateCameraAngle(cam, sceneRef.current, alpha, beta);
    };
    const rotate = (dAlpha, dBeta) => {
        const cam = sceneRef.current?.activeCamera;
        if (!cam) return;
        const nextAlpha = cam.alpha + dAlpha * STEP;
        const nextBeta = Math.max(0.01, Math.min(Math.PI - 0.01, cam.beta + dBeta * STEP));
        animateCameraAngle(cam, sceneRef.current, nextAlpha, nextBeta);
    };

    const panel = {
        position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
        display: 'flex', flexDirection: 'column', gap: 6, userSelect: 'none',
    };
    const group = {
        display: 'flex', flexDirection: 'column',
        background: 'rgba(18,28,40,0.88)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 10, overflow: 'hidden', backdropFilter: 'blur(8px)',
    };
    const rowStyle = { display: 'flex' };
    const btnBase = {
        width: 46, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, letterSpacing: '0.02em', cursor: 'pointer',
        color: 'rgba(200,220,255,0.85)', background: 'transparent', border: 'none',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        transition: 'background 0.12s, color 0.12s',
        fontFamily: 'system-ui, sans-serif',
    };

    const Btn = ({ onClick, title, children, style = {} }) => {
        const [hov, setHov] = useState(false);
        return (
            <button
                onClick={onClick} title={title}
                style={{
                    ...btnBase, ...style,
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

    const label = {
        padding: '4px 0 2px', textAlign: 'center', fontSize: 9, fontWeight: 600,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'rgba(150,180,220,0.5)', fontFamily: 'system-ui, sans-serif',
    };

    return (
        <div style={panel}>
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

            <div style={group}>
                <div style={label}>Rotate</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 46px)', gridTemplateRows: 'repeat(3, 34px)' }}>
                    <Btn onClick={() => rotate(-1, -1)} title="Rotate Up-Left">↖</Btn>
                    <Btn onClick={() => rotate(0, -1)} title="Tilt Up">↑</Btn>
                    <Btn onClick={() => rotate(1, -1)} title="Rotate Up-Right" style={{ borderRight: 'none' }}>↗</Btn>

                    <Btn onClick={() => rotate(-1, 0)} title="Rotate Left">←</Btn>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.1)', borderRight: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>•</div>
                    <Btn onClick={() => rotate(1, 0)} title="Rotate Right" style={{ borderRight: 'none' }}>→</Btn>

                    <Btn onClick={() => rotate(-1, 1)} title="Rotate Down-Left" style={{ borderBottom: 'none' }}>↙</Btn>
                    <Btn onClick={() => rotate(0, 1)} title="Tilt Down" style={{ borderBottom: 'none' }}>↓</Btn>
                    <Btn onClick={() => rotate(1, 1)} title="Rotate Down-Right" style={{ borderRight: 'none', borderBottom: 'none' }}>↘</Btn>
                </div>
            </div>
        </div>
    );
};

// ─── Main component ───────────────────────────────────────────────────────────

const BabylonScene = () => {
    const HEADER_HEIGHT = SHELL_HEADER_HEIGHT;
    const SIDEBAR_WIDTH = SHELL_SIDEBAR_WIDTH;

    const canvasRef = useRef(null);
    const sceneRef = useRef(null);
    const engineRef = useRef(null);

    const handleCompartmentSelectRef = useRef(null);
    const loadedCompartmentsRef = useRef({});
    const viewModeRef = useRef('asset');

    // ── FIX: ref that always holds the compartment/part that was right-clicked.
    // React state updates are asynchronous, so reading selectedCompartment /
    // selectedPart inside handleContextAction can be stale by the time the user
    // clicks a menu item.  Writing to a ref is synchronous and sidesteps the issue.
    const rightClickTargetRef = useRef({ compartmentName: null, partId: null });
    const rightClickMeshRef = useRef(null);
    const interiorCacheOrderRef = useRef([]);

    const compartmentNames = useMemo(() => getCompartmentNamesFromShipData(), []);

    // ── State ────────────────────────────────────────────────────────────────
    const [loadedCompartments, setLoadedCompartments] = useState({});
    const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: 0 });
    const [organizedCompartments] = useState(initialOrganizedCompartments);
    const [compartmentVisibility, setCompartmentVisibility] = useState({});
    const [componentTypeVisibility, setComponentTypeVisibility] = useState({
        plates: true, brackets: true, stiffeners: true,
        compartment: true, shell: true, shells: true,
    });

    const [viewMode, setViewMode] = useState('asset');
    const [selectedCompartment, setSelectedCompartment] = useState(null);
    const [selectedParts, setSelectedParts] = useState([]);
    const [contextMenu, setContextMenu] = useState({
        visible: false,
        position: { x: 0, y: 0 },
        target: { compartmentName: null, partId: null },
    });
    const [isolatedCompartments, setIsolatedCompartments] = useState(new Set());
    const [hiddenPartsByCompartment, setHiddenPartsByCompartment] = useState({});
    const [selectedComponentType, setSelectedComponentType] = useState(null);
    const [gaugingPointsEnabled, setGaugingPointsEnabled] = useState(false);

    // Canonical hull-part -> meshes mapping for sidebar alignment.
    // Shape: { [compartmentName]: { [hullPartName]: true } }
    const [hullPartMeshesByCompartment, setHullPartMeshesByCompartment] = useState({});


    useEffect(() => { loadedCompartmentsRef.current = loadedCompartments; }, [loadedCompartments]);
    useEffect(() => { viewModeRef.current = viewMode; }, [viewMode]);

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
                    : getMeshPartId(mesh) === targetName;
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
            const center = Vector3.Center(min, max);
            const size = max.subtract(min);
            const maxDim = Math.max(size.x, size.y, size.z);
            const fov = camera.fov || Math.PI / 4;
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

        const current = loadedCompartmentsRef.current;
        const existing = current[compartmentName];
        if (compartmentHasInterior(existing)) {
            let order = interiorCacheOrderRef.current.filter((c) => c !== compartmentName);
            order.push(compartmentName);
            interiorCacheOrderRef.current = order;
            return Object.values(existing.loadedComponents || {}).flatMap((c) => c.meshes || []);
        }

        const interiorFiles = Object.values(compartmentData.components)
            .filter((comp) => INTERIOR_TYPES.has(comp.type))
            .map((comp) => ({ type: comp.type, data: comp, compartmentName }));

        if (interiorFiles.length === 0) return;

        setLoadingProgress({ loaded: 0, total: interiorFiles.length });

        const newLoaded = { ...current };
        if (!newLoaded[compartmentName]) {
            newLoaded[compartmentName] = { ...compartmentData, loadedComponents: {} };
        }

        let allInteriorMeshes = [];
        for (const { type, data } of interiorFiles) {
            const result = await loadGLBFile(scene, data.path, compartmentName, data.name, type);
            setLoadingProgress((prev) => ({ ...prev, loaded: prev.loaded + 1 }));
            if (result.success) {
                newLoaded[compartmentName].loadedComponents[type] = {
                    ...data,
                    meshes: result.meshes,
                    nodeTree: result.nodeTree,
                    hullPartNames: result.hullPartNames,
                };
                allInteriorMeshes.push(...result.meshes);
            }
        }

        let order = interiorCacheOrderRef.current.filter((c) => c !== compartmentName);
        order.push(compartmentName);
        while (order.length > INTERIOR_LRU_MAX) {
            const evictName = order.shift();
            if (!evictName || evictName === compartmentName) continue;
            const evictComp = newLoaded[evictName];
            if (!evictComp || !compartmentHasInterior(evictComp)) continue;
            evictInteriorFromCompartment(evictComp);
            const shellsOnly = {};
            Object.entries(evictComp.loadedComponents || {}).forEach(([t, comp]) => {
                if (SHELL_TYPES.has(comp.type)) shellsOnly[t] = comp;
            });
            newLoaded[evictName] = { ...evictComp, loadedComponents: shellsOnly };
        }
        interiorCacheOrderRef.current = order;

        setLoadedCompartments({ ...newLoaded });
        loadedCompartmentsRef.current = { ...newLoaded };

        // Merge hull parts from newly loaded interior meshes into sidebar listing
        if (allInteriorMeshes.length > 0) {
            setHullPartMeshesByCompartment((prev) => {
                const updated = { ...prev };
                const cmpObj = { ...(updated[compartmentName] || {}) };
                allInteriorMeshes.forEach((m) => {
                    const hpn = m?.metadata?.hullPartName;
                    if (hpn) cmpObj[hpn] = true;
                });
                updated[compartmentName] = cmpObj;
                return updated;
            });
        }

        setTimeout(() => setLoadingProgress({ loaded: 0, total: 0 }), 400);
        return allInteriorMeshes;
    }, [organizedCompartments]);

    // ── applySceneState ───────────────────────────────────────────────────────
    const applySceneState = useCallback((overrides = {}) => {
        applyMeshStates({
            loadedCompartments: loadedCompartmentsRef.current,
            compartmentVisibility,
            componentTypeVisibility,
            viewMode,
            selectedCompartment,
            selectedParts,
            selectedComponentType,
            hiddenPartsByCompartment,
            scene: sceneRef.current,
            ...overrides,
        });
    }, [compartmentVisibility, componentTypeVisibility, viewMode, selectedCompartment, selectedParts, selectedComponentType, hiddenPartsByCompartment]);

    useEffect(() => {
        if (Object.keys(loadedCompartments).length === 0) return;
        applySceneState();
    }, [loadedCompartments, compartmentVisibility, componentTypeVisibility, viewMode, selectedCompartment, selectedParts, selectedComponentType, hiddenPartsByCompartment]);

    useEffect(() => {
        if (viewMode === 'compartment' && selectedCompartment) {
            setTimeout(() => centerOnSelection('compartment', selectedCompartment), 80);
        } else if (viewMode === 'hullPart' && selectedParts.length === 1) {
            setTimeout(() => centerOnSelection('part', selectedParts[0]), 80);
        }
    }, [viewMode, selectedCompartment, selectedParts, centerOnSelection]);

    useEffect(() => {
        if (isolatedCompartments.size === 1) {
            scheduleAfterSceneUpdate(() =>
                centerOnSelection('compartment', Array.from(isolatedCompartments)[0]));
        }
    }, [isolatedCompartments, centerOnSelection]);

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
        setSelectedParts([]);
        setSelectedComponentType(null);
        setIsolatedCompartments(new Set());
        setHiddenPartsByCompartment({});
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
            const vis = {};
            Object.keys(organizedCompartments).forEach((k) => {
                vis[k] = k === compartmentName;
            });
            setCompartmentVisibility(vis);
            return new Set([compartmentName]);
        });
    }, [organizedCompartments]);

    const handleHidePart = useCallback((partId) => {
        const { compartmentName } = decodePartId(partId);
        if (!compartmentName) return;
        setHiddenPartsByCompartment((prev) => {
            const next = { ...prev };
            const set = new Set(next[compartmentName] || []);
            set.add(partId);
            next[compartmentName] = set;
            return next;
        });
    }, []);

    const togglePartVisibility = useCallback((partId) => {
        if (!partId) return;
        const { compartmentName } = decodePartId(partId);
        if (!compartmentName) return;
        setHiddenPartsByCompartment((prev) => {
            const next = { ...prev };
            const set = new Set(next[compartmentName] || []);
            if (set.has(partId)) set.delete(partId);
            else set.add(partId);
            next[compartmentName] = set;
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
                selectedParts, selectedComponentType, hiddenPartsByCompartment,
                scene: sceneRef.current,
            });
            return next;
        });
    }, [componentTypeVisibility, viewMode, selectedCompartment, selectedParts, selectedComponentType, hiddenPartsByCompartment]);

    const toggleComponentTypeVisibility = useCallback((componentType) => {
        setComponentTypeVisibility((prev) => {
            const next = { ...prev, [componentType]: !prev[componentType] };
            applyMeshStates({
                loadedCompartments: loadedCompartmentsRef.current,
                compartmentVisibility,
                componentTypeVisibility: next,
                viewMode, selectedCompartment, selectedParts, selectedComponentType, hiddenPartsByCompartment,
                scene: sceneRef.current,
            });
            return next;
        });
    }, [compartmentVisibility, viewMode, selectedCompartment, selectedParts, selectedComponentType, hiddenPartsByCompartment]);

    // ── Navigation ────────────────────────────────────────────────────────────

    const enterCompartmentView = useCallback((compartmentName, initialPartId = null) => {
        if (!compartmentName) return;

        const alreadyLoaded = loadedCompartmentsRef.current[compartmentName];
        const hasInterior = alreadyLoaded && Object.values(alreadyLoaded.loadedComponents || {})
            .some((c) => INTERIOR_TYPES.has(c.type));

        setSelectedCompartment(compartmentName);
        setSelectedParts(initialPartId ? [initialPartId] : []);
        setSelectedComponentType(null);
        setViewMode('compartment');

        if (!hasInterior) {
            loadCompartmentInterior(compartmentName).then((meshes) => {
                if (meshes && meshes.length > 0) {
                    const scene = sceneRef.current;
                    const camera = scene?.activeCamera;
                    if (scene && camera) setTimeout(() => centerModel(scene, meshes, camera, true), 100);
                }
            });
        }
    }, [loadCompartmentInterior]);

    // const handleEnterCompartmentView = useCallback((targetCompartment) => {
    //     // Accept an explicit compartment name (from the right-click ref) so we
    //     // don't depend on selectedCompartment state having already flushed.
    //     const name = targetCompartment || selectedCompartment;
    //     if (name) enterCompartmentView(name);
    // }, [selectedCompartment, enterCompartmentView]);

    const handleEnterHullPartView = useCallback((actingPart, pickedMesh) => {
        const partId = actingPart ?? (selectedParts.length === 1 ? selectedParts[0] : null);
        const mesh = pickedMesh ?? rightClickMeshRef.current;
        if (partId) {
            const { compartmentName, hullPartName } = decodePartId(partId);
            if (compartmentName) {
                setSelectedCompartment(compartmentName);
                setSelectedParts([partId]);
                const compType = mesh?.metadata?.componentType
                    ?? (hullPartName && loadedCompartmentsRef.current[compartmentName]
                        ? Object.entries(loadedCompartmentsRef.current[compartmentName].loadedComponents || {})
                            .find(([, comp]) => (comp.meshes || []).some((m) => getMeshPartId(m) === partId))?.[0]
                        : null);
                if (compType) setSelectedComponentType(compType);
                setViewMode('hullPart');
                return;
            }
        }
        if (selectedComponentType && selectedCompartment && viewMode === 'compartment') {
            setViewMode('hullPart');
        }
    }, [selectedParts, selectedComponentType, selectedCompartment, viewMode]);

    const handleBackToAssetView = useCallback(() => {
        setViewMode('asset');
        setSelectedCompartment(null);
        setSelectedParts([]);
        setSelectedComponentType(null);
    }, []);

    const handleBackToCompartmentView = useCallback(() => {
        setViewMode('compartment');
        setSelectedParts([]);
        setSelectedComponentType(null);
    }, []);

    const handleSelectComponentType = useCallback((componentType) => {
        if (viewMode === 'compartment' && selectedCompartment) setSelectedComponentType(componentType);
    }, [viewMode, selectedCompartment]);

    // ── Context action dispatcher ─────────────────────────────────────────────
    // ── FIX: always read from rightClickTargetRef (synchronous) instead of
    //    selectedCompartment / selectedPart React state (asynchronous).
    //    This prevents the "hide fires on wrong compartment" bug that occurred
    //    because the state hadn't flushed by the time the user clicked the item.

    const handleSelectVisible = useCallback(() => {
        const scene = sceneRef.current;
        if (!scene || !scene.activeCamera) return;

        // Update matrices to ensure we have the latest projection for planes
        scene.updateTransformMatrix(true);
        const planes = scene.activeCamera.getFrustumPlanes();
        const visibleParts = [];

        scene.meshes.forEach(mesh => {
            // Identify meshes that belong to the model (have metadata) and are visible in the frustum
            if (mesh.metadata?.compartmentName && mesh.isVisible && mesh.isInFrustum(planes)) {
                const pId = getMeshPartId(mesh);
                if (pId && !visibleParts.includes(pId)) {
                    visibleParts.push(pId);
                }
            }
        });
        setSelectedParts(visibleParts);
    }, []);

    const handleContextAction = useCallback((action) => {
        // Grab the target that was right-clicked (set synchronously in handleCompartmentSelect)
        const { compartmentName: rcCompartment, partId: rcPart } = rightClickTargetRef.current;

        // Fall back to React state only when there is no right-click target
        const actingCompartment = rcCompartment ?? selectedCompartment;
        const actingPart = rcPart ?? (selectedParts.length === 1 ? selectedParts[0] : null);

        switch (action) {
            case 'selectVisible':
                handleSelectVisible();
                break;
            case 'compartmentView':
                // Pass the compartment explicitly so enterCompartmentView doesn't
                // rely on selectedCompartment state having already flushed.
                if (actingCompartment) enterCompartmentView(actingCompartment);
                break;

            case 'hullPartView':
                handleEnterHullPartView(actingPart, rightClickMeshRef.current);
                break;

            case 'backToAsset':
                handleBackToAssetView();
                break;

            case 'backToCompartment':
                handleBackToCompartmentView();
                break;

            case 'hide':
                if (actingPart) {
                    handleHidePart(actingPart);
                    setSelectedParts(prev => prev.filter(p => p !== actingPart));
                } else if (actingCompartment) {
                    // Hide the whole compartment (asset view or compartment view with no part selected)
                    handleHide(actingCompartment);
                }
                break;

            case 'fitToScreen': {
                const scene = sceneRef.current;
                if (!scene) break;
                if ((viewMode === 'compartment' || viewMode === 'hullPart') && actingCompartment) {
                    centerOnSelection('compartment', actingCompartment);
                } else if (actingPart) {
                    centerOnSelection('part', actingPart);
                } else {
                    const all = scene.meshes.filter((m) => m.isVisible && m.getTotalVertices?.() > 0);
                    centerModel(scene, all, scene.activeCamera, true);
                }
                break;
            }

            case 'isolate':
                if (actingCompartment) handleIsolateCompartment(actingCompartment);
                break;

            case 'showAll':
                handleShowAll();
                break;

            case 'reset':
                handleReset();
                break;

            default:
                break;
        }
    }, [
        viewMode, selectedCompartment, selectedParts,
        handleSelectVisible, enterCompartmentView, handleEnterHullPartView,
        handleBackToAssetView, handleBackToCompartmentView,
        handleHide, handleHidePart, handleShowAll, handleReset,
        handleIsolateCompartment, centerOnSelection,
    ]);

    // ── handleCompartmentSelect ───────────────────────────────────────────────
    //
    //  LEFT CLICK
    //   asset view        → toggle compartment highlight
    //   compartment view  → toggle part selection
    //   empty canvas      → deselect everything
    //
    //  RIGHT CLICK
    //   → store target in rightClickTargetRef (sync) then open context menu
    //
    //  SIDEBAR CLICK (partId === null)
    //   → always enter compartment view

    const handleCompartmentSelect = useCallback((compartmentName, partId, position, isRightClick, pickedMesh) => {

        // ── RIGHT CLICK ──────────────────────────────────────────────────────
        if (isRightClick) {
            const target = {
                compartmentName: compartmentName ?? null,
                partId: partId ?? null,
            };
            rightClickTargetRef.current = target;
            rightClickMeshRef.current = pickedMesh ?? null;

            if (compartmentName) setSelectedCompartment(compartmentName);
            if (partId) setSelectedParts([partId]);

            // #region agent log
            const decoded = partId ? decodePartId(partId) : null;
            fetch('http://127.0.0.1:7581/ingest/d073351c-a230-41b3-a302-f03168fb7f60',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'70fba6'},body:JSON.stringify({sessionId:'70fba6',location:'BabylonScene.jsx:handleCompartmentSelect:rightClick',message:'right-click target',data:{viewMode,hypothesisId:'H8',compartmentName,partId,decodedHull:decoded?.hullPartName,hasMesh:!!pickedMesh},timestamp:Date.now()})}).catch(()=>{});
            // #endregion

            if (position) {
                setContextMenu({ visible: true, position, target });
            }
            return;
        }

        // ── Close context menu on any left click ─────────────────────────────
        setContextMenu({ visible: false, position: { x: 0, y: 0 }, target: { compartmentName: null, partId: null } });

        // ── SIDEBAR CLICK (no partId) → enter compartment view & load interior
        if (!partId && compartmentName) {
            // Ensure the compartment is visible when selected via the sidebar hierarchy
            setCompartmentVisibility((prev) => ({
                ...prev,
                [compartmentName]: true
            }));
            enterCompartmentView(compartmentName);
            return;
        }

        // ── Part click (sidebar or 3D) ───────────────────────────────────────
        if (partId && compartmentName) {
            // Per requirement: left-clicking a part (in 3D or sidebar) should 
            // only select the compartment in Asset view. Interior loading is now
            // restricted to the context menu "Compartment View" action.
            // If clicking from the sidebar part list (no pickedMesh), enter compartment view
            if (!pickedMesh) {
                setCompartmentVisibility((prev) => ({
                    ...prev,
                    [compartmentName]: true
                }));
                enterCompartmentView(compartmentName, partId);
                return;
            }

            // Per requirement: left-clicking a part (in 3D) should only select the compartment 
            // in Asset view. Interior loading is restricted to the context menu or sidebar.
            if (viewMode === 'asset' || selectedCompartment !== compartmentName) {
                setSelectedCompartment((prev) => (prev === compartmentName ? null : compartmentName));
                setSelectedParts([]);
                setSelectedParts([partId]);
                if (viewMode !== 'asset') setViewMode('asset');
                return;
            }

            // Selecting a part within the current compartment view (exclusive selection)
            setSelectedParts(prev => prev.includes(partId) && prev.length === 1 ? [] : [partId]);
            return;
        }
    }, [viewMode, selectedCompartment, selectedParts, enterCompartmentView]);

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
        camera.inertia = 0.88;
        camera.angularSensibilityX = 700;
        camera.angularSensibilityY = 700;
        camera.panningSensibility = 80;
        camera.wheelDeltaPercentage = 0.012;
        camera.pinchDeltaPercentage = 0.012;
        camera.minZ = 0.5;
        camera.maxZ = 8000;
        camera.lowerRadiusLimit = 1;
        camera.upperRadiusLimit = 5000;
        camera.lowerBetaLimit = 0.01;
        camera.upperBetaLimit = Math.PI - 0.01;

        const hemi = new HemisphericLight('light', new Vector3(0, 1, 0), scene);
        hemi.intensity = 1.2;
        hemi.diffuse = new Color3(1, 1, 1);
        hemi.specular = new Color3(0, 0, 0);
        hemi.groundColor = new Color3(0.4, 0.4, 0.4);

        const dir1 = new DirectionalLight('dir1', new Vector3(-1, -1, -0.5), scene);
        dir1.intensity = 0.5; dir1.specular = new Color3(0, 0, 0);

        const dir2 = new DirectionalLight('dir2', new Vector3(1, -0.5, 0.5), scene);
        dir2.intensity = 0.3; dir2.specular = new Color3(0, 0, 0);

        scene.skipFrustumClipping = false;
        scene.autoClear = true;
        scene.autoClearDepthAndStencil = true;
        scene.blockMaterialDirtyMechanism = true;
        engine.setHardwareScalingLevel(1.0);

        // ── Pointer handling ──────────────────────────────────────────────────
        const canvas = canvasRef.current;
        let pointerDownX = 0, pointerDownY = 0, leftPointerDown = false;

        const onPointerDown = (e) => {
            if (e.button === 0) {
                pointerDownX = e.clientX;
                pointerDownY = e.clientY;
                leftPointerDown = true;
            }
        };

        const PICK_PREDICATE = (m) => m.isVisible && m.isPickable;

        const pick = (clientX, clientY, isRight) => {
            const rect = canvas.getBoundingClientRect();
            const canvasX = clientX - rect.left;
            const canvasY = clientY - rect.top;

            const r = scene.pick(canvasX, canvasY, PICK_PREDICATE);
            const pos = { x: clientX, y: clientY };

            if (r.hit && r.pickedMesh?.metadata?.compartmentName) {
                const { compartmentName } = r.pickedMesh.metadata;
                const partId = getMeshPartId(r.pickedMesh);
                const decoded = partId ? decodePartId(partId) : null;
                // #region agent log
                if (decoded?.hullPartName?.includes('-')) {
                    fetch('http://127.0.0.1:7581/ingest/d073351c-a230-41b3-a302-f03168fb7f60',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'70fba6'},body:JSON.stringify({sessionId:'70fba6',location:'BabylonScene.jsx:pick',message:'hyphenated hull part id',data:{hypothesisId:'H6',partId,compartmentName,hullPartName:decoded.hullPartName,display:getPartDisplayName(partId)},timestamp:Date.now()})}).catch(()=>{});
                }
                // #endregion
                handleCompartmentSelectRef.current?.(compartmentName, partId, pos, isRight, r.pickedMesh);
            } else if (!isRight) {
                const vm = viewModeRef.current;
                if (vm === 'compartment' || vm === 'hullPart') {
                    setSelectedParts([]);
                } else {
                    setSelectedCompartment(null);
                    setSelectedParts([]);
                }
                setContextMenu({ visible: false, position: { x: 0, y: 0 }, target: { compartmentName: null, partId: null } });
            }
            // Right-click on empty canvas → no-op
        };

        const onPointerUp = (e) => {
            if (e.button !== 0 || !leftPointerDown) return;
            leftPointerDown = false;
            const dx = e.clientX - pointerDownX;
            const dy = e.clientY - pointerDownY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const dragged = dist > POINTER_DRAG_THRESHOLD_PX;
            // #region agent log
            if (dragged) fetch('http://127.0.0.1:7581/ingest/d073351c-a230-41b3-a302-f03168fb7f60',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'70fba6'},body:JSON.stringify({sessionId:'70fba6',location:'BabylonScene.jsx:onPointerUp',message:'pick suppressed by drag',data:{hypothesisId:'H9',dist,threshold:POINTER_DRAG_THRESHOLD_PX},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            if (!dragged) pick(e.clientX, e.clientY, false);
        };
        const onCtxMenu = (e) => {
            e.preventDefault();
            pick(e.clientX, e.clientY, true);
        };

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('contextmenu', onCtxMenu);
        canvas.style.cursor = 'grab';
        canvas.style.touchAction = 'none';

        // ── Initial load: all components ───────────────────────────────────────
        const loadAllComponents = async () => {
            const allFiles = [];
            Object.values(initialOrganizedCompartments).forEach((compartment) => {
                Object.values(compartment.components).forEach((comp) => {
                    if (comp) allFiles.push({ type: comp.type, data: comp, compartmentName: compartment.compartmentName });
                });
            });

            setLoadingProgress({ loaded: 0, total: allFiles.length });

            const newLoaded = {};
            const newHullPartMeshesByCompartment = {};

            Object.keys(initialOrganizedCompartments).forEach((k) => {
                newLoaded[k] = { ...initialOrganizedCompartments[k], loadedComponents: {} };
            });

            let allMeshes = [];
            const BATCH = 6;
            for (let i = 0; i < allFiles.length; i += BATCH) {
                const batch = allFiles.slice(i, i + BATCH);
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
                        newLoaded[compartmentName].loadedComponents[type] = {
                            ...data,
                            meshes: result.meshes,
                            nodeTree: result.nodeTree,
                            hullPartNames: result.hullPartNames,
                        };

                        // Canonical hull-part mapping (exact hullPartName source from Babylon mesh metadata)
                        const cmpObj = (newHullPartMeshesByCompartment[compartmentName] ||= {});
                        (result.meshes || []).forEach((m) => {
                            const hpn = m?.metadata?.hullPartName;
                            if (!hpn) return;
                            cmpObj[hpn] = true;
                        });

                        allMeshes.push(...result.meshes);
                    }
                });
            }

            setLoadedCompartments(newLoaded);
            loadedCompartmentsRef.current = newLoaded;

            setHullPartMeshesByCompartment(newHullPartMeshesByCompartment);


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

        loadAllComponents();
        engine.runRenderLoop(() => scene.render());

        const resizeObserver = new ResizeObserver(() => {
            engine.resize();
        });
        resizeObserver.observe(canvas);

        return () => {
            resizeObserver.disconnect();
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('contextmenu', onCtxMenu);
            scene.dispose();
            engine.dispose();
        };
    }, []);

    // ── Breadcrumbs ───────────────────────────────────────────────────────────

    const getFunctionalityGroup = (name) => {
        if (!name) return '';
        const u = name.toUpperCase();
        if (/^CARGO_TANK/.test(u)) return 'Cargo';
        if (/^AFT_PEAK/.test(u)) return 'Aft Peak';
        if (/^FORE_PEAK/.test(u)) return 'Fore Peak';
        if (/^ENGINE_ROOM/.test(u)) return 'Engine Room';
        if (/^CHAIN_LOCKER/.test(u)) return 'Chain Locker';
        if (/^DISTILLED_WATER/.test(u)) return 'Distilled Water';
        if (/^FWD_DEEP/.test(u)) return 'Fwd Deep';
        if (/^POTABLE_WATER/.test(u)) return 'Potable Water';
        if (/^PUMP_ROOM/.test(u)) return 'Pump Room';
        if (/^SLOP_TANK/.test(u)) return 'Slop Tank';
        if (/^STEERING_GEAR/.test(u)) return 'Steering Gear';
        if (/^STERN_TB/.test(u)) return 'Stern TB';
        if (/^STORAGE_SPACES/.test(u)) return 'Storage Spaces';
        return name.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };

    const renderBreadcrumbs = () => {
        const items = [];

        const Sep = ({ k }) => <span key={k} style={{ margin: '0 8px', color: 'rgba(255,255,255,0.4)' }}>/</span>;
        const Link = ({ k, label, onClick }) => (
            <span
                key={k}
                style={{ color: '#4DA2FF', cursor: 'pointer' }}
                onClick={onClick}
                onMouseEnter={(e) => (e.target.style.color = '#73bbff')}
                onMouseLeave={(e) => (e.target.style.color = '#4DA2FF')}
            >
                {label}
            </span>
        );

        items.push(<Link key="root" label="TEST FPSO" onClick={handleReset} />);

        if (selectedCompartment && viewMode !== 'asset') {
            const fg = getFunctionalityGroup(selectedCompartment);
            if (fg) {
                items.push(<Sep key="sep-fg" />);
                items.push(<span key="fg" style={{ color: '#4DA2FF' }}>{fg}</span>);
            }
            items.push(<Sep key="sep-comp" />);
            items.push(
                selectedParts.length > 0
                    ? <Link key="comp-link" label={selectedCompartment.replace(/_/g, ' ')} onClick={() =>
                        handleCompartmentSelectRef.current?.(selectedCompartment, null, null, false)} />
                    : <span key="comp" style={{ color: 'rgba(255,255,255,0.92)' }}>{selectedCompartment.replace(/_/g, ' ')}</span>
            );
            if (selectedParts.length > 0) {
                items.push(<Sep key="sep-part" />);
                const label = selectedParts.length === 1 
                    ? getPartDisplayName(selectedParts[0]).replace(/_/g, ' ')
                    : `${selectedParts.length} Parts Selected`;
                items.push(<span key="part" style={{ color: 'rgba(255,255,255,0.92)' }}>{label}</span>);
            }
        } else {
            items.push(<Sep key="sep-full" />);
            items.push(<span key="full" style={{ color: 'rgba(255,255,255,0.92)' }}>Full Asset</span>);
        }

        return (
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {items}
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
                    width: `calc(100% - ${SIDEBAR_WIDTH}px - ${viewMode !== 'asset' ? 220 : 0}px)`,
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
                    selectedPart={selectedParts}
                    compartmentViewMode={viewMode === 'compartment'}
                    onCompartmentSelect={handleCompartmentSelect}
                    isolatedCompartments={isolatedCompartments}
                    hullPartMeshesByCompartment={hullPartMeshesByCompartment}

                    hiddenParts={hiddenPartsByCompartment[selectedCompartment] || new Set()}
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

            <AxisControls sceneRef={sceneRef} />

            <ContextMenu
                position={contextMenu.position}
                visible={contextMenu.visible}
                menuTarget={contextMenu.target}
                selectedCompartment={selectedCompartment}
                selectedPart={selectedParts.length === 1 ? selectedParts[0] : null}
                selectedComponentType={selectedComponentType}
                compartmentViewMode={viewMode === 'compartment'}
                viewMode={viewMode}
                onClose={() => setContextMenu({ visible: false, position: { x: 0, y: 0 }, target: { compartmentName: null, partId: null } })}
                onAction={handleContextAction}
            />
        </div>
    );
};

export default BabylonScene;