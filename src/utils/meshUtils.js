import { encodePartId } from './partIdUtils';

export const getHullPartName = (mesh) => mesh?.metadata?.hullPartName || mesh?.name || 'unnamed';

export const getMeshPartId = (mesh) => {
    if (!mesh?.metadata?.compartmentName) return null;
    return encodePartId(mesh.metadata.compartmentName, getHullPartName(mesh));
};
