# Mapterhorn Terrain — a GeoLibre plugin

An external [GeoLibre](https://github.com/opengeos/geolibre) plugin that
recreates the core functionality of
[relief.bertspaan.nl](https://relief.bertspaan.nl): live global shaded relief
with vertical exaggeration, optional 3D terrain, hypsometric (elevation)
color tinting with outlier-trimmed color scaling, and contour lines — all
from [Mapterhorn](https://mapterhorn.com)'s free, global terrain tiles.

Plugin id: `geolibre-mapterhorn` · Display name: **Mapterhorn Terrain**.

## What it does

- **Hillshade** — MapLibre's native `hillshade` layer over a Mapterhorn
  `raster-dem` source, with a strength slider and illumination direction.
- **Vertical exaggeration** — a slider that scales relief; in 3D mode it
  drives `map.setTerrain({ exaggeration })` directly, in 2D it approximates
  via the hillshade layer's exaggeration paint property.
- **3D terrain** — toggle pitched/extruded terrain (native MapLibre terrain).
- **Hypsometric color tinting** — a color ramp (`VECTOR_COLOR_RAMPS`, copied
  from `@geolibre/core`'s pure `color-ramp.ts` — see "Code reuse" below)
  applied to decoded elevation, rendered through a custom
  MapLibre `type: "custom"` raster source (Mapterhorn's terrarium-encoded
  tiles have no native color-ramp support).
- **Outlier trimming** — percentile-based min/max clipping of the color
  scale (default on, 2%), with a live elevation-statistics readout.
- **Contours** — optional contour lines (marching squares) with interval and
  smoothing controls (default off).

There is a single elevation source (Mapterhorn, global coverage, terrarium
encoding, `https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`) — no WCS, no
datasource picker, matching this plugin's simplified scope relative to the
original Relief app (see "Non-goals" in the design notes below).

## Install

This plugin is built from
[`opengeos/geolibre-plugin-template`](https://github.com/opengeos/geolibre-plugin-template)'s
conventions, so it installs the same way any external GeoLibre plugin does.

1. **Install dependencies and build:**

   ```bash
   cd external-plugins/geolibre-mapterhorn
   npm install
   npm run build:geolibre
   ```

   This produces `geolibre-plugin/dist/index.js` (+ the manifest at
   `geolibre-plugin/plugin.json`).

2. **Choose an install method:**

   - **Packaged zip (recommended for GeoLibre Desktop):**

     ```bash
     npm run package:geolibre
     ```

     Produces `geolibre-plugin/geolibre-mapterhorn-<version>.zip`. In
     GeoLibre Desktop: **Settings → Plugins → Install from file** and select
     the zip.

   - **One-step local install** (copies the built bundle straight into
     GeoLibre's plugin directory):

     ```bash
     # GeoLibre Desktop's app-data plugins/ dir (auto-scanned at startup)
     npm run install:geolibre

     # or, to bake it into a local GeoLibre web/desktop checkout as a
     # bundled drop-in (apps/geolibre-desktop/public/plugins/<id>):
     npm run install:geolibre -- --web /path/to/GeoLibre
     ```

     Restart GeoLibre (or rebuild/restart the dev server for `--web`) to pick
     it up.

   - **Manifest URL (web app, or a local dev directory in Desktop):**

     ```bash
     npm run serve:geolibre -- 8000
     ```

     Serves `geolibre-plugin/` with permissive CORS at
     `http://localhost:8000/plugin.json`. In GeoLibre's web app or Desktop,
     add that URL under **Settings → Plugins → Add manifest URL**.

   - **Local development directory (Desktop):** in **Settings → Plugins**,
     add `external-plugins/geolibre-mapterhorn/geolibre-plugin/` (from a
     checkout of this branch) as a local development directory — no zip
     needed, and it overrides an installed copy with the same id.

## Activate

Open GeoLibre's **Plugins** menu and enable **Mapterhorn Terrain**. A small
toolbar button appears on the map (top-right by default); click it to
open/close the plugin's right-sidebar panel with all the sliders and
toggles described above.

## Test

- **Automated:**

  ```bash
  npm test          # Vitest — pure logic: terrarium decode, outlier
                     # statistics, contour extraction, settings/deep-link
  npm run typecheck  # tsc --noEmit
  npm run lint       # ESLint
  npm run build:geolibre
  ```

- **Manual, in GeoLibre:**
  1. Activate the plugin; confirm shaded relief renders globally and near
     `52.18648, 5.37228` (the original Relief app's shared location).
  2. Move the **vertical exaggeration** and **hillshade strength/direction**
     sliders; confirm the shading updates live.
  3. Toggle **3D terrain**; confirm the map tilts/extrudes and follows the
     exaggeration slider.
  4. Change the **color ramp** and **color opacity**; confirm the tint
     updates (tiles briefly re-render).
  5. Toggle **contours** on; adjust **interval** and **smoothing**; confirm
     lines redraw at the new interval.
  6. Toggle **trim outliers** off/on and move the **outlier percentile**
     slider; confirm the color scale and the elevation-statistics readout
     (`Observed: … • Color scale: … • Samples: …`) update.
  7. Deactivate and reactivate the plugin; confirm settings persist through
     the project's saved state (`getProjectState`/`applyProjectState`).

## Desktop CSP note

GeoLibre Desktop enforces a Content Security Policy restricting which tile
hosts the WebView can reach. `tiles.mapterhorn.com` must be in the
`connect-src`/`img-src` allowlist for tiles to load; as an **external**
plugin this cannot self-modify the host's CSP — ask the GeoLibre maintainers
to add the host, or use the web build (unaffected by this restriction).

## Design notes / non-goals

- Single elevation source (Mapterhorn) — no WCS/PDOK integration, no
  World/Netherlands datasource toggle (dropped from the original request's
  scope by explicit follow-up decision).
- No palette picker beyond the built-in ramps (`src/lib/mapterhorn/color-ramp.ts`),
  no seafloor mode, grid overlay, or share links — cosmetic extras from the
  original Relief app, out of scope for v1.
- MapLibre-only (`engines: ["maplibre"]`) — no Cesium/Mapbox/ArcGIS support.

## Code reuse

The plugin has **no runtime dependency on `@geolibre/core`**. Two small, pure
modules were copied in from the monorepo instead of imported as npm
dependencies, so the plugin stays a single self-contained bundle that a
browser can `import()` with no import map:

- `src/lib/mapterhorn/color-ramp.ts` — copied from
  `packages/core/src/color-ramp.ts` (`VECTOR_COLOR_RAMPS`,
  `getVectorColorRamp`, `interpolateColors`, `parseHexColor`, etc.).
  `@geolibre/core`'s single barrel export (`@geolibre/core`) also re-exports
  its Zustand-backed app store, which pulls in `react` as a peer dependency.
  Rollup happily externalizes/tree-shakes that in the monorepo's Vite app
  (which does have `react` installed), but this plugin is a standalone
  bundle with no `react` in its own `node_modules` and no browser import map
  at load time — importing anything from `@geolibre/core` broke plugin
  loading at runtime with `Could not resolve "react" imported by "zustand"`.
  Keep this file in sync by hand if the upstream ramp definitions change.
- `src/lib/mapterhorn/outlier-stats.ts` — percentile/histogram math ported
  from `packages/plugins/src/plugins/raster-symbology.ts` (a `private`
  workspace package, not published to npm, so it could not be a dependency
  either way).

If this plugin is later extracted to its own repository, both files are
already fully self-contained and need no further changes.

## Repository layout

```
external-plugins/geolibre-mapterhorn/
  src/
    geolibre.ts                    # plugin entry (activate/deactivate, panel, deep-links, project state)
    lib/
      geolibre/host-api.ts         # GeoLibre plugin contract (types only)
      mapterhorn/
        terrarium.ts               # tile URL + terrarium decode (pure)
        outlier-stats.ts           # running histogram + percentile trim (pure)
        contours.ts                # marching-squares contour extraction + smoothing (pure)
        settings.ts                # MapterhornSettings type, defaults, clamping
        color-source.ts            # custom MapLibre raster source: color ramp + contours
        layer-manager.ts           # wires raster-dem/hillshade/terrain + the color source
        control.ts                 # minimal map control (toggles the right panel)
      panel/panel.ts               # right-sidebar DOM UI
      utils/deep-link.ts           # URL query-parameter round-trip
  tests/                           # Vitest unit tests for the pure modules above
  geolibre-plugin/plugin.json      # plugin manifest
  scripts/                         # build/package/install/serve helpers (from geolibre-plugin-template)
```

## Extracting to a standalone repository

This plugin was built inside the GeoLibre monorepo (branch
`feature/mapterhorn-plugin`) but is self-contained (its own `package.json`,
no monorepo-internal imports) so it can be pushed out to its own
`geolibre-mapterhorn` repository later, e.g.:

```bash
git subtree split --prefix=external-plugins/geolibre-mapterhorn -b mapterhorn-export
```

then push `mapterhorn-export` to a new `geolibre-mapterhorn` GitHub repo.
