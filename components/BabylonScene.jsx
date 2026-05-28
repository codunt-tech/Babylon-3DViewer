import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, StandardMaterial, Color3, Color4, DirectionalLight, SceneLoader } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraKeyboardMoveInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput';
import { TestFPSOStruc } from '../src/shipData';
import { AnomalyDialog, AnomalyListDialog, ContextMenu, HierarchicalSidebar } from './babylonViewerUi';

const getCompartmentNamesFromShipData = () => {
    const names = new Set();
    ['plates', 'brackets', 'stiffeners', 'shells'].forEach((componentType) => {
        if (TestFPSOStruc[componentType]) {
            TestFPSOStruc[componentType].forEach((item) => names.add(item.compartmentName));
        }
    });
    return Array.from(names);
};

const organizeByCompartments = () => {
    const compartments = {};
    ['plates', 'brackets', 'stiffeners', 'shells'].forEach(componentType => {
        if (TestFPSOStruc[componentType]) {
            TestFPSOStruc[componentType].forEach(item => {
                const compartmentName = item.compartmentName;
                if (!compartments[compartmentName]) {
                    compartments[compartmentName] = {
                        compartmentName: compartmentName,
                        uid: item.uid,
                        components: {}
                    };
                }
                compartments[compartmentName].components[componentType] = {
                    name: compartmentName + '_' + componentType.toUpperCase(),
                    path: item.link,
                    type: componentType,
                    uid: item.uid
                };
            });
        }
    });
    return compartments;
};

const initialOrganizedCompartments = organizeByCompartments();


