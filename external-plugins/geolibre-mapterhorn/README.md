# Mapterhorn — a GeoLibre plugin

An external [GeoLibre](https://github.com/opengeos/geolibre) plugin providing
live global shaded relief with vertical exaggeration and optional 3D terrain,
all from [Mapterhorn](https://mapterhorn.com)'s free, global terrain tiles.

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
- **Tile URL template** — editable in the panel's "Source" section, so a
  self-hosted/mirrored terrarium-encoded source can replace the stock
  Mapterhorn endpoint (`https://tiles.mapterhorn.com/{z}/{x}/{y}.webp`
  default). Blank input falls back to the default.

There is a single elevation source (Mapterhorn, global coverage, terrarium
encoding) — no WCS, no datasource picker, keeping this plugin's scope
intentionally simple (see "Non-goals" in the design notes below).

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
  npm test          # Vitest — pure logic: terrarium decode, settings/deep-link
  npm run typecheck  # tsc --noEmit
  npm run lint       # ESLint
  npm run build:geolibre
  ```

- **Manual, in GeoLibre:**
  1. Activate the plugin; confirm shaded relief renders globally and near
     `52.18648, 5.37228` (a sample Netherlands location).
  2. Move the **vertical exaggeration** and **hillshade strength/direction**
     sliders; confirm the shading updates live.
  3. Toggle **3D terrain**; confirm the map tilts/extrudes and follows the
     exaggeration slider.
  4. Edit the **Tile URL template** field; confirm the hillshade/terrain
     re-fetch from the new URL.
  5. Deactivate and reactivate the plugin; confirm settings persist through
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
  scope by explicit follow-up decision). The tile URL template is editable
  in the panel, so a compatible mirror/self-hosted source can be swapped in
  without a code change.
- No contour lines, hypsometric color tinting, seafloor mode, grid overlay,
  or share links (contours were explicitly removed after an earlier
  iteration; the rest were out of scope for v1).
- MapLibre-only (`engines: ["maplibre"]`) — no Cesium/Mapbox/ArcGIS support.
- **Expected 404s over open ocean**: Mapterhorn only publishes tiles over
  landmass (confirmed by probing `tiles.mapterhorn.com` directly — the same
  `z/x/y` returns `200` over the Netherlands and `404` over open ocean at
  higher zooms). This is inherent to Mapterhorn's coverage, not a plugin bug.

## Code reuse

The plugin has **no runtime dependency on `@geolibre/core`** and no
monorepo-internal copied modules — it is a single self-contained bundle that
a browser can `import()` with no import map.


## Repository layout

```
external-plugins/geolibre-mapterhorn/
  src/
    geolibre.ts                    # plugin entry (activate/deactivate, panel, deep-links, project state)
    lib/
      geolibre/host-api.ts         # GeoLibre plugin contract (types only)
      mapterhorn/
        terrarium.ts               # tile URL + terrarium decode (pure)
        settings.ts                # MapterhornSettings type, defaults, clamping
        layer-manager.ts           # wires raster-dem/hillshade/terrain layers
        control.ts                 # minimal map control (toggles the right panel)
        icon.ts                    # shared-rail icon data URI
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
