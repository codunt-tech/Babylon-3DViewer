# FPSO 3D Viewer

An interactive 3D hull structure viewer for FPSO (Floating Production Storage and Offloading) vessels, built with **React 19**, **Vite 7**, and **Babylon.js 8**.

---

## Features

- **Shell-first loading** — outer hull shells load at startup for a fast initial render
- **Lazy interior loading** — plates, brackets, and stiffeners load on-demand per compartment
- **LRU cache** — up to 4 compartment interiors held in GPU memory simultaneously
- **Three view modes** — Asset → Compartment → Hull Part navigation with breadcrumbs
- **Sidebar hierarchy** — compartments grouped by functionality with search
- **Selection & visibility** — click to select, hide/show, isolate compartments or hull parts
- **Context menu** — right-click for fit-to-screen, isolate, hide, compartment/hull-part views
- **Axis controller** — preset camera angles (top, front, iso) and free rotate

---

## Tech Stack

| Layer | Library |
|---|---|
| UI Framework | React 19 |
| Build Tool | Vite 7 |
| 3D Engine | Babylon.js 8 |
| Icons | react-bootstrap-icons |
| Testing | Vitest + jsdom |

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Add 3D model assets

The app requires GLB model files that are **not included in this repository** (large binary assets).

Place your GLB files under `public/` following the structure documented in [`public/README.md`](./public/README.md).

The paths must match exactly what is defined in `src/data/shipData.js`.

**Minimum required to see anything:**  
All shell files under `public/Shell/` (loaded at startup).

### 3. Configure environment (optional)

```bash
cp .env.example .env
```

Set `VITE_MODELS_BASE_URL` if your GLB files are hosted on a CDN or remote server.

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Available Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server with HMR |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
| `npm test` | Run unit tests (Vitest) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:coverage` | Run tests with coverage report |

---

## Project Structure

```
src/
├── components/
│   ├── ContextMenu/
│   │   └── ContextMenu.jsx        # Right-click action menu
│   ├── Sidebar/
│   │   └── BabylonSidebar.jsx     # Hierarchy tree + search
│   ├── Toolbar/
│   │   └── AxisController.jsx     # Camera preset buttons
│   ├── Viewer/
│   │   ├── BabylonScene.jsx       # Babylon engine, canvas, picking
│   │   └── BabylonViewer.jsx      # Main orchestrator — state & loading
│   └── viewerShell.jsx            # AppHeader, LoadingPill, ComponentTypesRail
├── data/
│   └── shipData.js                # GLB paths & compartment metadata (TEST FPSO)
├── services/
│   ├── cameraService.js           # Fit-to-screen, animated camera moves
│   ├── hierarchyService.js        # Compartment grouping from shipData
│   ├── highlightService.js        # Visibility, selection, emissive states
│   └── modelLoader.js             # GLB loading, materials, hull-part tree
├── styles/
│   └── index.css                  # Global reset + scrollbar styles
└── utils/
    ├── meshUtils.js               # Babylon mesh helpers
    └── partIdUtils.js             # Part ID encode/decode (compartment::hullPart)
```

---

## Adding a New Vessel

1. Create a new data file modelled after `src/data/shipData.js` — add `vesselName`, `vesselId`, and the `shells`/`plates`/`brackets`/`stiffeners` arrays.
2. Place the corresponding GLB files under `public/`.
3. Import the new data object and pass it to `BabylonViewer` (replace `TestFPSOStruc`).

---

## License

Private — all rights reserved.
