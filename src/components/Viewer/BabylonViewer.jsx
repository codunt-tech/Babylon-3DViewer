import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import BabylonScene from './BabylonScene';
import BabylonSidebar from '../Sidebar/BabylonSidebar';
import ContextMenu from '../ContextMenu/ContextMenu';
import AxisController from '../Toolbar/AxisController';
import { AppHeader, LoadingPill, ComponentTypesRail, HEADER_HEIGHT, SIDEBAR_WIDTH } from '../../components/viewerShell';
import { getCompartmentNamesFromShipData, organizeByCompartments } from '../../services/hierarchyService';
import { loadGLBFile, compartmentHasInterior, evictInteriorFromCompartment, INTERIOR_TYPES, SHELL_TYPES } from '../../services/modelLoader';
import { centerModel, centerOnSelection } from '../../services/cameraService';
import { decodePartId, getPartDisplayName } from '../../utils/partIdUtils';
import { getMeshPartId } from '../../utils/meshUtils';
import { TestFPSOStruc } from '../../data/shipData';

const initialOrganizedCompartments = organizeByCompartments();

const BabylonViewer = () => {
    const sceneRef = useRef(null);
    const engineRef = useRef(null);
    const rightClickTargetRef = useRef({ compartmentName: null, partId: null });
    const rightClickMeshRef = useRef(null);
    const interiorCacheOrderRef = useRef([]);
    const loadedCompartmentsRef = useRef({});

    const compartmentNames = useMemo(() => getCompartmentNamesFromShipData(), []);

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

    const loadCompartmentInterior = useCallback(async (compartmentName) => {
        const scene = sceneRef.current;
        if (!scene) return;

        const compartmentData = initialOrganizedCompartments[compartmentName];
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
        while (order.length > 4) {
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
    }, []);

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

        // ── Asset view: left-click only selects/highlights the compartment ──
        if (viewMode === 'asset') {
            if (compartmentName) {
                setSelectedCompartment((prev) => (prev === compartmentName ? null : compartmentName));
                setSelectedParts(partId ? [partId] : []);
            } else {
                setSelectedCompartment(null);
                setSelectedParts([]);
            }
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
    }, [viewMode, selectedCompartment, enterCompartmentView]);

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

        if (sceneRef.current && sceneRef.current.activeCamera) {
            const all = sceneRef.current.meshes.filter((m) => m.metadata?.compartmentName && !m.isDisposed() && m.getTotalVertices?.() > 0);
            centerModel(sceneRef.current, all, sceneRef.current.activeCamera, true);
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
                    Object.keys(initialOrganizedCompartments).forEach((k) => { vis[k] = k === actingCompartment; });
                    setCompartmentVisibility(vis);
                }
                break;
            case 'fitToScreen':
                if (actingPart) centerOnSelection(sceneRef.current, 'part', actingPart);
                else if (actingCompartment) centerOnSelection(sceneRef.current, 'compartment', actingCompartment);
                else if (sceneRef.current) {
                    const all = sceneRef.current.meshes.filter((m) => m.metadata?.compartmentName && !m.isDisposed() && m.getTotalVertices?.() > 0);
                    centerModel(sceneRef.current, all, sceneRef.current.activeCamera, true);
                }
                break;
            case 'compartmentView':
                if (actingCompartment) enterCompartmentView(actingCompartment);
                break;
            case 'hullPartView':
                handleEnterHullPartView(actingPart, null);
                break;
            case 'backToAsset':
                setViewMode('asset');
                setSelectedCompartment(null);
                setSelectedParts([]);
                setSelectedComponentType(null);
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
    }, [selectedCompartment, selectedParts, togglePartVisibility, toggleCompartmentVisibility, enterCompartmentView, handleEnterHullPartView, handleSelectVisible]);

    const onSceneReady = useCallback((scene, engine) => {
        sceneRef.current = scene;
        engineRef.current = engine;
        
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
                            ...data, meshes: result.meshes, nodeTree: result.nodeTree, hullPartNames: result.hullPartNames,
                        };

                        const cmpObj = (newHullPartMeshesByCompartment[compartmentName] ||= {});
                        (result.meshes || []).forEach((m) => {
                            const hpn = m?.metadata?.hullPartName;
                            if (hpn) cmpObj[hpn] = true;
                        });
                        allMeshes.push(...result.meshes);
                    }
                });
                if (allMeshes.length > 0) {
                    centerModel(scene, allMeshes, scene.activeCamera, false);
                }
            }

            setLoadedCompartments(newLoaded);
            loadedCompartmentsRef.current = newLoaded;
            setHullPartMeshesByCompartment(newHullPartMeshesByCompartment);

            const initVis = {};
            Object.keys(newLoaded).forEach((n) => { initVis[n] = true; });
            setCompartmentVisibility(initVis);
            setTimeout(() => setLoadingProgress({ loaded: 0, total: 0 }), 400);
        };
        loadAllComponents();
    }, []);

    useEffect(() => {
        if (viewMode === 'compartment' && selectedCompartment) {
            setTimeout(() => centerOnSelection(sceneRef.current, 'compartment', selectedCompartment), 80);
        } else if (viewMode === 'hullPart' && selectedParts.length === 1) {
            setTimeout(() => centerOnSelection(sceneRef.current, 'part', selectedParts[0]), 80);
        }
    }, [viewMode, selectedCompartment, selectedParts]);

    useEffect(() => {
        if (isolatedCompartments.size === 1) {
            setTimeout(() => centerOnSelection(sceneRef.current, 'compartment', Array.from(isolatedCompartments)[0]), 100);
        }
    }, [isolatedCompartments]);

    const isLoading = loadingProgress.total > 0 && loadingProgress.loaded < loadingProgress.total;

    return (
        <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 5000 }}>
                <AppHeader breadcrumbs={<span style={{ color: '#fff' }}>Test FPSO</span>} />
            </div>

            <div style={{
                position: 'fixed', top: HEADER_HEIGHT, left: SIDEBAR_WIDTH,
                width: `calc(100% - ${SIDEBAR_WIDTH}px - ${viewMode !== 'asset' ? 220 : 0}px)`,
                height: `calc(100vh - ${HEADER_HEIGHT}px)`, zIndex: 1,
            }}>
                <BabylonScene
                    loadedCompartments={loadedCompartments}
                    compartmentVisibility={compartmentVisibility}
                    componentTypeVisibility={componentTypeVisibility}
                    viewMode={viewMode}
                    selectedCompartment={selectedCompartment}
                    selectedParts={selectedParts}
                    selectedComponentType={selectedComponentType}
                    hiddenPartsByCompartment={hiddenPartsByCompartment}
                    onCompartmentSelect={handleCompartmentSelect}
                    onSceneReady={onSceneReady}
                />
            </div>

            <LoadingPill progress={loadingProgress.loaded} total={loadingProgress.total} />

            {Object.keys(initialOrganizedCompartments).length > 0 && (
                <BabylonSidebar
                    shipData={TestFPSOStruc}
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
