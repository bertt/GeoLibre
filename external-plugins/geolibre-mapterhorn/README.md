# Mapterhorn — a GeoLibre plugin

An external [GeoLibre](https://github.com/opengeos/geolibre) plugin that
recreates the core functionality of
[relief.bertspaan.nl](https://relief.bertspaan.nl): live global shaded relief
with vertical exaggeration, optional 3D terrain, and contour lines with
outlier-trimmed elevation statistics — all from
[Mapterhorn](https://mapterhorn.com)'s free, global terrain tiles.

Plugin id: `geolibre-mapterhorn` · Display name: **Mapterhorn**.

## What it does

- **Hillshade** — MapLibre's native `hillshade` layer over a Mapterhorn
  `raster-dem` source, with a strength slider and illumination direction.
- **Vertical exaggeration** — a slider that scales relief; in 3D mode it
  drives `map.setTerrain({ exaggeration })` directly, in 2D it approximates
  via the hillshade layer's exaggeration paint property.
- **3D terrain** — toggle pitched/extruded terrain (native MapLibre terrain);
  the camera auto-tilts to a 60° pitch when enabled (and back on disable, if
  the plugin was the one that introduced the tilt) so displaced relief is
  actually visible.
- **Contours** — optional contour lines (marching squares), rendered as a
  `map.project()`-synced 2D canvas overlay (MapLibre GL JS has no
  `type: "custom"` **source** an external plugin bundle can register — see
  `contour-overlay.ts`'s docstring), with interval and smoothing controls
  (default off). This overlay is a flat 2D layer, so contours are
  **2D-only by design**: they are automatically hidden whenever 3D terrain is
  on or the map is in globe projection (3D/globe mode shows hillshade +
  terrain only).
- **Outlier trimming** — percentile-based min/max clipping (default on, 2%)
  feeding a live elevation-statistics readout (observed min/max, sample
  count). It no longer affects color scaling directly (see "Design notes"
  below for why the color ramp feature was removed).

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

Open GeoLibre's **Plugins** menu and enable **Mapterhorn**. A small
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
     exaggeration slider, and that the contour overlay hides itself while 3D
     is on (it is a flat 2D canvas synced via `map.project()`, so it only
     makes sense for a top-down view — see `contour-overlay.ts`'s
     docstring).
  4. Toggle 3D back off; confirm the contour overlay reappears if contours
     are enabled.
  5. Toggle **contours** on; adjust **interval** and **smoothing**; confirm
     lines redraw at the new interval.
  7. Toggle **trim outliers** off/on and move the **outlier percentile**
     slider; confirm the elevation-statistics readout
     (`Observed: … • Trimmed: … • Samples: …`) updates.
  8. Deactivate and reactivate the plugin; confirm settings persist through
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
- **No hypsometric color tinting.** An earlier version rendered a
  color-ramp tint via the same flat 2D canvas overlay as the contours, but a
  flat overlay only makes sense in 2D top-down view — and since 3D terrain
  is on by default, that limitation would apply to the color ramp on every
  fresh activation. Rather than accept a feature that mostly doesn't render,
  or build a native `color-relief` MapLibre layer (a bigger scope increase),
  the color ramp was removed outright; only contours remain as a 2D-only
  overlay feature, matching the explicit decision to keep contours 2D-only
  as well.
- No seafloor mode, grid overlay, or share links — cosmetic extras from the
  original Relief app, out of scope for v1.
- MapLibre-only (`engines: ["maplibre"]`) — no Cesium/Mapbox/ArcGIS support.
- **Expected 404s over open ocean**: Mapterhorn only publishes tiles over
  landmass (confirmed by probing `tiles.mapterhorn.com` directly — the same
  `z/x/y` returns `200` over the Netherlands and `404` over open ocean at
  higher zooms). Both the native `raster-dem` source and this plugin's
  contour overlay fetch the same tiles, so panning/zooming over open water
  logs harmless 404s in GeoLibre's network diagnostics; this is inherent to
  Mapterhorn's coverage, not a plugin bug.
- The contour overlay is a flat, unprojected 2D canvas (see
  `contour-overlay.ts`'s docstring) — it does not handle the antimeridian
  and is hidden whenever 3D terrain is on or the map is in globe projection.
  Contours are a **2D-only feature by design**; making them drape over 3D
  terrain/globe would require a native MapLibre vector line layer instead of
  a canvas overlay, left as a known limitation rather than built for v1.

## Code reuse

The plugin has **no runtime dependency on `@geolibre/core`**. One small, pure
module was copied in from the monorepo instead of imported as an npm
dependency, so the plugin stays a single self-contained bundle that a
browser can `import()` with no import map:

- `src/lib/mapterhorn/outlier-stats.ts` — percentile/histogram math ported
  from `packages/plugins/src/plugins/raster-symbology.ts` (a `private`
  workspace package, not published to npm, so it could not be a dependency
  either way).

If this plugin is later extracted to its own repository, this file is
already fully self-contained and needs no further changes.

## Repository layout

```
external-plugins/geolibre-mapterhorn/
  src/
    geolibre.ts                    # plugin entry (activate/deactivate, panel, deep-links, project state)
    lib/
      geolibre/host-api.ts         # GeoLibre plugin contract (types only)
      mapterhorn/
        terrarium.ts               # tile URL + terrarium decode (pure)
        tile-math.ts                # slippy-tile lng/lat <-> tile-index math (pure)
        outlier-stats.ts           # running histogram + percentile trim (pure)
        contours.ts                # marching-squares contour extraction + smoothing (pure)
        settings.ts                # MapterhornSettings type, defaults, clamping
        contour-overlay.ts          # map.project()-synced 2D canvas overlay: contour lines + stats sampling
        layer-manager.ts           # wires raster-dem/hillshade/terrain + the contour overlay
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
