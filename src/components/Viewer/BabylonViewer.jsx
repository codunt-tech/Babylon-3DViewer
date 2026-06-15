import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import BabylonScene from './BabylonScene';
import BabylonSidebar from '../Sidebar/BabylonSidebar';
import ContextMenu from '../ContextMenu/ContextMenu';
import AxisController from '../Toolbar/AxisController';
import { AppHeader, LoadingPill, ComponentTypesRail, ModelSwitcher, HEADER_HEIGHT, SIDEBAR_WIDTH } from '../../components/viewerShell';
import {
    getCompartmentNamesFromShipData, organizeByCompartments, getFunctionalityGroup,
    getActiveModel, getActiveModelId, setActiveModel, listModels,
} from '../../services/hierarchyService';
import { loadGLBFile, SHELL_TYPES } from '../../services/modelLoader';
import { centerModel, centerOnSelection } from '../../services/cameraService';
import { decodePartId, getPartDisplayName } from '../../utils/partIdUtils';
import { getMeshPartId } from '../../utils/meshUtils';

// Dispose every loaded mesh + the loader's shared materials so a different
// model can be loaded into the same scene (camera/lights are left intact).
const clearScene = (scene) => {
    if (!scene) return;
    scene.meshes.slice().forEach((m) => {
        const isModelMesh = m.metadata?.compartmentName || m.metadata?.merged || (m.getTotalVertices?.() > 0);
        if (isModelMesh && !m.isDisposed()) {
            m.material = null; // material is shared; dispose it separately below
            m.dispose(false, false);
        }
    });
    scene.materials.slice().forEach((mat) => {
        if (/^mat_/.test(mat.name) && !mat.isDisposed?.()) mat.dispose();
    });
};

// Flow check: load EVERY component (plates/brackets/stiffeners/shells) in parallel
// at startup instead of shells-only + on-demand interiors. Set back to false to
// restore the lazy-loading behaviour.
const LOAD_FULL_MODEL = true;

