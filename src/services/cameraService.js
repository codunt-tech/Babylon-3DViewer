import { Vector3, Animation, CubicEase, EasingFunction } from '@babylonjs/core';
import { getMeshPartId } from '../utils/meshUtils';

export function animateCameraTo(camera, scene, targetCenter, targetRadius, durationFrames = 30) {
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

export function animateCameraAngle(camera, scene, targetAlpha, targetBeta, durationFrames = 40) {
    if (!camera || !scene) return;
    const ease = new CubicEase();
    ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
    Animation.CreateAndStartAnimation('camAlpha', camera, 'alpha', 60, durationFrames, camera.alpha, targetAlpha, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
    Animation.CreateAndStartAnimation('camBeta', camera, 'beta', 60, durationFrames, camera.beta, targetBeta, Animation.ANIMATIONLOOPMODE_CONSTANT, ease);
}

export const centerModel = (scene, meshes, camera, animate = false) => {
    const valid = meshes.filter((m) => m && !m.isDisposed() && m.getTotalVertices() > 0);
    if (!valid.length) return;
    valid.forEach((m) => {
        m.computeWorldMatrix(true);
        m.refreshBoundingInfo();
    });

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

    camera.lowerRadiusLimit = fitDist * 0.25;
    camera.upperRadiusLimit = fitDist * 12;

    if (animate) {
        animateCameraTo(camera, scene, center, fitDist);
    } else {
        camera.setTarget(center);
        camera.radius = fitDist;
        camera.alpha = -Math.PI / 4;
        camera.beta = Math.PI / 3;
    }
};

export const centerOnSelection = (scene, targetType, targetName) => {
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
        camera.lowerRadiusLimit = fitDist * 0.25;
        camera.upperRadiusLimit = fitDist * 12;
        animateCameraTo(camera, scene, center, fitDist);
    }
};
