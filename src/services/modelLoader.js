import { SceneLoader, StandardMaterial, Color3, Color4, AbstractMesh, Mesh } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';

export const INTERIOR_TYPES = new Set(['plates', 'brackets', 'stiffeners']);
export const SHELL_TYPES = new Set(['shells', 'shell']);

export const COMPONENT_COLORS = {
    brackets: new Color3(0.76, 0.71, 0.26),
    stiffeners: new Color3(0.73, 0.73, 0.73),
    plates: new Color3(0.286, 0.239, 0.459),
    shells: new Color3(0.29, 0.565, 0.886),
    shell: new Color3(0.29, 0.565, 0.886),
};
export const DECK_COLOR = new Color3(0.561, 0.737, 0.561);
export const DEFAULT_COLOR = new Color3(0.6, 0.6, 0.6);

/**
 * Build a serialisable tree from the TransformNode hierarchy that came out of
 * a GLB import.
 */
export const buildNodeTree = (transformNodes, geometryMeshes) => {
    const nodeMap = new Map();
    transformNodes.forEach((tn) => {
        nodeMap.set(tn.uniqueId, { id: tn.uniqueId, name: tn.name, children: [], meshNames: [] });
    });

    const meshParentIds = new Set();
    geometryMeshes.forEach((m) => {
        let p = m.parent;
        while (p && !nodeMap.has(p.uniqueId)) p = p.parent;
        if (p && nodeMap.has(p.uniqueId)) {
            nodeMap.get(p.uniqueId).meshNames.push(m.name);
            meshParentIds.add(p.uniqueId);
        }
    });

    transformNodes.forEach((tn) => {
        let p = tn.parent;
        while (p && !nodeMap.has(p.uniqueId)) p = p.parent;
        if (p && nodeMap.has(p.uniqueId)) {
            nodeMap.get(p.uniqueId).children.push(nodeMap.get(tn.uniqueId));
        }
    });

    const roots = [];
    transformNodes.forEach((tn) => {
        let p = tn.parent;
        while (p && !nodeMap.has(p.uniqueId)) p = p.parent;
        if (!p) roots.push(nodeMap.get(tn.uniqueId));
    });

    return roots;
};

