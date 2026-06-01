import { SceneLoader, StandardMaterial, Color3, Color4 } from '@babylonjs/core';
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

export const loadGLBFile = async (scene, filePath, compartmentName, componentName, componentType) => {
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

            mesh.computeWorldMatrix(true);
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
