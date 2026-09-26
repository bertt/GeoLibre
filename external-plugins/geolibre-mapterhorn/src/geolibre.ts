import type { GeoLibreAppAPI, GeoLibrePlugin } from "./lib/geolibre/host-api";
import { MapterhornControl } from "./lib/mapterhorn/control";
import { MAPTERHORN_DEM_SOURCE_ID, MAPTERHORN_HILLSHADE_LAYER_ID, MapterhornLayerManager } from "./lib/mapterhorn/layer-manager";
import { DEFAULT_SETTINGS, normalizeSettings, type MapterhornSettings } from "./lib/mapterhorn/settings";
import { renderMapterhornPanel, type MapterhornPanelHandle } from "./lib/panel/panel";
import {
  MAPTERHORN_URL_PARAMETER_NAMES,
  decodeSettingsFromUrlParams,
  encodeSettingsToUrlParams,
} from "./lib/utils/deep-link";

const PLUGIN_ID = "geolibre-mapterhorn";
const RIGHT_PANEL_ID = "geolibre-mapterhorn-panel";
const HILLSHADE_NATIVE_LAYER_ID = "geolibre-mapterhorn-hillshade";

let settings: MapterhornSettings = { ...DEFAULT_SETTINGS };
let control: MapterhornControl | null = null;
let layerManager: MapterhornLayerManager | null = null;
let panelHandle: MapterhornPanelHandle | null = null;
let unregisterRightPanel: (() => void) | null = null;

function applySettings(app: GeoLibreAppAPI, patch: Partial<MapterhornSettings>): void {
  settings = normalizeSettings(patch, settings);
  layerManager?.update(settings);
}

const plugin: GeoLibrePlugin = {
  id: PLUGIN_ID,
  name: "Mapterhorn",
  version: "0.1.0",
  urlParameterNames: MAPTERHORN_URL_PARAMETER_NAMES,

  activate(app: GeoLibreAppAPI): boolean | void {
    const map = app.getMap?.();
    if (!map) {
      // Suspended engines (Cesium/Mapbox/ArcGIS) never call activate() thanks
      // to `engines: ["maplibre"]`, but guard anyway in case a host build
      // routes activation before the map is ready.
      return false;
    }

    layerManager = new MapterhornLayerManager(map, settings, (stats) => panelHandle?.setStats(stats));
    layerManager.mount();

    // Mirror the native hillshade layer into GeoLibre's Layers panel so it
    // shows up like any other layer (visibility toggle, reordering). The
    // hillshade MapLibre layer type has no generic opacity paint property
    // (only exaggeration/illumination-direction, both plugin-owned sliders in
    // the right panel), so this uses `paintMode: "plugin"` and only bridges
    // visibility — see docs/plugin-api.md's "Custom (WebGL) layers and paint
    // ownership". The hypsometric color/contour overlay is a plain DOM canvas,
    // not a MapLibre layer, so it has no separate Layers-panel entry; it is
    // controlled entirely from this plugin's own right panel.
    app.registerExternalNativeLayer?.({
      id: HILLSHADE_NATIVE_LAYER_ID,
      name: "Mapterhorn Hillshade",
      type: "raster",
      nativeLayerIds: [MAPTERHORN_HILLSHADE_LAYER_ID],
      sourceId: MAPTERHORN_DEM_SOURCE_ID,
      paintMode: "plugin",
      paintBridge: {
        setVisibility: (visible) => layerManager?.setHillshadeVisible(visible),
      },
    });

    control = new MapterhornControl(() => {
      const active = app.getActiveRightPanel?.() === RIGHT_PANEL_ID;
      if (active) app.closeRightPanel?.(RIGHT_PANEL_ID);
      else app.openRightPanel?.(RIGHT_PANEL_ID);
    });
    const added = app.addMapControl(control, "top-right");
    if (!added) {
      app.unregisterExternalNativeLayer?.(HILLSHADE_NATIVE_LAYER_ID);
      layerManager.unmount();
      layerManager = null;
      control = null;
      return false;
    }

    unregisterRightPanel =
      app.registerRightPanel?.({
        id: RIGHT_PANEL_ID,
        title: "Mapterhorn",
        defaultWidth: 300,
        render: (container) => {
          panelHandle = renderMapterhornPanel(container, settings, (patch) => applySettings(app, patch));
          return () => {
            panelHandle?.destroy();
            panelHandle = null;
          };
        },
      }) ?? null;
  },

  deactivate(app: GeoLibreAppAPI): void {
    unregisterRightPanel?.();
    unregisterRightPanel = null;
    panelHandle = null;

    if (control) {
      app.removeMapControl(control);
      control = null;
    }

    app.unregisterExternalNativeLayer?.(HILLSHADE_NATIVE_LAYER_ID);
    layerManager?.unmount();
    layerManager = null;
  },

  handleUrlParameters(app: GeoLibreAppAPI, params: URLSearchParams): void {
    settings = decodeSettingsFromUrlParams(params, settings);
    layerManager?.update(settings);
    app.openRightPanel?.(RIGHT_PANEL_ID);
  },

  getProjectState(): unknown {
    return settings;
  },

  applyProjectState(app: GeoLibreAppAPI, state: unknown): boolean | void {
    if (!state || typeof state !== "object") return false;
    settings = normalizeSettings(state as Partial<MapterhornSettings>, DEFAULT_SETTINGS);
    layerManager?.update(settings);
    return true;
  },
};

// Exposed for a plugin's own toolbar/share-link affordances, if ever added;
// unused internally beyond deep-link round-tripping tested in
// tests/deep-link.test.ts.
export { encodeSettingsToUrlParams };

export default plugin;
export { plugin };