const BabylonViewer = () => {
    const sceneRef = useRef(null);
    const engineRef = useRef(null);
    const rightClickTargetRef = useRef({ compartmentName: null, partId: null });
    const rightClickMeshRef = useRef(null);
    const loadedCompartmentsRef = useRef({});

    // Active model's organized compartments. A ref (not module const) so a model
    // switch can swap it without re-mounting; activeModelId state drives re-renders.
    const [activeModelId, setActiveModelId] = useState(getActiveModelId());
    const organizedRef = useRef(organizeByCompartments());

    const compartmentNames = useMemo(() => getCompartmentNamesFromShipData(), [activeModelId]);

    const [loadedCompartments, setLoadedCompartments] = useState({});
    const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: 0 });
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
    const [hullPartMeshesByCompartment, setHullPartMeshesByCompartment] = useState({});

    useEffect(() => { loadedCompartmentsRef.current = loadedCompartments; }, [loadedCompartments]);

    useEffect(() => {
        const init = {};
        compartmentNames.forEach((n) => { init[n] = true; });
        setCompartmentVisibility(init);
    }, [compartmentNames]);

    // Load every part of a compartment UNMERGED (individual pickable meshes) for
    // Compartment View. The merged overview mesh stays on `meshes`; the unmerged
    // parts go on `detailMeshes`, and the view manager swaps which set is shown.
    const loadCompartmentDetailed = useCallback(async (compartmentName) => {
        const scene = sceneRef.current;
        if (!scene) return [];

        const compartmentData = organizedRef.current[compartmentName];
        if (!compartmentData) return [];

        const current = loadedCompartmentsRef.current;
        const existing = current[compartmentName];
        const alreadyDetailed = existing && Object.values(existing.loadedComponents || {})
            .some((c) => (c.detailMeshes || []).length > 0);
        if (alreadyDetailed) {
            return Object.values(existing.loadedComponents).flatMap((c) => c.detailMeshes || []);
        }

        const files = Object.values(compartmentData.components).map((comp) => ({ type: comp.type, data: comp }));
        if (files.length === 0) return [];

        setLoadingProgress({ loaded: 0, total: files.length });

        const newLoaded = { ...current };
        if (!newLoaded[compartmentName]) {
            newLoaded[compartmentName] = { ...compartmentData, loadedComponents: {} };
        }

        const allDetail = [];
        for (const { type, data } of files) {
            const result = await loadGLBFile(scene, data.path, compartmentName, data.name, type, { merge: false });
            setLoadingProgress((prev) => ({ ...prev, loaded: prev.loaded + 1 }));
            if (result.success) {
                const prevComp = newLoaded[compartmentName].loadedComponents[type] || {};
                newLoaded[compartmentName].loadedComponents[type] = {
                    ...data,
                    meshes: prevComp.meshes || [],   // keep the merged overview mesh
                    detailMeshes: result.meshes,     // the unmerged, pickable parts
                    nodeTree: result.nodeTree,
                    hullPartNames: result.hullPartNames,
                };
                allDetail.push(...result.meshes);
            }
        }

        setLoadedCompartments({ ...newLoaded });
        loadedCompartmentsRef.current = { ...newLoaded };

        if (allDetail.length > 0) {
            setHullPartMeshesByCompartment((prev) => {
                const updated = { ...prev };
                const cmpObj = { ...(updated[compartmentName] || {}) };
                allDetail.forEach((m) => {
                    const hpn = m?.metadata?.hullPartName;
                    if (hpn) cmpObj[hpn] = true;
                });
                updated[compartmentName] = cmpObj;
                return updated;
            });
        }

        setTimeout(() => setLoadingProgress({ loaded: 0, total: 0 }), 400);
        return allDetail;
    }, []);

    const enterCompartmentView = useCallback((compartmentName) => {
        if (!compartmentName) return;

        setSelectedCompartment(compartmentName);
        setSelectedParts([]);
        setSelectedComponentType(null);
        setViewMode('compartment');

        loadCompartmentDetailed(compartmentName).then((meshes) => {
            const scene = sceneRef.current;
            const camera = scene?.activeCamera;
            if (scene && camera && meshes && meshes.length > 0) {
                setTimeout(() => centerModel(scene, meshes, camera, true), 120);
            }
        });
    }, [loadCompartmentDetailed]);

    // Back to the merged overview: free the open compartment's unmerged parts
    // (their materials are shared with the merged mesh, so keep them).
    const exitToOverview = useCallback(() => {
        const scene = sceneRef.current;
        const compartmentName = selectedCompartment;

        setViewMode('asset');
        setSelectedCompartment(null);
        setSelectedParts([]);
        setSelectedComponentType(null);

        if (compartmentName && scene) {
            const comp = loadedCompartmentsRef.current[compartmentName];
            if (comp) {
                const newComps = {};
                Object.entries(comp.loadedComponents || {}).forEach(([t, c]) => {
                    (c.detailMeshes || []).forEach((m) => {
                        if (m && !m.isDisposed()) m.dispose(false, false);
                    });
                    newComps[t] = { ...c, detailMeshes: [] };
                });
                const newLoaded = { ...loadedCompartmentsRef.current, [compartmentName]: { ...comp, loadedComponents: newComps } };
                setLoadedCompartments(newLoaded);
                loadedCompartmentsRef.current = newLoaded;
            }
        }

        setTimeout(() => {
            if (!scene?.activeCamera) return;
            const all = scene.meshes.filter((m) => m.metadata?.merged && !m.isDisposed());
            if (all.length > 0) centerModel(scene, all, scene.activeCamera, true);
        }, 120);
    }, [selectedCompartment]);

    const handleCompartmentSelect = useCallback((compartmentName, partId, position, isRightClick, pickedMesh) => {
        if (isRightClick) {
            const target = { compartmentName: compartmentName ?? null, partId: partId ?? null };
            rightClickTargetRef.current = target;
            rightClickMeshRef.current = pickedMesh ?? null;

            if (compartmentName) setSelectedCompartment(compartmentName);
            if (partId) setSelectedParts([partId]);

            if (position) {
                setContextMenu({ visible: true, position, target });
            }
            return;
        }

        setContextMenu({ visible: false, position: { x: 0, y: 0 }, target: { compartmentName: null, partId: null } });

        // ── Asset view: left-click selects/deselects the compartment; no part selection ──
        if (viewMode === 'asset') {
            if (compartmentName) {
                setSelectedCompartment((prev) => (prev === compartmentName ? null : compartmentName));
            } else {
                setSelectedCompartment(null);
            }
            setSelectedParts([]);
            return;
        }

        // ── Compartment / hullPart view ──
        // Sidebar-driven navigation (no pickedMesh) → enter compartment view
        if (!pickedMesh && compartmentName) {
            setCompartmentVisibility((prev) => ({ ...prev, [compartmentName]: true }));
            enterCompartmentView(compartmentName, partId || null);
            return;
        }

        // Clicked on a mesh within the scene
        if (partId && compartmentName) {
            // Toggle part selection within the current compartment
            setSelectedParts((prev) =>
                prev.includes(partId) && prev.length === 1 ? [] : [partId]
            );
            return;
        }

        // Clicked empty space → deselect parts (stay in current view)
        if (!partId && !compartmentName) {
            setSelectedParts([]);
        }
    }, [viewMode, enterCompartmentView]);

    const handleShowAll = useCallback(() => {
        setIsolatedCompartments(new Set());
        const allVisible = {};
        Object.keys(loadedCompartmentsRef.current).forEach((n) => { allVisible[n] = true; });
        setCompartmentVisibility(allVisible);
    }, []);

    const handleReset = useCallback(() => {
        // Dispose any open compartment's detail meshes before resetting state.
        const scene = sceneRef.current;
        const openCompartment = loadedCompartmentsRef.current;
        Object.entries(openCompartment).forEach(([name, comp]) => {
            const hasDetail = Object.values(comp.loadedComponents || {}).some((c) => (c.detailMeshes || []).length > 0);
            if (!hasDetail) return;
            const newComps = {};
            Object.entries(comp.loadedComponents || {}).forEach(([t, c]) => {
                (c.detailMeshes || []).forEach((m) => { if (m && !m.isDisposed()) m.dispose(false, false); });
                newComps[t] = { ...c, detailMeshes: [] };
            });
            openCompartment[name] = { ...comp, loadedComponents: newComps };
        });

        setViewMode('asset');
        setSelectedCompartment(null);
        setSelectedParts([]);
        setSelectedComponentType(null);
        setIsolatedCompartments(new Set());
        setHiddenPartsByCompartment({});
        setLoadedCompartments({ ...openCompartment });
        loadedCompartmentsRef.current = { ...openCompartment };
        handleShowAll();

        if (scene?.activeCamera) {
            const all = scene.meshes.filter((m) => m.metadata?.merged && !m.isDisposed());
            centerModel(scene, all.length > 0 ? all : scene.meshes.filter((m) => m.metadata?.compartmentName && !m.isDisposed() && m.getTotalVertices?.() > 0), scene.activeCamera, true);
        }
    }, [handleShowAll]);

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
        setCompartmentVisibility((prev) => ({ ...prev, [compartmentName]: !prev[compartmentName] }));
    }, []);

    const toggleComponentTypeVisibility = useCallback((componentType) => {
        setComponentTypeVisibility((prev) => ({ ...prev, [componentType]: !prev[componentType] }));
    }, []);

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

    const handleSelectVisible = useCallback(() => {
        const scene = sceneRef.current;
        if (!scene || !scene.activeCamera) return;

        scene.updateTransformMatrix(true);
        const planes = scene.activeCamera.getFrustumPlanes();
        const visibleParts = [];

        scene.meshes.forEach(mesh => {
            if (mesh.metadata?.compartmentName && mesh.isVisible && mesh.isInFrustum(planes)) {
                const pId = getMeshPartId(mesh);
                if (pId && !visibleParts.includes(pId)) {
                    visibleParts.push(pId);
                }
            }
        });

        if (visibleParts.length > 0) {
            setSelectedParts(visibleParts);
        }
    }, []);

    const handleContextAction = useCallback((action) => {
        const target = rightClickTargetRef.current;
        const actingCompartment = target.compartmentName ?? selectedCompartment;
        const actingPart = target.partId ?? (selectedParts.length === 1 ? selectedParts[0] : null);

        switch (action) {
            case 'hide':
                if (actingPart) togglePartVisibility(actingPart);
                else if (actingCompartment) setCompartmentVisibility((prev) => ({ ...prev, [actingCompartment]: false }));
                break;
            case 'toggleCompartmentVisibility':
                if (actingCompartment) toggleCompartmentVisibility(actingCompartment);
                break;
            case 'isolate':
                if (actingCompartment) {
                    setIsolatedCompartments(new Set([actingCompartment]));
                    const vis = {};
                    Object.keys(organizedRef.current).forEach((k) => { vis[k] = k === actingCompartment; });
                    setCompartmentVisibility(vis);
                }
                break;
            case 'fitToScreen':
                if (actingCompartment && viewMode !== 'asset') centerOnSelection(sceneRef.current, 'compartment', actingCompartment);
                else if (sceneRef.current?.activeCamera) {
                    // Whole-model fit on the overview (merged meshes).
                    const all = sceneRef.current.meshes.filter((m) => m.metadata?.merged && !m.isDisposed());
                    const target = all.length > 0
                        ? all
                        : sceneRef.current.meshes.filter((m) => m.metadata?.compartmentName && !m.isDisposed() && m.getTotalVertices?.() > 0);
                    centerModel(sceneRef.current, target, sceneRef.current.activeCamera, true);
                }
                break;
            case 'compartmentView':
                if (actingCompartment) enterCompartmentView(actingCompartment);
                break;
            case 'hullPartView':
                handleEnterHullPartView(actingPart, null);
                break;
            case 'backToAsset':
                exitToOverview();
                break;
            case 'backToCompartment':
                setViewMode('compartment');
                setSelectedParts([]);
                setSelectedComponentType(null);
                break;
            case 'selectVisible':
                handleSelectVisible();
                break;
            default:
                break;
        }
    }, [selectedCompartment, selectedParts, viewMode, togglePartVisibility, toggleCompartmentVisibility, enterCompartmentView, exitToOverview, handleEnterHullPartView, handleSelectVisible]);

    // Load the currently active model into the (already-cleared) scene. Reads
    // sceneRef + organizedRef so it can run both at scene-ready and on a switch.
    const loadActiveModel = useCallback(async () => {
        const scene = sceneRef.current;
        if (!scene) return;
        const organizedCompartments = organizedRef.current;

        const loadAllComponents = async () => {
            // LOAD_FULL_MODEL=true  → load every component up-front, all in parallel.
            // LOAD_FULL_MODEL=false → shells only (~3 MB); interiors load on-demand.
            const shellFiles = [];
            Object.values(organizedCompartments).forEach((compartment) => {
                Object.values(compartment.components).forEach((comp) => {
                    if (comp && (LOAD_FULL_MODEL || SHELL_TYPES.has(comp.type))) {
                        shellFiles.push({ type: comp.type, data: comp, compartmentName: compartment.compartmentName });
                    }
                });
            });

            console.time('[flow] full model load');
            console.log(`[flow] loading ${shellFiles.length} files in parallel (batch ${6})`);
            setLoadingProgress({ loaded: 0, total: shellFiles.length });

            const newLoaded = {};
            const newHullPartMeshesByCompartment = {};

            Object.keys(organizedCompartments).forEach((k) => {
                newLoaded[k] = { ...organizedCompartments[k], loadedComponents: {} };
            });

            let allMeshes = [];
            let failedFiles = 0;
            let framedOnce = false;
            // Smaller batches + a yielded frame between them keep the GPU from
            // being flooded all at once (which drops the WebGPU device on big models).
            const BATCH = 4;
            const yieldFrame = () => new Promise((resolve) => setTimeout(resolve, 16));

            for (let i = 0; i < shellFiles.length; i += BATCH) {
                const batch = shellFiles.slice(i, i + BATCH);
                const results = await Promise.all(
                    batch.map(({ type, data, compartmentName }) =>
                        // Overview: merge each file into one mesh per compartment+type.
                        loadGLBFile(scene, data.path, compartmentName, data.name, type, { merge: true }).then((result) => {
                            setLoadingProgress((prev) => ({ ...prev, loaded: prev.loaded + 1 }));
                            return { type, data, result, compartmentName };
                        })
                    )
                );
                results.forEach(({ type, data, result, compartmentName }) => {
                    if (result.success) {
                        newLoaded[compartmentName].loadedComponents[type] = {
                            ...data, meshes: result.meshes, nodeTree: result.nodeTree, hullPartNames: result.hullPartNames,
                        };

                        const cmpObj = (newHullPartMeshesByCompartment[compartmentName] ||= {});
                        (result.meshes || []).forEach((m) => {
                            const hpn = m?.metadata?.hullPartName;
                            if (hpn) cmpObj[hpn] = true;
                        });
                        allMeshes.push(...result.meshes);
                    } else {
                        failedFiles += 1;
                    }
                });
                // Frame the camera once early for feedback; the full re-center
                // happens after the loop. Re-centering every batch is O(n²) on
                // tens of thousands of meshes.
                if (!framedOnce && allMeshes.length > 0) {
                    centerModel(scene, allMeshes, scene.activeCamera, false);
                    framedOnce = true;
                }
                // Let the render loop run and the GPU flush its upload queue.
                await yieldFrame();
            }

            // Final framing over the complete model.
            if (allMeshes.length > 0) {
                centerModel(scene, allMeshes, scene.activeCamera, false);
            }

            setLoadedCompartments(newLoaded);
            loadedCompartmentsRef.current = newLoaded;
            setHullPartMeshesByCompartment(newHullPartMeshesByCompartment);

            const initVis = {};
            Object.keys(newLoaded).forEach((n) => { initVis[n] = true; });
            setCompartmentVisibility(initVis);

            // Spatial index for fast picking now that the scene is static.
            scene.createOrUpdateSelectionOctree();

            console.timeEnd('[flow] full model load');
            console.log(
                `[flow] meshes: ${allMeshes.length}, materials: ${scene.materials.length}, ` +
                `compartments: ${Object.keys(newLoaded).length}, failed files: ${failedFiles}`
            );
            // Layer 1 check: every part is grouped by the compartment it belongs to.
            const partsByCompartment = {};
            allMeshes.forEach((m) => {
                const c = m.metadata?.compartmentName ?? '(none)';
                partsByCompartment[c] = (partsByCompartment[c] || 0) + 1;
            });
            console.log('[flow] parts per compartment:', partsByCompartment);

            setTimeout(() => setLoadingProgress({ loaded: 0, total: 0 }), 400);
        };
        await loadAllComponents();
    }, []);

    const onSceneReady = useCallback((scene, engine) => {
        sceneRef.current = scene;
        engineRef.current = engine;
        loadActiveModel();
    }, [loadActiveModel]);

    // Tear down the current model and load another one into the same scene.
    const switchModel = useCallback((id) => {
        if (id === getActiveModelId() || loadingProgress.total > 0) return;

        setActiveModel(id);
        organizedRef.current = organizeByCompartments();

        // Reset all view/selection state for the incoming model.
        setActiveModelId(id);
        setViewMode('asset');
        setSelectedCompartment(null);
        setSelectedParts([]);
        setSelectedComponentType(null);
        setIsolatedCompartments(new Set());
        setHiddenPartsByCompartment({});
        setHullPartMeshesByCompartment({});
        setLoadedCompartments({});
        loadedCompartmentsRef.current = {};
        setContextMenu({ visible: false, position: { x: 0, y: 0 }, target: { compartmentName: null, partId: null } });

        clearScene(sceneRef.current);
        loadActiveModel();
    }, [loadActiveModel, loadingProgress.total]);

    useEffect(() => {
        // compartment view camera centering is handled inside enterCompartmentView
        // after detail meshes load — no centering needed here.
        if (viewMode === 'hullPart' && selectedParts.length === 1) {
            setTimeout(() => centerOnSelection(sceneRef.current, 'part', selectedParts[0]), 80);
        }
    }, [viewMode, selectedCompartment, selectedParts]);

    useEffect(() => {
        if (isolatedCompartments.size === 1) {
            setTimeout(() => centerOnSelection(sceneRef.current, 'compartment', Array.from(isolatedCompartments)[0]), 100);
        }
    }, [isolatedCompartments]);

    const isLoading = loadingProgress.total > 0 && loadingProgress.loaded < loadingProgress.total;

    const formatCompartmentName = (name) => {
        if (!name) return '';
        return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };

    const breadcrumbItems = useMemo(() => {
        const items = [{ label: getActiveModel().name ?? 'FPSO', onClick: () => { handleReset(); } }];
        if (selectedCompartment) {
            const group = getFunctionalityGroup(selectedCompartment);
            if (group) {
                items.push({ label: group, onClick: null });
            }
            items.push({
                label: formatCompartmentName(selectedCompartment),
                onClick: viewMode !== 'compartment' ? () => enterCompartmentView(selectedCompartment) : null,
            });
        }
        if (viewMode === 'hullPart' && selectedParts.length === 1) {
            const displayName = getPartDisplayName(selectedParts[0]);
            if (displayName) {
                items.push({ label: formatCompartmentName(displayName), onClick: null });
            }
        }
        return items;
    }, [selectedCompartment, viewMode, selectedParts, handleReset, enterCompartmentView, activeModelId]);

    const breadcrumbEl = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 0, fontSize: 14, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
            {breadcrumbItems.map((item, i) => (
                <React.Fragment key={i}>
                    {i > 0 && (
                        <span style={{ color: 'rgba(255,255,255,0.35)', margin: '0 8px', fontSize: 13, userSelect: 'none' }}>/</span>
                    )}
                    {item.onClick ? (
                        <span
                            onClick={item.onClick}
                            style={{
                                color: 'rgba(255,255,255,0.65)',
                                cursor: 'pointer',
                                fontWeight: 500,
                                transition: 'color 0.15s',
                            }}
                            onMouseEnter={(e) => e.target.style.color = '#fff'}
                            onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.65)'}
                        >
                            {item.label}
                        </span>
                    ) : (
                        <span style={{ color: '#fff', fontWeight: 600 }}>
                            {item.label}
                        </span>
                    )}
                </React.Fragment>
            ))}
        </div>
    );

    return (
        <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 5000 }}>
                <AppHeader
                    breadcrumbs={breadcrumbEl}
                    rightSlot={
                        <ModelSwitcher
                            models={listModels()}
                            activeModelId={activeModelId}
                            disabled={loadingProgress.total > 0}
                            onSelect={switchModel}
                        />
                    }
                />
            </div>

            <div style={{
                position: 'fixed', top: HEADER_HEIGHT, left: SIDEBAR_WIDTH,
                width: `calc(100% - ${SIDEBAR_WIDTH}px - ${viewMode !== 'asset' ? 220 : 0}px)`,
                height: `calc(100vh - ${HEADER_HEIGHT}px)`, zIndex: 1,
            }}>
                <BabylonScene
                    loadedCompartments={loadedCompartments}
                    viewMode={viewMode}
                    selectedCompartment={selectedCompartment}
                    onCompartmentSelect={handleCompartmentSelect}
                    onSceneReady={onSceneReady}
                />
            </div>

            <LoadingPill progress={loadingProgress.loaded} total={loadingProgress.total} />

            {Object.keys(organizedRef.current).length > 0 && (
                <BabylonSidebar
                    shipData={getActiveModel().data}
                    loadedCompartments={loadedCompartments}
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
                    viewMode={viewMode}
                    compartmentVisibility={compartmentVisibility}
                    componentTypeVisibility={componentTypeVisibility}
                    onToggleCompartment={toggleCompartmentVisibility}
                    onToggleComponentType={toggleComponentTypeVisibility}
                    selectedComponentType={selectedComponentType}
                    topOffset={HEADER_HEIGHT}
                />
            )}

            {viewMode !== 'asset' && (
                <ComponentTypesRail
                    componentTypeVisibility={componentTypeVisibility}
                    onToggle={toggleComponentTypeVisibility}
                />
            )}

            <AxisController sceneRef={sceneRef} />

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

export default BabylonViewer;
