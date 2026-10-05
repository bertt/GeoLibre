import type { Map as MapLibreMap, RasterDEMTileSource } from "maplibre-gl";
import type { MapterhornSettings } from "./settings";
import { MAPTERHORN_ENCODING, MAPTERHORN_MAX_ZOOM, MAPTERHORN_TILE_SIZE } from "./terrarium";

export const MAPTERHORN_DEM_SOURCE_ID = "mapterhorn-dem-source";
export const MAPTERHORN_HILLSHADE_LAYER_ID = "mapterhorn-hillshade-layer";

/**
 * Owns the MapLibre sources/layers/terrain this plugin adds to the host map,
 * and reconciles them against `MapterhornSettings` changes.
 *
 * A `raster-dem` source (native, `encoding: "terrarium"`) feeds MapLibre's
 * built-in `hillshade` layer and `map.setTerrain(...)` for 3D — no custom
 * rendering code needed for either.
 *
 * Enabling 3D terrain also tilts the camera (`map.easeTo({ pitch: 60 })`) if
 * it is currently close to top-down: elevation displacement on a globe/map
 * pushes terrain outward along the local "up" vector, which is invisible
 * from directly overhead — it only reads as "real mountains" once the
 * camera looks across the relief rather than straight down. Only a pitch
 * this class itself introduced is ever restored on disable (see
 * `pitchedByPlugin`), so it never fights a pitch the user set by hand.
 */
export class MapterhornLayerManager {
  private readonly map: MapLibreMap;
  private settings: MapterhornSettings;
  private added = false;
  /** Tracks whether `applyTerrain()` tilted the camera, so disabling 3D terrain only restores the pitch this plugin itself introduced (never fights a pitch the user set by hand). */
  private pitchedByPlugin = false;

  constructor(map: MapLibreMap, settings: MapterhornSettings) {
    this.map = map;
    this.settings = settings;
  }

  /** Adds all sources/layers/terrain and applies the current settings. Idempotent. */
  mount(): void {
    if (this.added) return;
    const { map } = this;

    map.addSource(MAPTERHORN_DEM_SOURCE_ID, {
      type: "raster-dem",
      tiles: [this.settings.tileUrlTemplate],
      tileSize: MAPTERHORN_TILE_SIZE,
      maxzoom: MAPTERHORN_MAX_ZOOM,
      encoding: MAPTERHORN_ENCODING,
      attribution: "Terrain: Mapterhorn (mapterhorn.com)",
    });

    map.addLayer({
      id: MAPTERHORN_HILLSHADE_LAYER_ID,
      type: "hillshade",
      source: MAPTERHORN_DEM_SOURCE_ID,
      paint: {
        "hillshade-exaggeration": this.settings.hillshadeStrength,
        "hillshade-illumination-direction": this.settings.hillshadeDirection,
      },
      layout: { visibility: this.settings.enabled ? "visible" : "none" },
    });

    this.added = true;
    this.applyTerrain();
    this.syncCameraPitch(this.settings.terrain3d);
  }

  /** Removes all sources/layers/terrain added by `mount()`. */
  unmount(): void {
    if (!this.added) return;
    const { map } = this;
    if (map.getTerrain()?.source === MAPTERHORN_DEM_SOURCE_ID) map.setTerrain(null);
    if (map.getLayer(MAPTERHORN_HILLSHADE_LAYER_ID)) map.removeLayer(MAPTERHORN_HILLSHADE_LAYER_ID);
    if (map.getSource(MAPTERHORN_DEM_SOURCE_ID)) map.removeSource(MAPTERHORN_DEM_SOURCE_ID);
    this.added = false;
  }

  /**
   * Applies a settings patch. Live-updatable paint properties (hillshade
   * strength/direction, exaggeration, visibility) apply instantly; a changed
   * tile URL re-points the existing `raster-dem` source via `setTiles`.
   */
  update(next: MapterhornSettings): void {
    const previous = this.settings;
    this.settings = next;
    if (!this.added) return;
    const { map } = this;

    const hillshadeVisibility = next.enabled ? "visible" : "none";
    map.setLayoutProperty(MAPTERHORN_HILLSHADE_LAYER_ID, "visibility", hillshadeVisibility);
    map.setPaintProperty(MAPTERHORN_HILLSHADE_LAYER_ID, "hillshade-exaggeration", next.hillshadeStrength);
    map.setPaintProperty(MAPTERHORN_HILLSHADE_LAYER_ID, "hillshade-illumination-direction", next.hillshadeDirection);

    if (next.tileUrlTemplate !== previous.tileUrlTemplate) {
      const source = map.getSource(MAPTERHORN_DEM_SOURCE_ID) as RasterDEMTileSource | undefined;
      source?.setTiles([next.tileUrlTemplate]);
    }

    if (next.terrain3d !== previous.terrain3d || next.exaggeration !== previous.exaggeration) {
      this.applyTerrain();
    }
    if (next.terrain3d !== previous.terrain3d) {
      this.syncCameraPitch(next.terrain3d);
    }
  }

  /**
   * Sets the native hillshade layer's visibility directly, independent of
   * the plugin's own `enabled` setting. This is the bridge target for
   * `registerExternalNativeLayer`'s `paintBridge.setVisibility`, so the
   * Layers panel's own eye-icon toggle for this layer works like it does for
   * any other native layer.
   */
  setHillshadeVisible(visible: boolean): void {
    if (!this.added) return;
    this.map.setLayoutProperty(MAPTERHORN_HILLSHADE_LAYER_ID, "visibility", visible ? "visible" : "none");
  }

  private applyTerrain(): void {
    const { map, settings } = this;
    if (settings.terrain3d) {
      map.setTerrain({ source: MAPTERHORN_DEM_SOURCE_ID, exaggeration: settings.exaggeration });
    } else if (map.getTerrain()?.source === MAPTERHORN_DEM_SOURCE_ID) {
      map.setTerrain(null);
    }
  }

  /**
   * Tilts the camera when 3D terrain is enabled (so displaced relief is
   * actually visible, rather than foreshortened to nothing when looking
   * straight down), and restores the pitch on disable — but only the pitch
   * this method itself introduced, so a manual pitch the user set is never
   * overridden or clobbered.
   */
  private syncCameraPitch(terrain3d: boolean): void {
    const { map } = this;
    if (terrain3d) {
      if (map.getPitch() < 20) {
        this.pitchedByPlugin = true;
        map.easeTo({ pitch: 60, duration: 600 });
      }
    } else if (this.pitchedByPlugin) {
      this.pitchedByPlugin = false;
      map.easeTo({ pitch: 0, duration: 600 });
    }
  }
}
