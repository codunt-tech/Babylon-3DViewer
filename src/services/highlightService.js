import { Color3, Color4 } from '@babylonjs/core';
import { getMeshPartId } from '../utils/meshUtils';
import { SHELL_TYPES, INTERIOR_TYPES } from './modelLoader';

const EMISSIVE_NONE = new Color3(0, 0, 0);
const EMISSIVE_PART = new Color3(0.05, 0.05, 0.05); // Subtle white glow for selected part
const EMISSIVE_MILD = new Color3(0.04, 0.04, 0.04);
const EMISSIVE_SELECTED = new Color3(0.12, 0.12, 0.12);

export function getOrCreateSelectionMaterial(mat, scene) {
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

export function applyMeshStates({
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
