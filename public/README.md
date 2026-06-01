# Public Assets

This folder contains all static assets served at the root URL (`/`) by Vite.

## Required 3D Model Assets

Place the GLB files in the folder structure below **before running the app**.
All paths correspond exactly to the `link` values in `src/data/shipData.js`.

```
public/
├── TEST_FPSO_COMP.glb           ← Full-vessel overview (reserved, not loaded yet)
│
├── Shell/
│   ├── AFT_PEAK_TANK_SHELL.glb
│   ├── CARGO_TANK_01_C_SHELL.glb
│   ├── CARGO_TANK_01_P_SHELL.glb
│   ├── CARGO_TANK_01_S_SHELL.glb
│   ├── CARGO_TANK_02_C_SHELL.glb
│   ├── CARGO_TANK_02_P_SHELL.glb
│   ├── CARGO_TANK_02_S_SHELL.glb
│   ├── CARGO_TANK_03_C_SHELL.glb
│   ├── CARGO_TANK_03_P_SHELL.glb
│   ├── CARGO_TANK_03_S_SHELL.glb
│   ├── CARGO_TANK_04_C_SHELL.glb
│   ├── CARGO_TANK_04_P_SHELL.glb
│   ├── CARGO_TANK_04_S_SHELL.glb
│   ├── CARGO_TANK_05_C_SHELL.glb
│   ├── CARGO_TANK_05_P_SHELL.glb
│   ├── CARGO_TANK_05_S_SHELL.glb
│   ├── DISTILLED_WATER_TK_PI_SHELL.glb
│   ├── DISTILLED_WATER_TANK_SI_SHELL.glb
│   ├── ENGINE_ROOM_SHELL.glb
│   ├── FORE_PEAK_TANK_SHELL.glb
│   ├── FWD_DEEP_VOID_SPACE_SHELL.glb
│   ├── POTABLE_WATER_TANK_PI_SHELL.glb
│   ├── POTABLE_WATER_TANK_SI_SHELL.glb
│   ├── PUMP_ROOM_SHELL.glb
│   ├── PUMP_ROOM_TRUNK_SHELL.glb
│   ├── SLOP_TANK_C_SHELL.glb
│   ├── STEERING_GEAR_ROOM_SHELL.glb
│   ├── STERN_TB_COOLING_WAT_TA_SHELL.glb
│   └── STORAGE_SPACES_FWD_BO_SHELL.glb
│
├── Plates/
│   ├── AFT_PEAK_TANK_Plates.glb
│   ├── CARGO_TANK_01_C_Plates.glb  ... (one per compartment)
│   ├── ENGINE_ROOM_DECK_Plates.glb
│   └── ...
│
├── Brackets/
│   ├── CARGO_TANK_01_C_Bracket.glb ... (one per compartment)
│   ├── STORAGE_SPACES_FWD_BO_Bracket.glb
│   └── ...
│
├── Stiffeners/
│   ├── AFT_PEAK_TANK_Stiffener.glb ... (one per compartment)
│   └── ...
│
└── asset/
    └── images/
        ├── logo.svg          ← Brand logo shown in the header
        └── favicon.svg       ← Browser tab icon
```

## Notes

- Shell models are loaded at startup for a fast initial render (~3 MB total).
- Plates, Brackets, and Stiffeners are lazy-loaded on-demand per compartment.
- Up to 4 compartment interiors are cached in memory (LRU eviction).
- If `VITE_MODELS_BASE_URL` is set in `.env`, all GLB paths are resolved relative
  to that base URL instead of the local `public/` folder.
