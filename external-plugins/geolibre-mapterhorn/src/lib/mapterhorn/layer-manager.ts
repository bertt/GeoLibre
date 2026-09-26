import type { Map as MapLibreMap } from "maplibre-gl";
import { MapterhornColorOverlay } from "./color-overlay";
import type { OutlierTrimResult } from "./outlier-stats";
import type { MapterhornSettings } from "./settings";
import {
  MAPTERHORN_ENCODING,
  MAPTERHORN_MAX_ZOOM,
  MAPTERHORN_TILE_SIZE,
  MAPTERHORN_TILE_URL_TEMPLATE,
} from "./terrarium";

export const MAPTERHORN_DEM_SOURCE_ID = "mapterhorn-dem-source";
export const MAPTERHORN_HILLSHADE_LAYER_ID = "mapterhorn-hillshade-layer";

/**
 * Owns the MapLibre sources/layers/terrain/overlay this plugin adds to the
 * host map, and reconciles them against `MapterhornSettings` changes.
 *
 * Two complementary pieces back the visualization:
 * - `raster-dem` (native, `encoding: "terrarium"`) feeds MapLibre's built-in
 *   `hillshade` layer and `map.setTerrain(...)` for 3D — no custom code
 *   needed for either.
 * - A `map.project()`-synced 2D canvas overlay (`MapterhornColorOverlay`)
 *   decodes the same tiles a second time to render outlier-trimmed
 *   hypsometric color tinting and contour lines, which MapLibre has no
 *   native support for (see that class's docstring for why this is a DOM
 *   overlay rather than a MapLibre source/layer). Because it is a flat 2D
 *   overlay, it is hidden whenever 3D terrain is enabled.
 */
export class MapterhornLayerManager {
  private readonly map: MapLibreMap;
  private settings: MapterhornSettings;
  private readonly colorOverlay: MapterhornColorOverlay;
  private added = false;

  constructor(map: MapLibreMap, settings: MapterhornSettings, onStatsUpdated: (stats: OutlierTrimResult) => void) {
    this.map = map;
    this.settings = settings;
    this.colorOverlay = new MapterhornColorOverlay(map, {
      getColorRamp: () => this.settings.colorRamp,
      getTrimOutliers: () => this.settings.trimOutliers,
      getOutlierPercentile: () => this.settings.outlierPercentile,
      getContours: () => this.settings.contours,
      getContourInterval: () => this.settings.contourInterval,
      getContourSmoothing: () => this.settings.contourSmoothing,
      onStatsUpdated,
    });
  }

  /** Adds all sources/layers/terrain/overlay and applies the current settings. Idempotent. */
  mount(): void {
    if (this.added) return;
    const { map } = this;

    map.addSource(MAPTERHORN_DEM_SOURCE_ID, {
      type: "raster-dem",
      tiles: [MAPTERHORN_TILE_URL_TEMPLATE],
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

    this.colorOverlay.mount();
    this.colorOverlay.setOpacity(this.settings.colorOpacity);
    this.colorOverlay.setVisible(this.settings.enabled && !this.settings.terrain3d);

    this.added = true;
    this.applyTerrain();
  }

  /** Removes all sources/layers/terrain/overlay added by `mount()`. */
  unmount(): void {
    if (!this.added) return;
    const { map } = this;
    if (map.getTerrain()?.source === MAPTERHORN_DEM_SOURCE_ID) map.setTerrain(null);
    this.colorOverlay.unmount();
    if (map.getLayer(MAPTERHORN_HILLSHADE_LAYER_ID)) map.removeLayer(MAPTERHORN_HILLSHADE_LAYER_ID);
    if (map.getSource(MAPTERHORN_DEM_SOURCE_ID)) map.removeSource(MAPTERHORN_DEM_SOURCE_ID);
    this.added = false;
  }

  /**
   * Applies a settings patch. Live-updatable paint properties (hillshade
   * strength/direction, exaggeration, opacity, visibility) apply instantly;
   * changes that affect tile pixel content (color ramp, outlier trim,
   * contours) require re-rendering already-decoded tiles, done by
   * invalidating the color overlay's tile cache.
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

    this.colorOverlay.setOpacity(next.colorOpacity);
    // The color/contour overlay is a flat 2D canvas (see MapterhornColorOverlay's
    // docstring), so it is hidden whenever 3D terrain is on to avoid it looking
    // like a floating flat sheet over the pitched relief.
    this.colorOverlay.setVisible(next.enabled && !next.terrain3d);

    if (next.terrain3d !== previous.terrain3d || next.exaggeration !== previous.exaggeration) {
      this.applyTerrain();
    }

    const needsRecolor =
      next.colorRamp !== previous.colorRamp ||
      next.trimOutliers !== previous.trimOutliers ||
      next.outlierPercentile !== previous.outlierPercentile ||
      next.contours !== previous.contours ||
      next.contourInterval !== previous.contourInterval ||
      next.contourSmoothing !== previous.contourSmoothing;
    if (needsRecolor) {
      this.colorOverlay.invalidate({
        getColorRamp: () => this.settings.colorRamp,
        getTrimOutliers: () => this.settings.trimOutliers,
        getOutlierPercentile: () => this.settings.outlierPercentile,
        getContours: () => this.settings.contours,
        getContourInterval: () => this.settings.contourInterval,
        getContourSmoothing: () => this.settings.contourSmoothing,
      });
    }
  }

  private applyTerrain(): void {
    const { map, settings } = this;
    if (settings.terrain3d) {
      map.setTerrain({ source: MAPTERHORN_DEM_SOURCE_ID, exaggeration: settings.exaggeration });
    } else if (map.getTerrain()?.source === MAPTERHORN_DEM_SOURCE_ID) {
      map.setTerrain(null);
    }
  }
}
