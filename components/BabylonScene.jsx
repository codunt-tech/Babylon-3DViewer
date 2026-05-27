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
    const [organizedCompartments, setOrganizedCompartments] = useState({});
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

    // Center the model in the scene
    const centerModel = (scene, meshes, camera) => {
        if (meshes.length === 0) return;
        
        // Calculate bounding box of all meshes
        let min = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
        let max = new Vector3(Number.MIN_VALUE, Number.MIN_VALUE, Number.MIN_VALUE);
        
        meshes.forEach(mesh => {
            if (mesh.getBoundingInfo) {
                // Force bounding info update
                mesh.refreshBoundingInfo();
                const boundingInfo = mesh.getBoundingInfo();
                const meshMin = boundingInfo.boundingBox.minimumWorld;
                const meshMax = boundingInfo.boundingBox.maximumWorld;
                
                min = Vector3.Minimize(min, meshMin);
                max = Vector3.Maximize(max, meshMax);
            }
        });
        
        // Calculate center and size
        const center = Vector3.Center(min, max);
        const size = max.subtract(min);
        const maxDimension = Math.max(size.x, size.y, size.z);
        
        // Set camera target to center
        camera.setTarget(center);
        
        // Set camera distance based on model size
        const distance = maxDimension * 2; // Adjust multiplier as needed
        camera.radius = distance;
        
        // Set better camera angles for ship viewing
        camera.alpha = Math.PI / 4; // 45 degrees horizontal
        camera.beta = Math.PI / 3;  // 60 degrees vertical
        
        console.log(`🎯 Model centered:`, {
            center: center,
            size: size,
            maxDimension: maxDimension,
            cameraDistance: distance,
            meshCount: meshes.length
        });
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
                const bi = mesh.getBoundingInfo();
                if (!bi) return;
                min = Vector3.Minimize(min, bi.boundingBox.minimumWorld);
                max = Vector3.Maximize(max, bi.boundingBox.maximumWorld);
                hasBounds = true;
            } else if (targetType === 'part' && mesh.metadata.compartmentName) {
                const partName = mesh.name || `unnamed_${Math.random().toString(36).substr(2, 9)}`;
                const partId = `${mesh.metadata.compartmentName}-${partName}`;
                if (partId === targetName) {
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

    // Organize all GLB files by compartment
    const organizeByCompartments = () => {
        const compartments = {};
        
        // Add main structure files (commented out - not loading main structure)
        // if (!compartments['MAIN_STRUCTURE']) {
        //     compartments['MAIN_STRUCTURE'] = {
        //         compartmentName: 'MAIN_STRUCTURE',
        //         uid: 'main',
        //         components: {}
        //     };
        // }
        
        // if (TestFPSOStruc.compartment) {
        //     compartments['MAIN_STRUCTURE'].components.compartment = {
        //         name: 'FPSO_COMPARTMENT',
        //         path: TestFPSOStruc.compartment,
        //         type: 'compartment'
        //     };
        // }

        // Process plates, brackets, stiffeners, and shells
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

    const loadGLBFile = async (scene, filePath, compartmentName, componentName, componentType) => {
        try {
            const result = await SceneLoader.ImportMeshAsync("", "", filePath, scene);
            
            result.meshes.forEach(mesh => {
                // Preserve existing metadata from GLB and add our custom metadata
                mesh.metadata = {
                    ...mesh.metadata, // Preserve existing metadata (like POSITION)
                    compartmentName,
                    componentType,
                    componentName
                };

                // Skip non-renderable/root nodes
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
                        const position = mesh.metadata?.POSITION;
                        const isDeck =
                            position === 'Deck' ||
                            mesh.name.toLowerCase().includes('deck');
                        targetColor = isDeck
                            ? new Color3(0.561, 0.737, 0.561) // #8fbc8f
                            : new Color3(0.29, 0.565, 0.886); // #4a90e2
                        break;
                    }
                    default:
                        targetColor = new Color3(0.6, 0.6, 0.6);
                        break;
                }

                const mat = new StandardMaterial(`mat_${mesh.name}_${Date.now()}`, scene);
                mat.diffuseColor = targetColor;
                mat.specularColor = new Color3(0, 0, 0);
                mat.specularPower = 0;
                mat.backFaceCulling = true;
                mat.alpha = 1.0;
                mat.transparencyMode = 0; // BABYLON.Material.MATERIAL_OPAQUE
                mat.needDepthPrePass = false;
                mat.disableDepthWrite = false;

                if (componentType === 'plates') {
                    // Avoid z-fighting against shell surfaces.
                    mat.zOffset = 1;
                }

                mesh.material = mat;
                mat.freeze();

                if (componentType === 'shells' || componentType === 'shell') {
                    mesh.enableEdgesRendering(0.9, true);
                    mesh.edgesWidth = 2.0;
                    mesh.edgesColor = new Color4(1, 1, 1, 0.85);
                }
            });
            
            return { 
                meshes: result.meshes || [], 
                // Treat "no meshes produced" as a load failure.
                success: (result.meshes || []).length > 0,
                compartmentName,
                componentName,
                componentType
            };
        } catch (error) {
            console.error(`Error loading GLB file ${filePath}:`, error);
            return { meshes: [], success: false };
        }
    };

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
                } else if (viewMode === 'asset' && selectedCompartment) {
                    console.log(`⚡ Context Action: Hide Compartment ${selectedCompartment}`)
                    handleHide(selectedCompartment)
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
        if (partPosition) {
            setCurrentPartPosition(partPosition);
        }
        
        // Enhanced logging for 3-level selection
        if (clickedMesh) {
            console.log(`🎯 3-LEVEL BABYLON SELECTION:`, {
                compartmentName: compartmentName,
                partId: partId,
                clickedObjectName: clickedMesh.name,
                isRightClick,
                clickType: isRightClick ? 'Right Click' : 'Left Click',
                currentViewMode: viewMode,
                currentCompartmentSelection: selectedCompartment,
                currentPartSelection: selectedPart,
                userData: clickedMesh.metadata,
                componentType: clickedMesh.metadata?.componentType
            })
        }
        
        if (!partId) {
            // Sidebar/category selection: show only the clicked compartment.
            setSelectedCompartment(compartmentName);
            setSelectedPart(null);
            setSelectedComponentType(null);
            setViewMode('compartment');
            setIsolatedParts(new Set());
            setHiddenParts(new Set());

            // Force only the selected compartment to be visible.
            const onlySelectedVisible = {};
            Object.keys(loadedCompartments).forEach((name) => {
                onlySelectedVisible[name] = name === compartmentName;
            });
            if (!(compartmentName in onlySelectedVisible)) {
                onlySelectedVisible[compartmentName] = true;
            }
            setCompartmentVisibility(onlySelectedVisible);
            setIsolatedCompartments(new Set([compartmentName]));
        } else if (viewMode === 'asset') {
            // Asset View: Select compartment (doesn't change view automatically)
            console.log(`📦 Compartment selected in Asset View: ${compartmentName}`)
            setSelectedCompartment(compartmentName)
            setSelectedPart(null) // Clear part selection
            
        } else if (viewMode === 'compartment' && selectedCompartment === compartmentName) {
            // Compartment View: Select part (doesn't change view automatically)
            const stringPartId = partId ? String(partId) : null
            
            if (stringPartId && stringPartId !== selectedPart) {
                console.log(`🔧 Part selected in Compartment View: ${stringPartId}`)
                console.log(`🔧 Part ID details:`, {
                    partId: stringPartId,
                    partIdType: typeof stringPartId,
                    includesDash: stringPartId.includes('-'),
                    splitResult: stringPartId.split('-'),
                    compartmentFromPart: stringPartId.split('-')[0],
                    partNameFromPart: stringPartId.split('-').slice(1).join('-')
                })
                setSelectedPart(stringPartId)
            } else if (stringPartId === selectedPart) {
                console.log(`🔧 Deselecting part: ${stringPartId}`)
                setSelectedPart(null)
            }
        } else if (viewMode === 'hullPart') {
            // Hull Part View: Additional part selection logging
            const stringPartId = partId ? String(partId) : null
            console.log(`🔧 Hull Part View - Part clicked:`, {
                clickedPartId: stringPartId,
                currentSelectedPart: selectedPart,
                compartmentName: compartmentName,
                isRightClick: isRightClick,
                clickedMeshName: clickedMesh?.name,
                clickedMeshUserData: clickedMesh?.metadata
            })
        }
        
        // Handle context menu - Show for both compartment and part selections
        if (isRightClick && position) {
            console.log(`🖱️ Showing context menu at:`, position, 'View Mode:', viewMode)
            setContextMenu({
                visible: true,
                position: position
            })
        } else {
            setContextMenu({ visible: false, position: { x: 0, y: 0 } })
        }
    }, [viewMode, selectedCompartment, selectedPart])

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

        // Create scene with an opaque background to avoid washed-out compositing
        const scene = new Scene(engine);
        scene.clearColor = new Color4(0.878, 0.914, 0.941, 1.0); // #e0e9f0
        sceneRef.current = scene;

        const camera = new ArcRotateCamera("Camera", Math.PI / 4, Math.PI / 3, 100, new Vector3(0, 0, 0), scene);
        const canvas = canvasRef.current;
        camera.attachControl(canvas, true);

        // Smooth native Babylon camera behavior.
        camera.panningSensibility = 120;
        camera.useCtrlForPanning = false;
        camera.inertia = 0.88;
        camera.angularSensibilityX = 2800;
        camera.angularSensibilityY = 2800;
        camera.wheelDeltaPercentage = 0.01;
        camera.pinchDeltaPercentage = 0.01;
        
        // Set camera limits
        camera.lowerRadiusLimit = 5;
        camera.upperRadiusLimit = 1000;

        const handleContextMenu = (event) => {
            event.preventDefault();
        };

        // Handle selection clicks - 3-Level View System
        const handleCanvasClick = (event) => {
            if (event.button !== 0 && event.button !== 2) {
                return;
            }
            if (event.button === 2) {
                event.preventDefault();
            }
            const pickResult = scene.pick(event.offsetX, event.offsetY);
            
            if (pickResult.hit && pickResult.pickedMesh && pickResult.pickedMesh.metadata) {
                const metadata = pickResult.pickedMesh.metadata;
                const compartmentName = metadata.compartmentName;
                
                if (compartmentName) {
                    const isRightClick = event.button === 2;
                    const position = {
                        x: event.clientX,
                        y: event.clientY
                    };
                    
                    // Create part ID for individual mesh selection
                    const partName = pickResult.pickedMesh.name || `unnamed_${Math.random().toString(36).substr(2, 9)}`;
                    const partId = `${compartmentName}-${partName}`;
                    const partPosition = pickResult.pickedPoint
                        ? {
                            x: Number(pickResult.pickedPoint.x.toFixed(3)),
                            y: Number(pickResult.pickedPoint.y.toFixed(3)),
                            z: Number(pickResult.pickedPoint.z.toFixed(3))
                        }
                        : null;
                    
                    // Enhanced logging for 3-level selection
                    console.log('🎯 BABYLON PART SELECTED:', {
                        compartmentName,
                        partName,
                        partId,
                        meshName: pickResult.pickedMesh.name,
                        clickType: isRightClick ? 'Right Click' : 'Left Click',
                        userData: pickResult.pickedMesh.metadata,
                        componentType: metadata.componentType,
                        partIdType: typeof partId,
                        partIdDetails: {
                            includesDash: partId.includes('-'),
                            splitResult: partId.split('-'),
                            compartmentFromPart: partId.split('-')[0],
                            partNameFromPart: partId.split('-').slice(1).join('-'),
                            matchesSelectedPart: partId === selectedPart
                        }
                    });

                    // Always call the latest handler (avoids stale closure during async loading).
                    handleCompartmentSelectRef.current?.(
                        compartmentName,
                        partId,
                        position,
                        isRightClick,
                        pickResult.pickedMesh,
                        partPosition
                    );
                }
            } else {
                // Clicked on empty space
                handleCompartmentSelectRef.current?.(
                    null,
                    null,
                    { x: event.clientX, y: event.clientY },
                    event.button === 2,
                    null,
                    null
                );
            }
        };

        // Add event listeners
        canvas.addEventListener('contextmenu', handleContextMenu, { passive: false });
        canvas.addEventListener('pointerdown', handleCanvasClick, { passive: false });

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

        // Load all models organized by compartments
        const getAdaptiveParallelism = (fps) => {
            if (fps < 24) return 1;
            if (fps < 36) return 2;
            return 3;
        };

        const waitNextFrame = () => new Promise((resolve) => {
            if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
                window.requestAnimationFrame(() => resolve());
                return;
            }
            setTimeout(resolve, 0);
        });

        const loadAllModels = async () => {
            const organizedMap = organizeByCompartments();
            setOrganizedCompartments(organizedMap);
            setLoadedCompartments({});
            const compartments = {};
            const totalFiles = Object.values(organizedMap).reduce((total, compartment) => 
                total + Object.keys(compartment.components).length, 0
            );
            
            setLoadingProgress({ loaded: 0, total: totalFiles });

            let loadedCount = 0;
            let allMeshes = [];
            const failedFiles = [];

            // Initialize visibility for all compartments
            const initialVisibility = {};
            Object.keys(organizedMap).forEach(compartmentName => {
                initialVisibility[compartmentName] = true;
            });
            setCompartmentVisibility(initialVisibility);

            for (const [compartmentName, compartmentData] of Object.entries(organizedMap)) {
                compartments[compartmentName] = {
                    ...compartmentData,
                    loadedComponents: {}
                };
            }

            const fileQueue = [];
            Object.entries(organizedMap).forEach(([compartmentName, compartmentData]) => {
                Object.entries(compartmentData.components).forEach(([componentType, componentData]) => {
                    fileQueue.push({ compartmentName, componentType, componentData });
                });
            });

            let queueIndex = 0;
            while (queueIndex < fileQueue.length) {
                const fpsNow = Math.round(engine.getFps ? engine.getFps() : 0);
                const adaptiveParallelism = getAdaptiveParallelism(fpsNow || 0);
                setLoadingFps(fpsNow || 0);
                setLoadingParallelism(adaptiveParallelism);

                const batch = fileQueue.slice(queueIndex, queueIndex + adaptiveParallelism);
                const loadResults = await Promise.all(
                    batch.map(async ({ compartmentName, componentType, componentData }) => {
                        const result = await loadGLBFile(
                            scene,
                            componentData.path,
                            compartmentName,
                            componentData.name,
                            componentType
                        );
                        return { compartmentName, componentType, componentData, result };
                    })
                );

                loadResults.forEach(({ compartmentName, componentType, componentData, result }) => {
                    if (result.success) {
                        compartments[compartmentName].loadedComponents[componentType] = {
                            ...componentData,
                            meshes: result.meshes
                        };
                        allMeshes.push(...result.meshes);
                    } else {
                        failedFiles.push({
                            compartmentName,
                            componentType,
                            filePath: componentData.path
                        });
                    }

                    loadedCount++;
                    setLoadingProgress({ loaded: loadedCount, total: totalFiles });

                    // Publish partial results so sidebar hullparts appear while loading.
                    setLoadedCompartments((prev) => ({
                        ...prev,
                        [compartmentName]: compartments[compartmentName]
                    }));
                });

                queueIndex += batch.length;
                await waitNextFrame();
            }

            try {
                // Wait for Babylon to finish preparing the scene (materials/textures).
                if (typeof scene.whenReadyAsync === 'function') {
                    await scene.whenReadyAsync();
                }
            } catch (e) {
                console.warn('Babylon scene readiness wait failed:', e);
            }

            // Center the model after all components are loaded
            if (allMeshes.length > 0) {
                centerModel(scene, allMeshes, camera);
            }

            setLoadedCompartments(compartments);
            setLoadingParallelism(1);
            setLoadingFps(0);

            if (failedFiles.length > 0) {
                console.warn(`GLB load failures (${failedFiles.length}/${totalFiles}):`, failedFiles);
            }
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
            canvas.removeEventListener('contextmenu', handleContextMenu);
            canvas.removeEventListener('pointerdown', handleCanvasClick);
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
        Object.values(loadedCompartments).forEach(compartment => {
            Object.values(compartment.loadedComponents).forEach(component => {
                if (component.meshes) {
                    component.meshes.forEach(mesh => {
                        if (mesh.material) {
                            // Create unique part ID for individual mesh selection
                            const partName = mesh.name || `unnamed_${Math.random().toString(36).substr(2, 9)}`;
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
                <div style={{ color: 'rgba(255,255,255,0.92)', fontWeight: 800, fontSize: 14 }}>Full Asset</div>
            </div>

            <canvas
                ref={canvasRef}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: SIDEBAR_WIDTH,
                    width: `calc(100% - ${SIDEBAR_WIDTH + RIGHT_RAIL_WIDTH}px)`,
                    marginTop: HEADER_HEIGHT,
                    height: `calc(100vh - ${HEADER_HEIGHT}px)`,
                    display: 'block',
                    outline: 'none',
                    touchAction: 'none',
                    background: 'transparent',
                    zIndex: 1
                }}
            />

            {isLoading && (
                <div
                    style={{
                        position: 'fixed',
                        left: '50%',
                        bottom: 24,
                        transform: 'translateX(-50%)',
                        zIndex: 10000,
                        background: '#ffffff',
                        color: '#0D47A1',
                        borderRadius: 9999,
                        padding: '18px 28px',
                        textAlign: 'center',
                        boxShadow: '0 18px 40px rgba(13, 71, 161, 0.14)',
                        minWidth: '420px',
                        maxWidth: '92vw',
                        border: '1px solid rgba(13, 71, 161, 0.10)'
                    }}
                >
                    <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: 0.2, marginBottom: 12 }}>
                        Please Wait Model is loading ....
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#266fb8', marginBottom: 10 }}>
                        FPS-aware loader: {loadingFps || '--'} FPS | Parallel loads: {loadingParallelism}
                    </div>
                    <div
                        style={{
                            position: 'relative',
                            width: '100%',
                            height: 9,
                            background: 'rgba(25, 118, 210, 0.12)',
                            borderRadius: 9999,
                            overflow: 'hidden'
                        }}
                    >
                        <div
                            style={{
                                width: `${Math.max(0, Math.min(100, loadingProgress.total > 0 ? (loadingProgress.loaded / loadingProgress.total) * 100 : 0))}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #1a87c9, #1976D2)',
                                borderRadius: 9999,
                                transition: 'width 0.25s ease'
                            }}
                        />
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

            <div
                style={{
                    position: 'fixed',
                    top: HEADER_HEIGHT,
                    right: 0,
                    width: RIGHT_RAIL_WIDTH,
                    height: `calc(100vh - ${HEADER_HEIGHT}px)`,
                    padding: '14px 12px',
                    background: 'linear-gradient(180deg, rgba(8,35,59,0.98) 0%, rgba(4,21,38,0.98) 100%)',
                    borderLeft: '1px solid rgba(255,255,255,0.10)',
                    zIndex: 4000,
                    color: 'rgba(255,255,255,0.92)',
                    boxShadow: '-8px 0 24px rgba(0,0,0,0.18)'
                }}
            >
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 10, color: 'rgba(255,255,255,0.72)' }}>
                    Component Types
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {['plates', 'shells', 'brackets', 'stiffeners'].map((componentType) => {
                        const enabled = componentTypeVisibility[componentType];
                        const active = selectedComponentType === componentType;
                        return (
                            <button
                                key={componentType}
                                onClick={() => {
                                    toggleComponentTypeVisibility(componentType);
                                    handleSelectComponentType(componentType);
                                }}
                                style={{
                                    padding: '9px 8px',
                                    borderRadius: 8,
                                    border: `1px solid ${active ? 'rgba(26,135,201,0.70)' : 'rgba(255,255,255,0.18)'}`,
                                    background: active ? '#1a87c9' : 'rgba(0,0,0,0.55)',
                                    color: enabled ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.55)',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    fontSize: 12
                                }}
                            >
                                <span style={{ textTransform: 'capitalize' }}>{componentType}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

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