export const buildHullPartMap = (nodeTree) => {
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

export const resolveHullPartName = (mesh, hullPartMap) => {
    const fromTree = hullPartMap.get(mesh.name);
    if (fromTree) return fromTree;
    let p = mesh.parent;
    while (p) {
        if (p.name && p.name !== '__root__' && !p.name.startsWith('__')) return p.name;
        p = p.parent;
    }
    return mesh.name;
};

export const extractHullPartNames = (nodeTree, meshes) => {
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

export const compartmentHasInterior = (compartment) =>
    Object.values(compartment?.loadedComponents || {}).some((c) => INTERIOR_TYPES.has(c.type));

export const evictInteriorFromCompartment = (compartment) => {
    Object.values(compartment?.loadedComponents || {}).forEach((comp) => {
        if (!INTERIOR_TYPES.has(comp.type)) return;
        (comp.meshes || []).forEach((mesh) => {
            if (mesh?.material && !mesh.isDisposed()) mesh.material.dispose();
            if (mesh && !mesh.isDisposed()) mesh.dispose(false, true);
        });
    });
};

const applyEdges = (mesh) => {
    mesh.enableEdgesRendering(0.9, true);
    mesh.edgesWidth = 2.0;
    mesh.edgesColor = new Color4(1, 1, 1, 0.85);
};

/**
 * Import a GLB component.
 *
 * @param {object} [options]
 * @param {boolean} [options.merge=false]  When true, every geometry mesh in the
 *   file is collapsed into ONE mesh (per compartment+type). Used for the
 *   whole-model overview — individual parts are not pickable, but draw calls
 *   drop from thousands to one. When false, every part stays an individual,
 *   pickable mesh (used inside Compartment View).
 */
export const loadGLBFile = async (scene, filePath, compartmentName, componentName, componentType, options = {}) => {
    const { merge = false } = options;
    try {
        const result = await SceneLoader.ImportMeshAsync('', '', filePath, scene, null, '.glb');
        const geometryMeshes = result.meshes.filter((m) => m.getTotalVertices() > 0);

        // We paint every mesh with our own solid StandardMaterial, so the GLB's
        // per-vertex colors must be ignored. Some models (e.g. model-2) ship
        // COLOR_0/COLOR_1 with an alpha channel — left enabled, Babylon treats it
        // as vertex alpha and renders the parts fully transparent (invisible).
        geometryMeshes.forEach((m) => {
            m.useVertexColors = false;
            m.hasVertexAlpha = false;
        });

        const transformNodes = (result.transformNodes || []).filter(
            (tn) => tn.name && tn.name !== '__root__' && !tn.name.startsWith('__')
        );
        const nodeTree = buildNodeTree(transformNodes, geometryMeshes);
        const hullPartMap = buildHullPartMap(nodeTree);
        const hullPartNames = extractHullPartNames(nodeTree, geometryMeshes);

        const matName = `mat_${componentType}_${compartmentName}`;
        const isShellType = SHELL_TYPES.has(componentType);

        // One shared material per (type, compartment).
        let baseMat = scene.getMaterialByName(matName);
        if (!baseMat) {
            baseMat = new StandardMaterial(matName, scene);
            baseMat.diffuseColor = isShellType ? COMPONENT_COLORS.shells : (COMPONENT_COLORS[componentType] ?? DEFAULT_COLOR);
            baseMat.specularColor = new Color3(0, 0, 0);
            baseMat.specularPower = 0;
            baseMat.backFaceCulling = false;
            baseMat.alpha = 1.0;
            baseMat.transparencyMode = 0;
            if (componentType === 'plates') baseMat.zOffset = 1;
        }

        // ── Merged overview path: collapse the file into as few meshes as possible ─
        if (merge) {
            geometryMeshes.forEach((m) => { m.material = baseMat; m.computeWorldMatrix(true); });

            // A single GLB can contain meshes with DIFFERENT vertex-attribute sets
            // (e.g. some parts carry UVs/normals, others don't). MergeMeshes throws
            // "Cannot merge vertex data that do not have the same set of attributes"
            // when mixed — and a thrown merge mid-upload can take down the GPU
            // device. So group by attribute signature and merge each group on its
            // own. Uniform files (e.g. model-1) collapse to a single mesh as before.
            const groups = new Map();
            geometryMeshes.forEach((m) => {
                const sig = (m.getVerticesDataKinds?.() || []).slice().sort().join('|');
                if (!groups.has(sig)) groups.set(sig, []);
                groups.get(sig).push(m);
            });

            const mergedMeshes = [];
            let groupIndex = 0;
            for (const group of groups.values()) {
                let merged = null;
                try {
                    // MergeMeshes bakes each source's world transform into the result
                    // and disposes the sources, so the GPU only holds the merged mesh.
                    merged = Mesh.MergeMeshes(group, true /*disposeSource*/, true /*allow32Bit*/, undefined, false, false);
                } catch (mergeErr) {
                    console.warn(`MergeMeshes failed for ${componentType}/${compartmentName} (${group.length} parts); skipping group`, mergeErr?.message);
                    merged = null;
                }
                if (!merged) continue;

                merged.name = `merged_${componentType}_${compartmentName}_${groupIndex++}`;
                merged.material = baseMat;
                merged.useVertexColors = false;
                merged.hasVertexAlpha = false;
                merged.metadata = {
                    compartmentName, componentType, componentName,
                    hullPartName: null, baseMaterialName: matName, merged: true,
                };
                merged.isPickable = true;
                merged.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
                merged.computeWorldMatrix(true);
                merged.freezeWorldMatrix();
                if (isShellType) applyEdges(merged);
                mergedMeshes.push(merged);
            }

            if (mergedMeshes.length === 0) {
                return { meshes: [], transformNodes, nodeTree, hullPartNames, success: false, compartmentName, componentName, componentType };
            }

            return {
                meshes: mergedMeshes, transformNodes, nodeTree, hullPartNames,
                success: true, compartmentName, componentName, componentType, merged: true,
            };
        }

        // ── Unmerged path: every part is its own pickable mesh ─────────────────
        geometryMeshes.forEach((mesh) => {
            const hullPartName = resolveHullPartName(mesh, hullPartMap);
            mesh.material = baseMat;
            mesh.metadata = {
                ...mesh.metadata,
                compartmentName,
                componentType,
                componentName,
                hullPartName,
                baseMaterialName: matName,
            };

            if (isShellType) applyEdges(mesh);

            mesh.computeWorldMatrix(true);
            mesh.freezeWorldMatrix();
            mesh.isPickable = true;
            // Cheapest culling test — meshes are static after load.
            mesh.cullingStrategy = AbstractMesh.CULLINGSTRATEGY_BOUNDINGSPHERE_ONLY;
        });

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
