import { MODELS, DEFAULT_MODEL_ID } from '../data/models';

const COMPONENT_TYPES = ['plates', 'brackets', 'stiffeners', 'shells'];

// Which vessel model is currently active. The GLB links inside each model's
// ship data are root-relative (e.g. "/Plates/..."); they get prefixed with the
// model's `base` ("/model-1"). Switching models swaps both the data and base.
let activeModelId = DEFAULT_MODEL_ID;

export const getActiveModelId = () => activeModelId;
export const getActiveModel = () => MODELS[activeModelId];
export const listModels = () => Object.values(MODELS);

export const setActiveModel = (id) => {
    if (MODELS[id]) activeModelId = id;
    return activeModelId;
};

// Kept as a getter for callers that still want the active base path.
export const getModelBase = () => getActiveModel().base;

const withBase = (link) => (link ? `${getActiveModel().base}${link}` : link);

export const getCompartmentNamesFromShipData = () => {
    const data = getActiveModel().data;
    const names = new Set();
    COMPONENT_TYPES.forEach((t) => {
        (data[t] || []).forEach((item) => names.add(item.compartmentName));
    });
    return Array.from(names);
};

export const organizeByCompartments = () => {
    const data = getActiveModel().data;
    const compartments = {};
    COMPONENT_TYPES.forEach((componentType) => {
        (data[componentType] || []).forEach((item) => {
            const { compartmentName, uid, link } = item;
            if (!compartments[compartmentName]) {
                compartments[compartmentName] = { compartmentName, uid, components: {} };
            }
            compartments[compartmentName].components[componentType] = {
                name: `${compartmentName}_${componentType.toUpperCase()}`,
                path: withBase(link),
                type: componentType,
                uid,
            };
        });
    });
    return compartments;
};

export const getFunctionalityGroup = (name) => {
    if (!name) return '';
    const u = name.toUpperCase();
    if (/^CARGO_TANK/.test(u)) return 'Cargo';
    if (/^AFT_PEAK/.test(u)) return 'Aft Peak';
    if (/^FORE_PEAK/.test(u)) return 'Fore Peak';
    if (/^ENGINE_ROOM/.test(u)) return 'Engine Room';
    if (/^CHAIN_LOCKER/.test(u)) return 'Chain Locker';
    if (/^DISTILLED_WATER/.test(u)) return 'Distilled Water';
    if (/^FWD_DEEP/.test(u)) return 'Fwd Deep';
    if (/^POTABLE_WATER/.test(u)) return 'Potable Water';
    if (/^PUMP_ROOM/.test(u)) return 'Pump Room';
    if (/^SLOP_TANK/.test(u)) return 'Slop Tank';
    if (/^STEERING_GEAR/.test(u)) return 'Steering Gear';
    if (/^STERN_TB/.test(u)) return 'Stern TB';
    if (/^STORAGE_SPACES/.test(u)) return 'Storage Spaces';
    return name.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
};
