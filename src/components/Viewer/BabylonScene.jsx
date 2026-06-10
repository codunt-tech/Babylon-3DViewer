import React, { useEffect, useRef, useImperativeHandle } from 'react';
import { Engine, WebGPUEngine, Scene, ArcRotateCamera, HemisphericLight, Vector3, DirectionalLight, Color4, Color3 } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraKeyboardMoveInput';
import '@babylonjs/core/Cameras/Inputs/arcRotateCameraMouseWheelInput';
import { getMeshPartId, logModelParts } from '../../utils/meshUtils';
import { applyLayer1View, setCompartmentHover } from '../../services/highlightService';

const POINTER_DRAG_THRESHOLD_PX = 5;

/**
 * Create a WebGPU engine if the browser supports it, otherwise fall back to
 * the WebGL2 engine. Returns { engine, isWebGPU }.
 */
const createEngine = async (canvas) => {
    let supportsWebGPU = false;
    try {
        supportsWebGPU = await WebGPUEngine.IsSupportedAsync;
    } catch {
        supportsWebGPU = false;
    }

    if (supportsWebGPU) {
        const engine = new WebGPUEngine(canvas, {
            antialias: true,
            stencil: true,
            premultipliedAlpha: false,
            adaptToDeviceRatio: true,
        });
        await engine.initAsync();
        console.log('[engine] using WebGPU');
        return { engine, isWebGPU: true };
    }

    console.log('[engine] WebGPU unavailable — falling back to WebGL2');
    const engine = new Engine(canvas, true, {
        alpha: true, premultipliedAlpha: false,
        preserveDrawingBuffer: true, adaptToDeviceRatio: true,
    });
    return { engine, isWebGPU: false };
};

const BabylonScene = React.forwardRef(({
    loadedCompartments,
    viewMode,
    selectedCompartment,
    onCompartmentSelect,
    onSceneReady,
}, ref) => {
    const canvasRef = useRef(null);
    const sceneRef = useRef(null);
    const engineRef = useRef(null);
    const onCompartmentSelectRef = useRef(onCompartmentSelect);
    const onSceneReadyRef = useRef(onSceneReady);
    const viewModeRef = useRef(viewMode);

    // Keep refs in sync with the latest callbacks / props
    useEffect(() => {
        viewModeRef.current = viewMode;
    }, [viewMode]);

    useEffect(() => {
        onCompartmentSelectRef.current = onCompartmentSelect;
    }, [onCompartmentSelect]);

    useEffect(() => {
        onSceneReadyRef.current = onSceneReady;
    }, [onSceneReady]);

    useImperativeHandle(ref, () => ({
        get scene() { return sceneRef.current; },
        get engine() { return engineRef.current; }
    }));

    useEffect(() => {
        if (!canvasRef.current) return;

        const canvas = canvasRef.current;
        let engine = null;
        let scene = null;
        let resizeObserver = null;
        let disposed = false;
        let detachPointer = () => {};

        const init = async () => {
            const { engine: createdEngine } = await createEngine(canvas);
            // The component may have unmounted while WebGPU was initialising.
            if (disposed) { createdEngine.dispose(); return; }

            engine = createdEngine;
            engineRef.current = engine;
            setTimeout(() => engine.resize(), 100);

            scene = new Scene(engine);
            scene.clearColor = new Color4(0.878, 0.914, 0.941, 1.0);
            sceneRef.current = scene;

            if (import.meta.env.DEV) {
                // DevTools helpers: inspect `window.scene` or run `window.logModelParts()`.
                window.scene = scene;
                window.logModelParts = () => logModelParts(scene);
            }

            const camera = new ArcRotateCamera('Camera', -Math.PI / 2, Math.PI / 3, 100, Vector3.Zero(), scene);
            camera.attachControl(canvas, true);
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

            // ── Pointer handling ──────────────────────────────────────────────
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

            // ── Hover: highlight the compartment under the cursor (overview only) ─
            let hoveredCompartment = null;
            const clearHover = () => {
                if (hoveredCompartment) {
                    setCompartmentHover(scene, null);
                    hoveredCompartment = null;
                    canvas.style.cursor = 'grab';
                }
            };
            const onPointerMove = (e) => {
                if (viewModeRef.current !== 'asset' || leftPointerDown) {
                    clearHover();
                    return;
                }
                const rect = canvas.getBoundingClientRect();
                const r = scene.pick(e.clientX - rect.left, e.clientY - rect.top, PICK_PREDICATE);
                const comp = r.hit ? r.pickedMesh?.metadata?.compartmentName ?? null : null;
                if (comp === hoveredCompartment) return;
                hoveredCompartment = comp;
                setCompartmentHover(scene, comp);
                canvas.style.cursor = comp ? 'pointer' : 'grab';
            };

            canvas.addEventListener('pointerdown', onPointerDown);
            canvas.addEventListener('pointerup', onPointerUp);
            canvas.addEventListener('pointermove', onPointerMove);
            canvas.addEventListener('pointerleave', clearHover);
            canvas.addEventListener('contextmenu', onCtxMenu);
            canvas.style.cursor = 'grab';
            canvas.style.touchAction = 'none';
            detachPointer = () => {
                canvas.removeEventListener('pointerdown', onPointerDown);
                canvas.removeEventListener('pointerup', onPointerUp);
                canvas.removeEventListener('pointermove', onPointerMove);
                canvas.removeEventListener('pointerleave', clearHover);
                canvas.removeEventListener('contextmenu', onCtxMenu);
            };

            // ── WebGPU device-loss recovery ───────────────────────────────────
            // A heavy load can make the driver drop the GPU device. Babylon can
            // restore it, but a frame rendered mid-restore can throw. Log the
            // transitions and never let one bad frame kill the loop (black screen).
            engine.onContextLostObservable?.add(() => {
                console.warn('[engine] GPU device lost — attempting restore…');
            });
            engine.onContextRestoredObservable?.add(() => {
                console.log('[engine] GPU device restored');
            });

            engine.runRenderLoop(() => {
                try {
                    scene.render();
                } catch (err) {
                    // Swallow transient errors during device restore; the next
                    // frame renders normally once buffers are re-uploaded.
                    console.warn('[engine] skipped a frame during recovery:', err?.message);
                }
            });

            resizeObserver = new ResizeObserver(() => engine.resize());
            resizeObserver.observe(canvas);

            if (onSceneReadyRef.current) {
                onSceneReadyRef.current(scene, engine);
            }
        };

        init();

        return () => {
            disposed = true;
            detachPointer();
            resizeObserver?.disconnect();
            scene?.dispose();
            engine?.dispose();
        };
    }, []); // Run once

    // Layer 1: toggle merged overview vs. an isolated compartment's parts.
    useEffect(() => {
        if (!sceneRef.current || Object.keys(loadedCompartments).length === 0) return;
        applyLayer1View({
            loadedCompartments,
            viewMode,
            selectedCompartment,
            scene: sceneRef.current,
        });
    }, [loadedCompartments, viewMode, selectedCompartment]);

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
