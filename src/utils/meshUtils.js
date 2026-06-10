import { encodePartId } from './partIdUtils';

export const getHullPartName = (mesh) => mesh?.metadata?.hullPartName || mesh?.name || 'unnamed';

export const getMeshPartId = (mesh) => {
    if (!mesh?.metadata?.compartmentName) return null;
    return encodePartId(mesh.metadata.compartmentName, getHullPartName(mesh));
};

/**
 * Log every individual geometry mesh in the scene with its full "address":
 * compartment -> component type -> hull part -> mesh. Use from DevTools to
 * inspect what's actually inside a loaded model.
 *
 * @param {import('@babylonjs/core').Scene} scene
 * @returns {Array} the flat row list (also printed via console.table)
 */
export const logModelParts = (scene) => {
    const rows = scene.meshes
        .filter((m) => m.getTotalVertices() > 0)
        .map((m) => ({
            mesh: m.name,
            uniqueId: m.uniqueId,
            compartment: m.metadata?.compartmentName ?? '(none)',
            componentType: m.metadata?.componentType ?? '(none)',
            hullPart: getHullPartName(m),
            partId: getMeshPartId(m) ?? '(none)',
            verts: m.getTotalVertices(),
        }));

    console.table(rows);
    console.log(`Total parts: ${rows.length}`);
    return rows;
};
