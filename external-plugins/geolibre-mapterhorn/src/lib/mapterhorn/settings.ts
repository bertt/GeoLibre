import { MAPTERHORN_TILE_URL_TEMPLATE } from "./terrarium";

/** All user-tunable Mapterhorn plugin settings, persisted via project state. */
export type MapterhornSettings = {
  /**
   * `{z}/{x}/{y}` terrain-tile URL template, editable in the panel so a
   * self-hosted/mirrored terrarium-encoded source can replace the stock
   * Mapterhorn endpoint. Defaults to `MAPTERHORN_TILE_URL_TEMPLATE`.
   */
  tileUrlTemplate: string;
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
};

export const DEFAULT_SETTINGS: MapterhornSettings = {
  tileUrlTemplate: MAPTERHORN_TILE_URL_TEMPLATE,
  enabled: true,
  exaggeration: 1.5,
  hillshadeStrength: 0.5,
  hillshadeDirection: 315,
  terrain3d: true,
};

export const SETTINGS_LIMITS = {
  exaggeration: { min: 0, max: 5, step: 0.1 },
  hillshadeStrength: { min: 0, max: 1, step: 0.05 },
  hillshadeDirection: { min: 0, max: 360, step: 1 },
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
    // Blank/whitespace-only input falls back to the stock Mapterhorn URL
    // rather than leaving the plugin with an empty tile template.
    tileUrlTemplate: merged.tileUrlTemplate?.trim() || MAPTERHORN_TILE_URL_TEMPLATE,
    exaggeration: clamp(merged.exaggeration, SETTINGS_LIMITS.exaggeration.min, SETTINGS_LIMITS.exaggeration.max),
    hillshadeStrength: clamp(
      merged.hillshadeStrength,
      SETTINGS_LIMITS.hillshadeStrength.min,
      SETTINGS_LIMITS.hillshadeStrength.max,
    ),
    hillshadeDirection: Number.isFinite(merged.hillshadeDirection)
      ? ((merged.hillshadeDirection % 360) + 360) % 360
      : DEFAULT_SETTINGS.hillshadeDirection,
  };
}
