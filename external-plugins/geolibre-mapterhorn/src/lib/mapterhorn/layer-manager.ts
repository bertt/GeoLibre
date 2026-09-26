import type { Map as MapLibreMap } from "maplibre-gl";
import {
  MAPTERHORN_ENCODING,
  MAPTERHORN_MAX_ZOOM,
  MAPTERHORN_TILE_SIZE,
  MAPTERHORN_TILE_URL_TEMPLATE,
} from "./terrarium";
import { createMapterhornColorSource, MAPTERHORN_COLOR_LAYER_ID, MAPTERHORN_COLOR_SOURCE_ID } from "./color-source";
import type { MapterhornSettings } from "./settings";
import type { OutlierTrimResult } from "./outlier-stats";

export const MAPTERHORN_DEM_SOURCE_ID = "mapterhorn-dem-source";
export const MAPTERHORN_HILLSHADE_LAYER_ID = "mapterhorn-hillshade-layer";

/**
 * Owns the MapLibre sources/layers/terrain this plugin adds to the host map,
 * and reconciles them against `MapterhornSettings` changes.
 *
 * Two complementary sources back the visualization:
 * - `raster-dem` (native, `encoding: "terrarium"`) feeds MapLibre's built-in
 *   `hillshade` layer and `map.setTerrain(...)` for 3D — no custom code
 *   needed for either.
 * - A `type: "custom"` source (`createMapterhornColorSource`) decodes the
 *   same tiles a second time to render outlier-trimmed hypsometric color
 *   tinting and contour lines, which MapLibre has no native support for.
 */
export class MapterhornLayerManager {
  private readonly map: MapLibreMap;
  private settings: MapterhornSettings;
  private readonly onStatsUpdated: (stats: OutlierTrimResult) => void;
  private added = false;

  constructor(map: MapLibreMap, settings: MapterhornSettings, onStatsUpdated: (stats: OutlierTrimResult) => void) {
    this.map = map;
    this.settings = settings;
    this.onStatsUpdated = onStatsUpdated;
  }

  /** Adds all sources/layers and applies the current settings. Idempotent. */
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

    map.addSource(
      MAPTERHORN_COLOR_SOURCE_ID,
      createMapterhornColorSource({
        getColorRamp: () => this.settings.colorRamp,
        getTrimOutliers: () => this.settings.trimOutliers,
        getOutlierPercentile: () => this.settings.outlierPercentile,
        getContours: () => this.settings.contours,
        getContourInterval: () => this.settings.contourInterval,
        getContourSmoothing: () => this.settings.contourSmoothing,
        onStatsUpdated: this.onStatsUpdated,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    );

    map.addLayer({
      id: MAPTERHORN_COLOR_LAYER_ID,
      type: "raster",
      source: MAPTERHORN_COLOR_SOURCE_ID,
      paint: { "raster-opacity": this.settings.colorOpacity },
      layout: { visibility: this.settings.enabled ? "visible" : "none" },
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
  }

  /** Removes all sources/layers/terrain added by `mount()`. */
  unmount(): void {
    if (!this.added) return;
    const { map } = this;
    if (map.getTerrain()?.source === MAPTERHORN_DEM_SOURCE_ID) map.setTerrain(null);
    if (map.getLayer(MAPTERHORN_HILLSHADE_LAYER_ID)) map.removeLayer(MAPTERHORN_HILLSHADE_LAYER_ID);
    if (map.getLayer(MAPTERHORN_COLOR_LAYER_ID)) map.removeLayer(MAPTERHORN_COLOR_LAYER_ID);
    if (map.getSource(MAPTERHORN_COLOR_SOURCE_ID)) map.removeSource(MAPTERHORN_COLOR_SOURCE_ID);
    if (map.getSource(MAPTERHORN_DEM_SOURCE_ID)) map.removeSource(MAPTERHORN_DEM_SOURCE_ID);
    this.added = false;
  }

  /**
   * Applies a settings patch. Live-updatable paint properties (hillshade
   * strength/direction, exaggeration, opacity, visibility) apply instantly;
   * changes that affect tile pixel content (color ramp, outlier trim,
   * contours) require re-rendering already-loaded tiles, done by removing
   * and re-adding the color source/layer.
   */
  update(next: MapterhornSettings): void {
    const previous = this.settings;
    this.settings = next;
    if (!this.added) return;
    const { map } = this;

    const visibility = next.enabled ? "visible" : "none";
    map.setLayoutProperty(MAPTERHORN_HILLSHADE_LAYER_ID, "visibility", visibility);
    map.setLayoutProperty(MAPTERHORN_COLOR_LAYER_ID, "visibility", visibility);
    map.setPaintProperty(MAPTERHORN_HILLSHADE_LAYER_ID, "hillshade-exaggeration", next.hillshadeStrength);
    map.setPaintProperty(MAPTERHORN_HILLSHADE_LAYER_ID, "hillshade-illumination-direction", next.hillshadeDirection);
    map.setPaintProperty(MAPTERHORN_COLOR_LAYER_ID, "raster-opacity", next.colorOpacity);

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
    if (needsRecolor) this.refreshColorSource();
  }

  /**
   * Forces already-rendered color tiles to be re-decoded/re-rendered by
   * removing and re-adding the color layer/source. `CustomSourceInterface`
   * has no standard "invalidate all tiles" call, so a remove/re-add is the
   * portable way to force `loadTile` to run again with the new settings
   * (a brief flicker while tiles reload is an accepted v1 trade-off).
   */
  refreshColorSource(): void {
    const { map, settings } = this;
    if (!this.added) return;
    if (map.getLayer(MAPTERHORN_COLOR_LAYER_ID)) map.removeLayer(MAPTERHORN_COLOR_LAYER_ID);
    if (map.getSource(MAPTERHORN_COLOR_SOURCE_ID)) map.removeSource(MAPTERHORN_COLOR_SOURCE_ID);

    map.addSource(
      MAPTERHORN_COLOR_SOURCE_ID,
      createMapterhornColorSource({
        getColorRamp: () => this.settings.colorRamp,
        getTrimOutliers: () => this.settings.trimOutliers,
        getOutlierPercentile: () => this.settings.outlierPercentile,
        getContours: () => this.settings.contours,
        getContourInterval: () => this.settings.contourInterval,
        getContourSmoothing: () => this.settings.contourSmoothing,
        onStatsUpdated: this.onStatsUpdated,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    );
    map.addLayer(
      {
        id: MAPTERHORN_COLOR_LAYER_ID,
        type: "raster",
        source: MAPTERHORN_COLOR_SOURCE_ID,
        paint: { "raster-opacity": settings.colorOpacity },
        layout: { visibility: settings.enabled ? "visible" : "none" },
      },
      MAPTERHORN_HILLSHADE_LAYER_ID,
    );
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
