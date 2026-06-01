/** Separator between compartment name and hull part name in part IDs. */
export const PART_ID_SEP = '::';

export function encodePartId(compartmentName, hullPartName) {
    return `${compartmentName}${PART_ID_SEP}${hullPartName}`;
}

/**
 * @returns {{ compartmentName: string|null, hullPartName: string|null }}
 */
export function decodePartId(partId) {
    if (!partId || typeof partId !== 'string') {
        return { compartmentName: null, hullPartName: null };
    }
    const idx = partId.indexOf(PART_ID_SEP);
    if (idx !== -1) {
        return {
            compartmentName: partId.slice(0, idx),
            hullPartName: partId.slice(idx + PART_ID_SEP.length),
        };
    }
    // Legacy `compartment-hullPart` (first hyphen only)
    const legacyIdx = partId.indexOf('-');
    if (legacyIdx === -1) {
        return { compartmentName: partId, hullPartName: null };
    }
    return {
        compartmentName: partId.slice(0, legacyIdx),
        hullPartName: partId.slice(legacyIdx + 1),
    };
}

export function getPartDisplayName(partId) {
    const { hullPartName } = decodePartId(partId);
    return hullPartName || '';
}
