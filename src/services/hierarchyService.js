import { TestFPSOStruc } from '../data/shipData';

export const getCompartmentNamesFromShipData = () => {
    const names = new Set();
    ['plates', 'brackets', 'stiffeners', 'shells'].forEach((t) => {
        (TestFPSOStruc[t] || []).forEach((item) => names.add(item.compartmentName));
    });
    return Array.from(names);
};

export const organizeByCompartments = () => {
    const compartments = {};
    ['plates', 'brackets', 'stiffeners', 'shells'].forEach((componentType) => {
        (TestFPSOStruc[componentType] || []).forEach((item) => {
            const { compartmentName, uid, link } = item;
            if (!compartments[compartmentName]) {
                compartments[compartmentName] = { compartmentName, uid, components: {} };
            }
            compartments[compartmentName].components[componentType] = {
                name: `${compartmentName}_${componentType.toUpperCase()}`,
                path: link,
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
