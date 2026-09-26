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
 *   overlay, it is hidden whenever 3D terrain is enabled, **and whenever the
 *   map is in globe projection** (a flat rectangle can't be wrapped onto a
 *   sphere; without this it renders as a flat plane floating in front of/
 *   behind the globe). Visibility is re-checked on MapLibre's
 *   `projectiontransition` event, which fires whenever the user toggles
 *   GeoLibre's globe control.
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
  private readonly colorOverlay: MapterhornColorOverlay;
  private added = false;
  /** Tracks whether `applyTerrain()` tilted the camera, so disabling 3D terrain only restores the pitch this plugin itself introduced (never fights a pitch the user set by hand). */
  private pitchedByPlugin = false;

  private readonly onProjectionTransition = (): void => this.syncOverlayVisibility();

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

    this.added = true;
    this.syncOverlayVisibility();
    this.map.on("projectiontransition", this.onProjectionTransition);
    this.applyTerrain();
    this.syncCameraPitch(this.settings.terrain3d);
  }

  /** Removes all sources/layers/terrain/overlay added by `mount()`. */
  unmount(): void {
    if (!this.added) return;
    const { map } = this;
    map.off("projectiontransition", this.onProjectionTransition);
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
    // docstring), so it is hidden whenever 3D terrain is on, or the map is in
    // globe projection, to avoid it looking like a floating flat sheet.
    this.syncOverlayVisibility();

    if (next.terrain3d !== previous.terrain3d || next.exaggeration !== previous.exaggeration) {
      this.applyTerrain();
    }
    if (next.terrain3d !== previous.terrain3d) {
      this.syncCameraPitch(next.terrain3d);
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

  /**
   * Recomputes the color/contour overlay's visibility from the current
   * settings and map projection. The overlay is a flat 2D canvas (see
   * `MapterhornColorOverlay`'s docstring), so it is only shown for flat,
   * top-down mercator viewing — hidden for 3D terrain and for globe
   * projection alike.
   */
  private syncOverlayVisibility(): void {
    this.colorOverlay.setVisible(this.settings.enabled && !this.settings.terrain3d && this.isFlatProjection());
  }

  private isFlatProjection(): boolean {
    return (this.map.getProjection?.()?.type ?? "mercator") === "mercator";
  }
}
