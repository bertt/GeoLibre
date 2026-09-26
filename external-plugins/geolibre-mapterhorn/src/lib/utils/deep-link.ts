import type { MapterhornSettings } from "../mapterhorn/settings";
import { normalizeSettings } from "../mapterhorn/settings";

/**
 * Encodes the subset of `MapterhornSettings` worth sharing in a URL (numeric
 * sliders + the two enum fields) as short query parameters, and decodes them
 * back. Booleans use `1`/`0` for a terser URL. Declared in `plugin.json`'s /
 * the plugin's `urlParameterNames` so GeoLibre auto-activates the plugin and
 * dispatches these params on load (see docs/plugin-api.md, "URL parameters").
 */
const PARAM_KEYS: Record<string, keyof MapterhornSettings> = {
  mtExaggeration: "exaggeration",
  mtHillshade: "hillshadeStrength",
  mtDirection: "hillshadeDirection",
  mtTerrain3d: "terrain3d",
  mtContours: "contours",
  mtContourInterval: "contourInterval",
  mtContourSmoothing: "contourSmoothing",
  mtTrimOutliers: "trimOutliers",
  mtOutlierPercentile: "outlierPercentile",
};

export const MAPTERHORN_URL_PARAMETER_NAMES = Object.keys(PARAM_KEYS);

export function encodeSettingsToUrlParams(settings: MapterhornSettings): URLSearchParams {
  const params = new URLSearchParams();
  for (const [param, key] of Object.entries(PARAM_KEYS)) {
    const value = settings[key];
    params.set(param, typeof value === "boolean" ? (value ? "1" : "0") : String(value));
  }
  return params;
}

export function decodeSettingsFromUrlParams(
  params: URLSearchParams,
  base: MapterhornSettings,
): MapterhornSettings {
  const patch: Partial<MapterhornSettings> = {};
  for (const [param, key] of Object.entries(PARAM_KEYS)) {
    if (!params.has(param)) continue;
    const raw = params.get(param) ?? "";
    const current = base[key];
    if (typeof current === "boolean") {
      (patch as Record<string, unknown>)[key] = raw === "1" || raw === "true";
    } else if (typeof current === "number") {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) (patch as Record<string, unknown>)[key] = parsed;
    } else {
      (patch as Record<string, unknown>)[key] = raw;
    }
  }
  return normalizeSettings(patch, base);
}