const BabylonScene = () => {
    const HEADER_HEIGHT = 54;
    const RIGHT_RAIL_WIDTH = 220;
    const SIDEBAR_WIDTH = 300;

    const canvasRef = useRef(null);
    const sceneRef = useRef(null);
    const engineRef = useRef(null);
    const compartmentNames = useMemo(() => getCompartmentNamesFromShipData(), []);
    const [loadedCompartments, setLoadedCompartments] = useState({});
    const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, total: 0 });
    const [loadingFps, setLoadingFps] = useState(0);
    const [loadingParallelism, setLoadingParallelism] = useState(1);
    const [organizedCompartments, setOrganizedCompartments] = useState(initialOrganizedCompartments);
    const [compartmentVisibility, setCompartmentVisibility] = useState({});
    const [componentTypeVisibility, setComponentTypeVisibility] = useState({
        plates: true,
        brackets: true,
        stiffeners: true,
        compartment: true,
        shell: true,
        shells: true
    });

    // Selection and interaction states - 3-Level View Flow
    const [viewMode, setViewMode] = useState('asset'); // 'asset' | 'compartment' | 'hullPart'
    const [selectedCompartment, setSelectedCompartment] = useState(null);
    const [selectedPart, setSelectedPart] = useState(null); // Hull part selection
    const [contextMenu, setContextMenu] = useState({ visible: false, position: { x: 0, y: 0 } });
    const [isolatedCompartments, setIsolatedCompartments] = useState(new Set());
    const [isolatedParts, setIsolatedParts] = useState(new Set()); // Hull parts
    const [hiddenParts, setHiddenParts] = useState(new Set()); // Individual part hiding
    const [anomalies, setAnomalies] = useState(new Map());
    const [anomalyDialog, setAnomalyDialog] = useState({ visible: false, partName: null, existingAnomaly: null });
    const [anomalyListDialog, setAnomalyListDialog] = useState({ visible: false });
    const [selectedComponentType, setSelectedComponentType] = useState(null);
    const [currentPartPosition, setCurrentPartPosition] = useState(null);
    const [gaugingPointsEnabled, setGaugingPointsEnabled] = useState(false);

    // Keep the latest selection handler without forcing Babylon to re-initialize.
    const handleCompartmentSelectRef = useRef(null);

    useEffect(() => {
        const initialVisibility = {};
        compartmentNames.forEach((name) => {
            initialVisibility[name] = true;
        });
        setCompartmentVisibility(initialVisibility);
    }, [compartmentNames]);

    const centerModel = (scene, meshes, camera) => {
        const valid = meshes.filter(m =>
            m && !m.isDisposed() && m.getTotalVertices() > 0
        );
        if (valid.length === 0) return;

        // Force update all bounding boxes
        valid.forEach(m => m.refreshBoundingInfo());

        let min = new Vector3(Infinity, Infinity, Infinity);
        let max = new Vector3(-Infinity, -Infinity, -Infinity);

        valid.forEach(mesh => {
            const bi = mesh.getBoundingInfo();
            if (!bi) return;
            min = Vector3.Minimize(min, bi.boundingBox.minimumWorld);
            max = Vector3.Maximize(max, bi.boundingBox.maximumWorld);
        });

        const center = Vector3.Center(min, max);
        const size = max.subtract(min);
        const maxDim = Math.max(size.x, size.y, size.z);

        // ✅ Use canvas aspect ratio for proper fit
        const canvas = scene.getEngine().getRenderingCanvas();
        const aspect = canvas ? canvas.width / canvas.height : 1.6;
        const fov = camera.fov || (Math.PI / 4);

        // Fit longest dimension into view with padding
        const fitDist = (maxDim / 2) / Math.tan(fov / 2) * 1.8;

        camera.target = center;
        camera.radius = fitDist;
        camera.alpha = -Math.PI / 4;   // ✅ 45° angle — shows ship from front-side
        camera.beta = Math.PI / 3;     // ✅ ~60° — good top-down angle
        camera.lowerRadiusLimit = fitDist * 0.1;
        camera.upperRadiusLimit = fitDist * 10;
    };

    // Camera centering functionality for 3-Level View System
    const centerOnSelection = useCallback((targetType, targetName) => {
        if (!sceneRef.current) return;

        console.log(`🎯 Centering camera on ${targetType}: ${targetName}`);

        const scene = sceneRef.current;
        const camera = scene.activeCamera;
        if (!camera) return;

        let min = new Vector3(Infinity, Infinity, Infinity);
        let max = new Vector3(-Infinity, -Infinity, -Infinity);
        let hasBounds = false;

        scene.meshes.forEach((mesh) => {
            if (!mesh.metadata) return;

            if (targetType === 'compartment' && mesh.metadata.compartmentName === targetName) {
                mesh.computeWorldMatrix(true);
                mesh.refreshBoundingInfo();
                const bi = mesh.getBoundingInfo();
                if (!bi) return;
                min = Vector3.Minimize(min, bi.boundingBox.minimumWorld);
                max = Vector3.Maximize(max, bi.boundingBox.maximumWorld);
                hasBounds = true;
            } else if (targetType === 'part' && mesh.metadata.compartmentName) {
                const partName = mesh.name || `unnamed_${mesh.id}`;
                const partId = `${mesh.metadata.compartmentName}-${partName}`;
                if (partId === targetName) {
                    mesh.computeWorldMatrix(true);
                    mesh.refreshBoundingInfo();
                    const bi = mesh.getBoundingInfo();
                    if (!bi) return;
                    min = Vector3.Minimize(min, bi.boundingBox.minimumWorld);
                    max = Vector3.Maximize(max, bi.boundingBox.maximumWorld);
                    hasBounds = true;
                }
            }
        });

        if (hasBounds) {
            const center = Vector3.Center(min, max);
            const size = max.subtract(min);
            
            const maxDim = Math.max(size.x, size.y, size.z);
            const distance = maxDim * 2.5;
            
            camera.setPosition(center.add(new Vector3(distance, distance * 0.5, distance)));
            camera.setTarget(center);
        }
    }, []);



    const loadGLBFile = async (scene, filePath, compartmentName, componentName, componentType) => {
        try {
            // ✅ Skip unused data during import
            const result = await SceneLoader.ImportMeshAsync(
                "",
                "",
                filePath,
                scene,
                null,           // onProgress
                ".glb"          // ✅ explicitly tell Babylon the format
            );

            // ✅ Only process actual geometry meshes, skip cameras/lights/roots
            const geometryMeshes = result.meshes.filter(
                m => m.getTotalVertices() > 0
            );

            geometryMeshes.forEach(mesh => {
                mesh.metadata = {
                    ...mesh.metadata,
                    compartmentName,
                    componentType,
                    componentName
                };

                if (!mesh.material) return;

                let targetColor = null;
                switch (componentType) {
                    case 'brackets':
                        targetColor = new Color3(0.76, 0.71, 0.26);
                        break;
                    case 'stiffeners':
                        targetColor = new Color3(0.73, 0.73, 0.73);
                        break;
                    case 'plates':
                        targetColor = new Color3(0.286, 0.239, 0.459);
                        break;
                    case 'shells':
                    case 'shell': {
                        const pos = mesh.metadata?.POSITION;
                        const isDeck = pos === 'Deck' || mesh.name.toLowerCase().includes('deck');
                        targetColor = isDeck
                            ? new Color3(0.561, 0.737, 0.561)
                            : new Color3(0.29, 0.565, 0.886);
                        break;
                    }
                    default:
                        targetColor = new Color3(0.6, 0.6, 0.6);
                }

                const mat = new StandardMaterial(
                    `mat_${componentType}_${compartmentName}`,  // ✅ shared name = reused material
                    scene
                );
                mat.diffuseColor = targetColor;
                mat.specularColor = new Color3(0, 0, 0);
                mat.specularPower = 0;
                mat.backFaceCulling = false;
                mat.alpha = 1.0;
                mat.transparencyMode = 0;

                if (componentType === 'plates') mat.zOffset = 1;

                mesh.material = mat;

                // ✅ Edge rendering only for shells (most expensive — skip for others)
                if (componentType === 'shells' || componentType === 'shell') {
                    mesh.enableEdgesRendering(0.9, true);
                    mesh.edgesWidth = 2.0;
                    mesh.edgesColor = new Color4(1, 1, 1, 0.85);
                }

                // ✅ Freeze mesh transforms (saves CPU each frame since ship is static)
                mesh.freezeWorldMatrix();
            });

            return {
                meshes: geometryMeshes,
                success: geometryMeshes.length > 0,
                compartmentName,
                componentName,
                componentType
            };
        } catch (error) {
            console.error(`Error loading GLB: ${filePath}`, error);
            return { meshes: [], success: false };
        }
    };   // ← correct closing for the loadGLBFile arrow function

    const loadedCompartmentsRef = useRef({});

    useEffect(() => {
        loadedCompartmentsRef.current = loadedCompartments;
    }, [loadedCompartments]);

    const loadCompartment = useCallback(async (compartmentName) => {
        const scene = sceneRef.current;
        if (!scene) return;

        const compartmentData = organizedCompartments[compartmentName];
        if (!compartmentData) return;

        // Dispose using ref (not stale closure)
        Object.values(loadedCompartmentsRef.current).forEach(compartment => {
            Object.values(compartment.loadedComponents || {}).forEach(comp => {
                (comp.meshes || []).forEach(mesh => {
                    if (mesh && !mesh.isDisposed()) mesh.dispose(false, true);
                });
            });
        });
        setLoadedCompartments({});
        loadedCompartmentsRef.current = {};

        let allFiles = [];
        Object.values(compartmentData.components).forEach(comp => {
            allFiles.push({
                type: comp.type,
                data: comp,
                compartmentName: compartmentName
            });
        });

        setLoadingProgress({ loaded: 0, total: allFiles.length });
        let allMeshes = [];
        
        const newLoadedCompartments = {
            [compartmentName]: { ...compartmentData, loadedComponents: {} }
        };

        const results = await Promise.all(
            allFiles.map(async ({ type, data, compartmentName }) => {
                const result = await loadGLBFile(scene, data.path, compartmentName, data.name, type);
                setLoadingProgress(prev => ({ ...prev, loaded: prev.loaded + 1 }));
                return { type, data, result, compartmentName };
            })
        );

        results.forEach(({ type, data, result, compartmentName }) => {
            if (result.success) {
                newLoadedCompartments[compartmentName].loadedComponents[type] = {
                    ...data,
                    meshes: result.meshes
                };
                allMeshes.push(...result.meshes);
            }
        });

        setLoadedCompartments(newLoadedCompartments);
        
        const initialVisibility = { [compartmentName]: true };
        setCompartmentVisibility(initialVisibility);

        if (allMeshes.length > 0) {
            setTimeout(() => {
                const scene = sceneRef.current;
                if (!scene) return;
                centerModel(scene, allMeshes, scene.activeCamera);
            }, 500);
        }
        
        setTimeout(() => setLoadingProgress({ loaded: 0, total: 0 }), 500);
    }, [organizedCompartments]);

    // Close context menu when clicking elsewhere
    useEffect(() => {
        const handleClickOutside = () => {
            setContextMenu(prev => ({ ...prev, visible: false }))
        }

        if (contextMenu.visible) {
            document.addEventListener('click', handleClickOutside)
            return () => document.removeEventListener('click', handleClickOutside)
        }
    }, [contextMenu.visible])

    // Action handlers
    const handleIsolate = useCallback((compartmentName) => {
        console.log(`🔍 Isolating ${compartmentName}`)
        setIsolatedCompartments(new Set([compartmentName]))
        
        // Apply isolation visibility to meshes
        Object.values(loadedCompartments).forEach(compartment => {
            Object.values(compartment.loadedComponents).forEach(component => {
                if (component.meshes) {
                    const shouldBeVisible = compartment.compartmentName === compartmentName && 
                                          componentTypeVisibility[component.type] &&
                                          compartmentVisibility[compartment.compartmentName] !== false
                    component.meshes.forEach(mesh => {
                        mesh.isVisible = shouldBeVisible
                    })
                }
            })
        })
    }, [loadedCompartments, componentTypeVisibility, compartmentVisibility])

    const handleHide = useCallback((compartmentName) => {
        console.log(`👁️‍🗨️ Hiding ${compartmentName}`)
        setCompartmentVisibility(prev => ({
            ...prev,
            [compartmentName]: false
        }))
    }, [])

    const handleIsolateCompartment = useCallback((compartmentName) => {
        if (isolatedCompartments.has(compartmentName)) {
            setIsolatedCompartments(new Set());
            const allVisible = {};
            Object.keys(organizedCompartments).forEach(comp => {
                allVisible[comp] = true;
            });
            setCompartmentVisibility(allVisible);
        } else {
            setIsolatedCompartments(new Set([compartmentName]));
        }
    }, [isolatedCompartments, organizedCompartments]);

    const handleShowAll = useCallback(() => {
        console.log(`👁️ Show All Triggered`)
        setIsolatedCompartments(new Set())
        
        // Show all compartments
        const allVisible = {}
        Object.keys(loadedCompartments).forEach(compartmentName => {
            allVisible[compartmentName] = true
        })
        setCompartmentVisibility(allVisible)
        
        // Apply visibility to all meshes
        Object.values(loadedCompartments).forEach(compartment => {
            Object.values(compartment.loadedComponents).forEach(component => {
                if (component.meshes) {
                    component.meshes.forEach(mesh => {
                        mesh.isVisible = componentTypeVisibility[component.type]
                    })
                }
            })
        })
    }, [loadedCompartments, componentTypeVisibility])

    const handleReset = useCallback(() => {
        console.log(`🔄 Reset View Triggered`)
        setViewMode('asset')
        setSelectedCompartment(null)
        setSelectedPart(null)
        setSelectedComponentType(null)
        setIsolatedCompartments(new Set())
        setIsolatedParts(new Set())
        setHiddenParts(new Set())
        setAnomalies(new Map())
        setAnomalyDialog({ visible: false, partName: null, existingAnomaly: null })
        setAnomalyListDialog({ visible: false })
        handleShowAll()
    }, [handleShowAll])

    const handleSelectComponentType = useCallback((componentType) => {
        if (viewMode === 'compartment' && selectedCompartment) {
            setSelectedComponentType(componentType);
        }
    }, [viewMode, selectedCompartment]);

    const handleCreateAnomaly = useCallback((partId) => {
        if (partId && (viewMode === 'compartment' || viewMode === 'hullPart')) {
            const existingAnomaly = anomalies.get(partId);
            setAnomalyDialog({
                visible: true,
                partName: partId,
                existingAnomaly: existingAnomaly || null
            });
        }
    }, [viewMode, anomalies]);

    const handleSaveAnomaly = useCallback((partId, anomalyData) => {
        setAnomalies(prev => {
            const next = new Map(prev);
            next.set(partId, {
                ...anomalyData,
                createdAt: new Date().toISOString(),
                partId,
                position: currentPartPosition || null
            });
            return next;
        });
        setAnomalyDialog({ visible: false, partName: null, existingAnomaly: null });
    }, [currentPartPosition]);

    const handleRemoveAnomaly = useCallback((partId) => {
        setAnomalies(prev => {
            const next = new Map(prev);
            next.delete(partId);
            return next;
        });
    }, []);

    const handleClearAllAnomalies = useCallback(() => {
        setAnomalies(new Map());
    }, []);

    const handleViewAnomalies = useCallback(() => {
        setAnomalyListDialog({ visible: true });
    }, []);

    const handleEditAnomalyFromList = useCallback((partId) => {
        const existingAnomaly = anomalies.get(partId);
        setAnomalyListDialog({ visible: false });
        setAnomalyDialog({
            visible: true,
            partName: partId,
            existingAnomaly: existingAnomaly || null
        });
    }, [anomalies]);

    // Navigation functions - 3-Level View Flow
    const handleEnterCompartmentView = useCallback(() => {
        if (selectedCompartment && viewMode === 'asset') {
            console.log(`📦 Entering Compartment View for: ${selectedCompartment}`)
            console.log(`📦 View mode transition: ${viewMode} → compartment`)
            setViewMode('compartment')
            setSelectedPart(null) // Clear part selection
            setSelectedComponentType(null)
            setIsolatedParts(new Set())
            setHiddenParts(new Set())
        } else {
            console.log(`❌ Cannot enter Compartment View:`, {
                selectedCompartment,
                viewMode,
                canEnter: selectedCompartment && viewMode === 'asset'
            })
        }
    }, [selectedCompartment, viewMode])

    const handleEnterHullPartView = useCallback(() => {
        if (selectedComponentType && selectedCompartment && viewMode === 'compartment') {
            console.log(`🔧 Entering Hull Part View for component type: ${selectedComponentType}`)
            setViewMode('hullPart')
        } else {
            console.log(`❌ Cannot enter Hull Part View:`, {
                selectedComponentType,
                selectedCompartment,
                viewMode,
                canEnter: selectedComponentType && selectedCompartment && viewMode === 'compartment'
            })
        }
    }, [selectedComponentType, selectedCompartment, viewMode])

    const handleBackToAssetView = useCallback(() => {
        console.log(`🔙 Returning to Asset View`)
        console.log(`🔙 View mode transition: ${viewMode} → asset`)
        setViewMode('asset')
        setSelectedCompartment(null)
        setSelectedPart(null)
        setSelectedComponentType(null)
        setIsolatedParts(new Set())
        setHiddenParts(new Set())
    }, [viewMode])

    const handleBackToCompartmentView = useCallback(() => {
        console.log(`🔙 Returning to Compartment View`)
        console.log(`🔙 View mode transition: ${viewMode} → compartment`)
        setViewMode('compartment')
        setSelectedPart(null)
        setSelectedComponentType(null)
    }, [viewMode])

    const handleHidePart = useCallback((partId) => {
        if (viewMode === 'compartment') {
            // Compartment view mode: Hide part within compartment
            console.log(`🙈 HIDE PART in compartment view: ${partId}`)
            setHiddenParts(prev => new Set([...prev, partId]))
        }
    }, [viewMode])

    const togglePartVisibility = useCallback((partId) => {
        if (!partId) return;
        setHiddenParts((prev) => {
            const next = new Set(prev);
            if (next.has(partId)) {
                next.delete(partId);
            } else {
                next.add(partId);
            }
            return next;
        });
    }, []);

    // Context menu actions - 3-Level View aware
    const handleContextAction = useCallback((action, compartmentOrPartId) => {
        
        console.log(`⚡ Context Action: ${action} on ${compartmentOrPartId}`, {
            currentViewMode: viewMode,
            selectedCompartment,
            selectedPart,
            selectedPartType: typeof selectedPart,
            selectedPartDetails: typeof selectedPart === 'string' ? {
                includesDash: selectedPart.includes('-'),
                splitResult: selectedPart.split('-'),
                compartmentFromPart: selectedPart.split('-')[0],
                partNameFromPart: selectedPart.split('-').slice(1).join('-')
            } : null
        })
        
        switch (action) {
            case 'compartmentView':
                console.log(`⚡ Context Action: Entering Compartment View`)
                handleEnterCompartmentView()
                break
            case 'hullPartView':
                console.log(`⚡ Context Action: Entering Hull Part View`)
                handleEnterHullPartView()
                break
            case 'createAnomaly':
                handleCreateAnomaly(selectedPart)
                break
            case 'editAnomaly':
                handleCreateAnomaly(selectedPart)
                break
            case 'removeAnomaly':
                if (selectedPart) {
                    handleRemoveAnomaly(selectedPart)
                }
                break
            case 'clearAllAnomalies':
                handleClearAllAnomalies()
                break
            case 'viewAnomalies':
                handleViewAnomalies()
                break
            case 'backToAsset':
                console.log(`⚡ Context Action: Back to Asset View`)
                handleBackToAssetView()
                break
            case 'backToCompartment':
                console.log(`⚡ Context Action: Back to Compartment View`)
                handleBackToCompartmentView()
                break
            case 'hide':
                if (viewMode === 'compartment' && selectedPart) {
                    console.log(`⚡ Context Action: Hide Part ${selectedPart}`)
                    handleHidePart(selectedPart)
                    if (sceneRef.current) {
                        sceneRef.current.meshes.forEach(mesh => {
                            const pName = mesh.name;
                            const pId = `${selectedCompartment}-${pName}`;
                            if (pId === selectedPart) mesh.isVisible = false;
                        });
                    }
                } else if (viewMode === 'asset' && selectedCompartment) {
                    console.log(`⚡ Context Action: Hide Compartment ${selectedCompartment}`)
                    handleHide(selectedCompartment)
                }
                break
            case 'fitToScreen':
                if (viewMode === 'compartment' && selectedCompartment) {
                    centerOnSelection('compartment', selectedCompartment);
                } else if (viewMode === 'hullPart' && selectedPart) {
                    centerOnSelection('part', selectedPart);
                } else {
                    // Asset view — fit all loaded meshes
                    const scene = sceneRef.current;
                    if (scene) {
                        const all = scene.meshes.filter(m => m.isVisible && m.getTotalVertices?.() > 0);
                        centerModel(scene, all, scene.activeCamera);
                    }
                }
                break
            case 'showAll':
                console.log(`⚡ Context Action: Show All`)
                handleShowAll()
                break
            case 'reset':
                console.log(`⚡ Context Action: Reset All`)
                handleReset()
                break
        }
    }, [viewMode, selectedCompartment, selectedPart, handleEnterCompartmentView, handleEnterHullPartView, handleCreateAnomaly, handleRemoveAnomaly, handleClearAllAnomalies, handleViewAnomalies, handleBackToAssetView, handleBackToCompartmentView, handleHide, handleHidePart, handleShowAll, handleReset])

    // Handle 3-Level selection: Asset → Compartment → Hull Part
    const handleCompartmentSelect = useCallback((compartmentName, partId, position, isRightClick, clickedMesh, partPosition) => {
        if (partPosition) setCurrentPartPosition(partPosition);

        // ─── RIGHT CLICK ──────────────────────────────────────────────
        if (isRightClick) {
            if (compartmentName) setSelectedCompartment(compartmentName);
            if (partId && viewMode === 'compartment') setSelectedPart(partId);
            if (position) setContextMenu({ visible: true, position });
            return;
        }

        // ─── LEFT CLICK ───────────────────────────────────────────────
        setContextMenu({ visible: false, position: { x: 0, y: 0 } });

        // Sidebar click (partId is null) — load compartment
        if (!partId && compartmentName) {
            loadCompartment(compartmentName);          // ✅ always load fresh
            setSelectedCompartment(compartmentName);
            setSelectedPart(null);
            setSelectedComponentType(null);
            setViewMode('compartment');
            setIsolatedParts(new Set());
            setHiddenParts(new Set());
            return;
        }

        // Canvas click with a part
        if (viewMode === 'compartment' && compartmentName === selectedCompartment) {
            setSelectedPart(prev => prev === partId ? null : partId);
            return;
        }

        if (viewMode === 'hullPart' && compartmentName === selectedCompartment) {
            setSelectedPart(prev => prev === partId ? null : partId);
            return;
        }

        // Canvas click in asset view — select compartment
        if (viewMode === 'asset' && compartmentName) {
            setSelectedCompartment(compartmentName);
            setSelectedPart(null);
        }
    }, [viewMode, selectedCompartment, loadCompartment]);

    useEffect(() => {
        handleCompartmentSelectRef.current = handleCompartmentSelect;
    }, [handleCompartmentSelect]);

    useEffect(() => {
        if (!canvasRef.current) return;

        // Create Babylon.js engine with alpha support
        const engine = new Engine(canvasRef.current, true, { 
            alpha: true,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true
        });
        engineRef.current = engine;
        setTimeout(() => engine.resize(), 100);

        // Create scene with an opaque background to avoid washed-out compositing
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.878, 0.914, 0.941, 1.0); // #e0e9f0
        sceneRef.current = scene;

        const camera = new ArcRotateCamera(
            "Camera",
            -Math.PI / 2,   // alpha: face the ship from the side
            Math.PI / 3,    // beta: slight top-down angle
            100,
            Vector3.Zero(),
            scene
        );
        const canvas = canvasRef.current;
        camera.attachControl(canvas, true);

        // Smooth, natural feel
        camera.inertia = 0.92;                  // high inertia = smooth glide
        camera.angularSensibilityX = 800;       // lower = more responsive horizontal
        camera.angularSensibilityY = 800;       // lower = more responsive vertical
        camera.panningSensibility = 100;        // pan speed
        camera.wheelDeltaPercentage = 0.01;     // smooth zoom
        camera.pinchDeltaPercentage = 0.01;

        // Limits
        camera.minZ = 1;
        camera.maxZ = 5000;
        camera.lowerRadiusLimit = 1;
        camera.upperRadiusLimit = 3000;
        camera.lowerBetaLimit = 0.1;           // don't go below ground
        camera.upperBetaLimit = Math.PI / 2;   // don't flip over the top

        // Let Babylon handle all pointer input natively (no manual mouse listeners)
        camera.useAutoRotationBehavior = false;

        const handleContextMenu = (event) => {
            event.preventDefault();
        };

        const handleCanvasPickAt = (offsetX, offsetY, clientX, clientY, isRightClick) => {
            const pickResult = scene.pick(offsetX, offsetY);
            const position = { x: clientX, y: clientY };

            if (pickResult.hit && pickResult.pickedMesh?.metadata?.compartmentName) {
                const { compartmentName, componentType } = pickResult.pickedMesh.metadata;
                const partName = pickResult.pickedMesh.name || 'unnamed';
                const partId = `${compartmentName}-${partName}`;
                const partPosition = pickResult.pickedPoint ? {
                    x: Number(pickResult.pickedPoint.x.toFixed(3)),
                    y: Number(pickResult.pickedPoint.y.toFixed(3)),
                    z: Number(pickResult.pickedPoint.z.toFixed(3))
                } : null;

                handleCompartmentSelectRef.current?.(
                    compartmentName, partId, position,
                    isRightClick, pickResult.pickedMesh, partPosition
                );
            } else {
                // Clicked empty space
                if (!isRightClick) {
                    setContextMenu({ visible: false, position: { x: 0, y: 0 } });
                }
            }
        };

        let pointerDownX = 0;
        let pointerDownY = 0;
        let isDrag = false;

        const onPointerDown = (e) => {
            pointerDownX = e.clientX;
            pointerDownY = e.clientY;
            isDrag = false;
        };

        const onPointerMove = (e) => {
            const dx = e.clientX - pointerDownX;
            const dy = e.clientY - pointerDownY;
            if (Math.sqrt(dx * dx + dy * dy) > 6) isDrag = true;
        };

        const onPointerUp = (e) => {
            if (isDrag) return;                      // was a drag, skip selection
            if (e.button !== 0) return;             // only left click here
            handleCanvasPickAt(e.offsetX, e.offsetY, e.clientX, e.clientY, false);
        };

        const onContextMenuEvent = (e) => {
            e.preventDefault();
            if (isDrag) return;
            handleCanvasPickAt(e.offsetX, e.offsetY, e.clientX, e.clientY, true);
        };

        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('contextmenu', onContextMenuEvent);

        canvas.style.cursor = 'grab';
        canvas.style.touchAction = 'none';

        // Create lights
        const hemisphericLight = new HemisphericLight("light", new Vector3(0, 1, 0), scene);
        hemisphericLight.intensity = 1.2;
        hemisphericLight.diffuse = new Color3(1, 1, 1);
        hemisphericLight.specular = new Color3(0, 0, 0);
        hemisphericLight.groundColor = new Color3(0.4, 0.4, 0.4);

        const dirLight1 = new DirectionalLight("dirLight1", new Vector3(-1, -1, -0.5), scene);
        dirLight1.intensity = 0.5;
        dirLight1.specular = new Color3(0, 0, 0);

        const dirLight2 = new DirectionalLight("dirLight2", new Vector3(1, -0.5, 0.5), scene);
        dirLight2.intensity = 0.3;
        dirLight2.specular = new Color3(0, 0, 0);

        // ✅ Only re-render when something changes (huge FPS saving when static)
        scene.skipFrustumClipping = false;
        engine.setHardwareScalingLevel(1.0);

        // ✅ Reduce overdraw
        scene.autoClear = true;
        scene.autoClearDepthAndStencil = true;

        // ✅ Use incremental rendering to avoid blocking the main thread
        scene.blockMaterialDirtyMechanism = true;

        const loadAllModels = async () => {
            let allFiles = [];
            Object.values(initialOrganizedCompartments).forEach(compartment => {
                Object.values(compartment.components).forEach(comp => {
                    allFiles.push({
                        type: comp.type,
                        data: comp,
                        compartmentName: compartment.compartmentName
                    });
                });
            });

            setLoadingProgress({ loaded: 0, total: allFiles.length });
            
            let allMeshes = [];
            
            const newLoadedCompartments = {};
            Object.keys(initialOrganizedCompartments).forEach(k => {
                newLoadedCompartments[k] = { ...initialOrganizedCompartments[k], loadedComponents: {} };
            });

            const results = await Promise.all(
                allFiles.map(async ({ type, data, compartmentName }) => {
                    const result = await loadGLBFile(scene, data.path, compartmentName, data.name, type);
                    setLoadingProgress(prev => ({ ...prev, loaded: prev.loaded + 1 }));
                    return { type, data, result, compartmentName };
                })
            );

            results.forEach(({ type, data, result, compartmentName }) => {
                if (result.success) {
                    newLoadedCompartments[compartmentName].loadedComponents[type] = {
                        ...data,
                        meshes: result.meshes
                    };
                    allMeshes.push(...result.meshes);
                }
            });

            setLoadedCompartments(newLoadedCompartments);
            // Set the ref so we can safely dispose them later if a single compartment is clicked
            loadedCompartmentsRef.current = newLoadedCompartments;
            
            const initialVisibility = {};
            Object.keys(newLoadedCompartments).forEach(compartmentName => {
                initialVisibility[compartmentName] = true;
            });
            setCompartmentVisibility(initialVisibility);

            if (allMeshes.length > 0) {
                setTimeout(() => {
                    const scene = sceneRef.current;
                    if (!scene) return;
                    centerModel(scene, allMeshes, scene.activeCamera);
                }, 500);
            }
            
            setTimeout(() => setLoadingProgress({ loaded: 0, total: 0 }), 500);
        };

        loadAllModels();

        // Render loop
        engine.runRenderLoop(() => {
            scene.render();
        });

        // Handle window resize
        const handleResize = () => {
            engine.resize();
        };
        window.addEventListener('resize', handleResize);

        // Cleanup function
        return () => {
            window.removeEventListener('resize', handleResize);
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointermove', onPointerMove);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('contextmenu', onContextMenuEvent);
            scene.dispose();
            engine.dispose();
        };
    }, []);

    // Toggle compartment visibility
    const toggleCompartmentVisibility = useCallback((compartmentName) => {
        setCompartmentVisibility(prev => {
            const newVisibility = { ...prev, [compartmentName]: !prev[compartmentName] };
            
            // Apply visibility to all meshes in this compartment
            if (loadedCompartments[compartmentName]) {
                Object.values(loadedCompartments[compartmentName].loadedComponents).forEach(component => {
                    if (component.meshes) {
                        const isIsolated = isolatedCompartments.size > 0;
                        const isThisIsolated = isolatedCompartments.has(compartmentName);
                        
                        component.meshes.forEach(mesh => {
                            let shouldBeVisible;
                            if (isIsolated) {
                                // In isolation mode, only show isolated compartments
                                shouldBeVisible = isThisIsolated && newVisibility[compartmentName] && componentTypeVisibility[component.type];
                            } else {
                                // Normal mode
                                shouldBeVisible = newVisibility[compartmentName] && componentTypeVisibility[component.type];
                            }
                            mesh.isVisible = shouldBeVisible;
                        });
                    }
                });
            }
            
            return newVisibility;
        });
    }, [loadedCompartments, componentTypeVisibility, isolatedCompartments]);

    // Toggle component type visibility
    const toggleComponentTypeVisibility = useCallback((componentType) => {
        setComponentTypeVisibility(prev => {
            const newVisibility = { ...prev, [componentType]: !prev[componentType] };
            
            // Apply visibility to all meshes of this type
            Object.values(loadedCompartments).forEach(compartment => {
                Object.entries(compartment.loadedComponents).forEach(([type, component]) => {
                    if (type === componentType && component.meshes) {
                        const isIsolated = isolatedCompartments.size > 0;
                        const isThisIsolated = isolatedCompartments.has(compartment.compartmentName);
                        
                        component.meshes.forEach(mesh => {
                            let shouldBeVisible;
                            if (isIsolated) {
                                // In isolation mode, only show isolated compartments
                                shouldBeVisible = isThisIsolated && newVisibility[componentType] && compartmentVisibility[compartment.compartmentName];
                            } else {
                                // Normal mode
                                shouldBeVisible = newVisibility[componentType] && compartmentVisibility[compartment.compartmentName];
                            }
                            mesh.isVisible = shouldBeVisible;
                        });
                    }
                });
            });
            
            return newVisibility;
        });
    }, [loadedCompartments, compartmentVisibility, isolatedCompartments]);

    // Apply highlighting and visibility for 3-Level View System
    useEffect(() => {
        if (Object.keys(loadedCompartments).length === 0) return;
        
        Object.values(loadedCompartments).forEach(compartment => {
            Object.values(compartment.loadedComponents).forEach(component => {
                if (component.meshes) {
                    component.meshes.forEach(mesh => {
                        if (mesh.material) {
                            // Create unique part ID for individual mesh selection
                            const partName = mesh.name || `unnamed_${mesh.id}`;
                            const partId = `${compartment.compartmentName}-${partName}`;
                            
                            // Determine visibility based on 3-level view system
                            let shouldBeVisible = compartmentVisibility[compartment.compartmentName] !== false && 
                                                 componentTypeVisibility[component.type] !== false;
                            
                            if (viewMode === 'compartment' && selectedCompartment) {
                                // Compartment View: Only show the selected compartment
                                shouldBeVisible = (compartment.compartmentName === selectedCompartment) && shouldBeVisible;
                            } else if (viewMode === 'hullPart' && selectedCompartment) {
                                // Hull Part View: Only show the compartment containing the selected part
                                shouldBeVisible = (compartment.compartmentName === selectedCompartment) && shouldBeVisible;
                            }
                            
                            // Apply part-level visibility
                            let partVisible = shouldBeVisible;
                            
                            if (viewMode === 'hullPart' && selectedComponentType) {
                                // Hull Part View: Show selected component type in selected compartment
                                partVisible = (component.type === selectedComponentType) && shouldBeVisible;
                            } else if (viewMode === 'compartment' && selectedCompartment === compartment.compartmentName) {
                                // Compartment View: Show all parts, but check for hidden parts
                                if (hiddenParts.has(partId)) {
                                    partVisible = false;
                                }
                            }
                            
                            // Apply visibility
                            mesh.isVisible = partVisible;
                            
                            // Handle selection highlighting
                            const isCompartmentSelected = selectedCompartment === compartment.compartmentName && viewMode === 'asset';
                            const isPartSelected = selectedPart === partId && viewMode === 'compartment';
                            
                            if (partVisible) {
                                if (isPartSelected) {
                                    // Strong highlight for selected part
                                    mesh.material.emissiveColor = new Color3(0, 0.5, 0); // Green glow
                                    mesh.material.emissiveIntensity = 0.5;
                                } else if (isCompartmentSelected) {
                                    // Mild highlight for compartment selection in asset view
                                    mesh.material.emissiveColor = new Color3(0, 0.2, 0); // Green glow
                                    mesh.material.emissiveIntensity = 0.2;
                                } else if (viewMode === 'compartment' && selectedCompartment === compartment.compartmentName) {
                                    // Very mild highlight for parts in compartment view
                                    mesh.material.emissiveColor = new Color3(0, 0.1, 0); // Green glow
                                    mesh.material.emissiveIntensity = 0.1;
                                } else {
                                    // No highlight
                                    mesh.material.emissiveColor = new Color3(0, 0, 0);
                                    mesh.material.emissiveIntensity = 0;
                                }

                                // White edge highlight for selected part
                                const componentType = component.type;
                                if (isPartSelected) {
                                    // Enable bright edge rendering for selected part
                                    if (!mesh._edgesRendererEnabled) {
                                        mesh.enableEdgesRendering(0.9, true);
                                    }
                                    mesh.edgesWidth = 6.0;
                                    mesh.edgesColor = new Color4(1, 1, 1, 1.0);  // solid white
                                } else if (componentType === 'shells' || componentType === 'shell') {
                                    // Keep subtle grid edges on shells
                                    if (!mesh._edgesRendererEnabled) {
                                        mesh.enableEdgesRendering(0.9, true);
                                    }
                                    mesh.edgesWidth = 2.0;
                                    mesh.edgesColor = new Color4(1, 1, 1, 0.85);
                                } else {
                                    // Disable edges on non-shell, non-selected
                                    if (mesh._edgesRenderer) {
                                        mesh.disableEdgesRendering();
                                    }
                                }
                            } else {
                                // Reset emissive but preserve component color
                                mesh.material.emissiveColor = new Color3(0, 0, 0);
                                mesh.material.emissiveIntensity = 0;
                            }
                        }
                    });
                }
            });
        });
    }, [selectedCompartment, selectedPart, selectedComponentType, viewMode, loadedCompartments, compartmentVisibility, componentTypeVisibility, hiddenParts]);

    // Auto-center when selection changes
    useEffect(() => {
        if (viewMode === 'compartment' && selectedCompartment) {
            // Center on selected compartment
            setTimeout(() => centerOnSelection('compartment', selectedCompartment), 100);
        } else if (viewMode === 'hullPart' && selectedPart) {
            // Center on selected part
            setTimeout(() => centerOnSelection('part', selectedPart), 100);
        } else if (viewMode === 'hullPart' && selectedComponentType && selectedCompartment) {
            setTimeout(() => centerOnSelection('compartment', selectedCompartment), 100);
        }
    }, [viewMode, selectedCompartment, selectedPart, selectedComponentType, centerOnSelection]);

    // Auto-center when isolation changes
    useEffect(() => {
        if (isolatedCompartments.size === 1) {
            const isolatedCompartment = Array.from(isolatedCompartments)[0];
            setTimeout(() => centerOnSelection('compartment', isolatedCompartment), 100);
        } else if (isolatedParts.size === 1) {
            const isolatedPart = Array.from(isolatedParts)[0];
            setTimeout(() => centerOnSelection('part', isolatedPart), 100);
        }
    }, [isolatedCompartments, isolatedParts, centerOnSelection]);

    const getTotalLoadedComponents = () => {
        return Object.values(loadedCompartments).reduce((total, compartment) => 
            total + Object.keys(compartment.loadedComponents).length, 0
        );
    };

    const isLoading = loadingProgress.total > 0 && loadingProgress.loaded < loadingProgress.total;

    const getFunctionalityGroup = (name) => {
        if (!name) return '';
        const upper = name.toUpperCase();
        if (/^CARGO_TANK/.test(upper)) return 'Cargo';
        if (/^AFT_PEAK/.test(upper)) return 'Aft Peak';
        if (/^FORE_PEAK/.test(upper)) return 'Fore Peak';
        if (/^ENGINE_ROOM/.test(upper)) return 'Engine Room';
        if (/^CHAIN_LOCKER/.test(upper)) return 'Chain Locker';
        if (/^DISTILLED_WATER/.test(upper)) return 'Distilled Water';
        if (/^FWD_DEEP/.test(upper)) return 'Fwd Deep';
        if (/^POTABLE_WATER/.test(upper)) return 'Potable Water';
        if (/^PUMP_ROOM/.test(upper)) return 'Pump Room';
        if (/^SLOP_TANK/.test(upper)) return 'Slop Tank';
        if (/^STEERING_GEAR/.test(upper)) return 'Steering Gear';
        if (/^STERN_TB/.test(upper)) return 'Stern TB';
        if (/^STORAGE_SPACES/.test(upper)) return 'Storage Spaces';
        return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
    };

    const renderBreadcrumbs = () => {
        let crumbs = [
            <span key="root" style={{color: '#4DA2FF', cursor: 'pointer', transition: 'color 0.2s'}} 
                  onClick={handleReset}
                  onMouseEnter={e => e.target.style.color = '#73bbff'}
                  onMouseLeave={e => e.target.style.color = '#4DA2FF'}>
                TEST FPSO
            </span>
        ];
        
        if (selectedCompartment && viewMode !== 'asset') {
            const funcGroup = getFunctionalityGroup(selectedCompartment);
            if (funcGroup) {
                crumbs.push(<span key="sep1" style={{margin: '0 8px', color: 'rgba(255,255,255,0.4)'}}>/</span>);
                crumbs.push(<span key="func" style={{color: '#4DA2FF'}}>{funcGroup}</span>);
            }
            
            crumbs.push(<span key="sep2" style={{margin: '0 8px', color: 'rgba(255,255,255,0.4)'}}>/</span>);
            crumbs.push(
                <span key="comp" 
                      style={{color: selectedPart ? '#4DA2FF' : 'rgba(255,255,255,0.92)', cursor: selectedPart ? 'pointer' : 'default', transition: 'color 0.2s'}} 
                      onClick={() => selectedPart && handleCompartmentSelectRef.current?.(selectedCompartment, null, null, false, null, null)}
                      onMouseEnter={e => selectedPart && (e.target.style.color = '#73bbff')}
                      onMouseLeave={e => selectedPart && (e.target.style.color = '#4DA2FF')}>
                    {selectedCompartment.replace(/_/g, ' ')}
                </span>
            );
            
            if (selectedPart) {
                const partName = selectedPart.includes('-') ? selectedPart.split('-').slice(1).join('-') : selectedPart;
                crumbs.push(<span key="sep3" style={{margin: '0 8px', color: 'rgba(255,255,255,0.4)'}}>/</span>);
                crumbs.push(<span key="part" style={{color: 'rgba(255,255,255,0.92)'}}>{partName}</span>);
            }
        } else {
            crumbs.push(<span key="sep1" style={{margin: '0 8px', color: 'rgba(255,255,255,0.4)'}}>/</span>);
            crumbs.push(<span key="full" style={{color: 'rgba(255,255,255,0.92)'}}>Full Asset</span>);
        }
        
        return <div style={{ 
            display: 'flex',
            alignItems: 'center',
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: 'nowrap'
        }}>{crumbs}</div>;
    };

    return (
        <div style={{ width: '100%', height: '100vh', position: 'relative' }}>
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: HEADER_HEIGHT,
                    background: 'linear-gradient(90deg, #08233b 0%, #041526 100%)',
                    borderBottom: '1px solid rgba(255,255,255,0.10)',
                    zIndex: 5000,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 16px',
                    gap: 12
                }}
            >
                <img src="/images/logo.svg" alt="ABS" style={{ height: 26 }} />
                {renderBreadcrumbs()}
            </div>

            <canvas
                ref={canvasRef}
                style={{
                    position: 'fixed',
                    top: HEADER_HEIGHT,
                    left: SIDEBAR_WIDTH,
                    width: `calc(100% - ${SIDEBAR_WIDTH}px)`,
                    height: `calc(100vh - ${HEADER_HEIGHT}px)`,
                    display: 'block',
                    outline: 'none',
                    touchAction: 'none',
                    background: 'linear-gradient(180deg, #dce8f0 0%, #c8dae8 100%)',
                    zIndex: 1
                }}
            />

            {Object.keys(loadedCompartments).length === 0 && !isLoading && (
                <div style={{
                    position: 'fixed',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 500,
                    textAlign: 'center',
                    pointerEvents: 'none',
                    color: '#5a7fa8',
                    fontFamily: 'Inter, system-ui, sans-serif'
                }}>
                    <svg width="64" height="64" fill="none" stroke="currentColor"
                        strokeWidth="1.2" viewBox="0 0 24 24"
                        style={{ opacity: 0.4, marginBottom: 16 }}>
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                        <polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    <div style={{ fontSize: 16, fontWeight: 600, opacity: 0.6 }}>
                        Select a compartment from the sidebar
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.4, marginTop: 6 }}>
                        Click any compartment name to load its 3D model
                    </div>
                </div>
            )}

            {isLoading && (
                <div style={{
                    position: 'fixed',
                    left: '50%',
                    bottom: 24,
                    transform: 'translateX(-50%)',
                    zIndex: 10000,
                    background: '#ffffff',
                    color: '#0D47A1',
                    borderRadius: 9999,
                    padding: '16px 28px',
                    boxShadow: '0 18px 40px rgba(13,71,161,0.14)',
                    minWidth: '360px',
                    border: '1px solid rgba(13,71,161,0.10)',
                    fontFamily: 'Inter, system-ui, sans-serif'
                }}>
                    <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, textAlign: 'center' }}>
                        Loading compartment...
                    </div>

                    {/* ✅ Show individual file progress */}
                    <div style={{ fontSize: 12, color: '#666', textAlign: 'center', marginBottom: 10 }}>
                        {loadingProgress.loaded} of {loadingProgress.total} files loaded
                    </div>

                    <div style={{
                        width: '100%', height: 6,
                        background: 'rgba(25,118,210,0.12)',
                        borderRadius: 9999, overflow: 'hidden'
                    }}>
                        <div style={{
                            width: `${loadingProgress.total > 0
                                ? (loadingProgress.loaded / loadingProgress.total) * 100
                                : 0}%`,
                            height: '100%',
                            background: 'linear-gradient(90deg, #1976D2, #0D47A1)',
                            borderRadius: 9999,
                            transition: 'width 0.2s ease'
                        }} />
                    </div>
                </div>
            )}

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
                    anomalies={anomalies}
                    handleViewAnomalies={handleViewAnomalies}
                    handleEditAnomalyFromList={handleEditAnomalyFromList}
                    handleRemoveAnomalyFromList={handleRemoveAnomaly}
                    handleCreateAnomaly={handleCreateAnomaly}
                    gaugingPointsEnabled={gaugingPointsEnabled}
                    setGaugingPointsEnabled={setGaugingPointsEnabled}
                    topOffset={54}
                    hideBottomActions={true}
                    hideGaugingPoints={true}
                    hideComponentTypes={true}
                />
            )}



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
                anomalies={anomalies}
            />

            <AnomalyDialog
                visible={anomalyDialog.visible}
                partName={anomalyDialog.partName}
                existingAnomaly={anomalyDialog.existingAnomaly}
                onSave={(anomalyData) => handleSaveAnomaly(anomalyDialog.partName, anomalyData)}
                onCancel={() => setAnomalyDialog({ visible: false, partName: null, existingAnomaly: null })}
            />

            <AnomalyListDialog
                visible={anomalyListDialog.visible}
                anomalies={anomalies}
                onClose={() => setAnomalyListDialog({ visible: false })}
                onEditAnomaly={handleEditAnomalyFromList}
                onRemoveAnomaly={handleRemoveAnomaly}
            />
        </div>
    );
};

export default BabylonScene; 