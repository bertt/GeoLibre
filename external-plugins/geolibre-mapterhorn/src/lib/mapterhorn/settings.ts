import type { ContourSmoothing } from "./contours";

/** All user-tunable Mapterhorn plugin settings, persisted via project state. */
export type MapterhornSettings = {
  /** Whether the Mapterhorn hillshade/terrain layers are visible. */
  enabled: boolean;
  /** Vertical exaggeration applied to both 2D relief shading and 3D terrain. */
  exaggeration: number;
  /** MapLibre `hillshade-exaggeration` (0-1): strength of the shaded-relief effect. */
  hillshadeStrength: number;
  /** Illumination direction in degrees (0-360), matches `hillshade-illumination-direction`. */
  hillshadeDirection: number;
  /** Pitched 3D terrain mode (`map.setTerrain(...)`) vs. flat 2D shading. */
  terrain3d: boolean;
  /** Hypsometric color ramp name, from `@geolibre/core`'s `VECTOR_COLOR_RAMPS`. */
  colorRamp: string;
  /** Opacity (0-1) of the hypsometric color-tint layer over the hillshade. */
  colorOpacity: number;
  /** Contour line overlay toggle (default off). */
  contours: boolean;
  /** Contour interval in meters. */
  contourInterval: number;
  contourSmoothing: ContourSmoothing;
  /** Outlier-trim toggle for the color scale (default on). */
  trimOutliers: boolean;
  /** Percent (0-49) trimmed from each tail of the elevation histogram. */
  outlierPercentile: number;
};

export const DEFAULT_SETTINGS: MapterhornSettings = {
  enabled: true,
  exaggeration: 1.5,
  hillshadeStrength: 0.5,
  hillshadeDirection: 315,
  terrain3d: false,
  colorRamp: "terrain",
  colorOpacity: 0.6,
  contours: false,
  contourInterval: 100,
  contourSmoothing: "gentle",
  trimOutliers: true,
  outlierPercentile: 2,
};

export const SETTINGS_LIMITS = {
  exaggeration: { min: 0, max: 5, step: 0.1 },
  hillshadeStrength: { min: 0, max: 1, step: 0.05 },
  hillshadeDirection: { min: 0, max: 360, step: 1 },
  colorOpacity: { min: 0, max: 1, step: 0.05 },
  contourInterval: { min: 5, max: 1000, step: 5 },
  outlierPercentile: { min: 0, max: 25, step: 0.5 },
} as const;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Merges a partial settings patch onto defaults/current, clamping numeric fields to their supported ranges. */
export function normalizeSettings(
  patch: Partial<MapterhornSettings>,
  base: MapterhornSettings = DEFAULT_SETTINGS,
): MapterhornSettings {
  const merged: MapterhornSettings = { ...base, ...patch };
  return {
    ...merged,
    exaggeration: clamp(merged.exaggeration, SETTINGS_LIMITS.exaggeration.min, SETTINGS_LIMITS.exaggeration.max),
    hillshadeStrength: clamp(
      merged.hillshadeStrength,
      SETTINGS_LIMITS.hillshadeStrength.min,
      SETTINGS_LIMITS.hillshadeStrength.max,
    ),
    hillshadeDirection: Number.isFinite(merged.hillshadeDirection)
      ? ((merged.hillshadeDirection % 360) + 360) % 360
      : DEFAULT_SETTINGS.hillshadeDirection,
    colorOpacity: clamp(merged.colorOpacity, SETTINGS_LIMITS.colorOpacity.min, SETTINGS_LIMITS.colorOpacity.max),
    contourInterval: clamp(
      merged.contourInterval,
      SETTINGS_LIMITS.contourInterval.min,
      SETTINGS_LIMITS.contourInterval.max,
    ),
    outlierPercentile: clamp(
      merged.outlierPercentile,
      SETTINGS_LIMITS.outlierPercentile.min,
      SETTINGS_LIMITS.outlierPercentile.max,
    ),
  };
}
