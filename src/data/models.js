import { TestFPSOStruc } from './shipData';
import { PetrobrasStruc } from './model_2Data';

// Registry of every vessel model the viewer can show. Each entry pairs the
// ship-data structure (compartments + per-type GLB links) with the public/
// folder its links are rooted at. Component types (plates/brackets/stiffeners/
// shells) are optional per model — a model with no Shell folder simply has no
// `shells` array, and the viewer renders whatever is present.
//
// To add a model: drop its GLBs under public/<dir>/<Type>/, run
//   node scripts/generateModelData.mjs <dir> <ExportName> "<Vessel Name>"
// then import the generated data and add an entry here.
export const MODELS = {
    'model-1': {
        id: 'model-1',
        name: TestFPSOStruc.vesselName || 'Model 1',
        base: '/model-1',
        data: TestFPSOStruc,
    },
    'model-2': {
        id: 'model-2',
        name: PetrobrasStruc.vesselName || 'Model 2',
        base: '/model-2',
        data: PetrobrasStruc,
    },
};

export const MODEL_IDS = Object.keys(MODELS);
export const DEFAULT_MODEL_ID = 'model-1';
