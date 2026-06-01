import React, { useEffect, useRef, useImperativeHandle } from 'react';
import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3, DirectionalLight, Color4, Color3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraKeyboardMoveInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput';
import { getMeshPartId } from '../../utils/meshUtils';
import { applyMeshStates } from '../../services/highlightService';

const POINTER_DRAG_THRESHOLD_PX = 5;

const BabylonScene = React.forwardRef(({
    loadedCompartments,
    compartmentVisibility,
    componentTypeVisibility,
    viewMode,
    selectedCompartment,
    selectedParts,
    selectedComponentType,
    hiddenPartsByCompartment,
    onCompartmentSelect,
    onSceneReady,
}, ref) => {
    const canvasRef = useRef(null);
    const sceneRef = useRef(null);
    const engineRef = useRef(null);
    const onCompartmentSelectRef = useRef(onCompartmentSelect);

    // Keep the ref in sync with the latest callback
    useEffect(() => {
        onCompartmentSelectRef.current = onCompartmentSelect;
    }, [onCompartmentSelect]);

    useImperativeHandle(ref, () => ({
        get scene() { return sceneRef.current; },
        get engine() { return engineRef.current; }
    }));

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
        camera.lowerRadiusLimit = 10;
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
                if (onCompartmentSelectRef.current) {
                    onCompartmentSelectRef.current(compartmentName, partId, pos, isRight, r.pickedMesh);
                }
            } else if (!isRight) {
                if (onCompartmentSelectRef.current) {
                    onCompartmentSelectRef.current(null, null, pos, isRight, null);
                }
            }
        };

        const onPointerUp = (e) => {
            if (e.button !== 0 || !leftPointerDown) return;
            leftPointerDown = false;
            const dx = e.clientX - pointerDownX;
            const dy = e.clientY - pointerDownY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const dragged = dist > POINTER_DRAG_THRESHOLD_PX;
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

        engine.runRenderLoop(() => scene.render());

        const resizeObserver = new ResizeObserver(() => {
            engine.resize();
        });
        resizeObserver.observe(canvas);

        if (onSceneReady) {
            onSceneReady(scene, engine);
        }

        return () => {
            resizeObserver.disconnect();
            canvas.removeEventListener('pointerdown', onPointerDown);
            canvas.removeEventListener('pointerup', onPointerUp);
            canvas.removeEventListener('contextmenu', onCtxMenu);
            scene.dispose();
            engine.dispose();
        };
    }, []); // Run once

    // Apply mesh states when dependencies change
    useEffect(() => {
        if (!sceneRef.current || Object.keys(loadedCompartments).length === 0) return;
        applyMeshStates({
            loadedCompartments,
            compartmentVisibility,
            componentTypeVisibility,
            viewMode,
            selectedCompartment,
            selectedParts,
            selectedComponentType,
            hiddenPartsByCompartment,
            scene: sceneRef.current,
        });
    }, [
        loadedCompartments, compartmentVisibility, componentTypeVisibility,
        viewMode, selectedCompartment, selectedParts, selectedComponentType,
        hiddenPartsByCompartment
    ]);

    return (
        <canvas
            ref={canvasRef}
            style={{
                width: '100%',
                height: '100%',
                display: 'block',
                outline: 'none',
                touchAction: 'none',
                background: 'linear-gradient(180deg, #dce8f0 0%, #c8dae8 100%)',
            }}
        />
    );
});

export default BabylonScene;
