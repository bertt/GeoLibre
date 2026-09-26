import { getVectorColorRamp, interpolateColors, parseHexColor } from "@geolibre/core";
import { decodeTerrariumImage, mapterhornTileUrl, MAPTERHORN_TILE_SIZE, MAPTERHORN_MAX_ZOOM } from "./terrarium";
import { computeOutlierTrim, ElevationHistogramAccumulator, type OutlierTrimResult } from "./outlier-stats";
import { extractContours, smoothGrid, type ContourSmoothing } from "./contours";

export const MAPTERHORN_COLOR_SOURCE_ID = "mapterhorn-color-source";
export const MAPTERHORN_COLOR_LAYER_ID = "mapterhorn-color-layer";

const RAMP_SAMPLES = 256;

export type MapterhornColorSourceOptions = {
  getColorRamp: () => string;
  getTrimOutliers: () => boolean;
  getOutlierPercentile: () => number;
  getContours: () => boolean;
  getContourInterval: () => number;
  getContourSmoothing: () => ContourSmoothing;
  /** Called after each tile decodes, so the stats panel can refresh. */
  onStatsUpdated?: (stats: OutlierTrimResult) => void;
};

/**
 * Minimal shape of MapLibre's `CustomSourceInterface<T>` this module targets
 * (see https://maplibre.org/maplibre-gl-js/docs/API/type-aliases/CustomSourceInterface/).
 * Declared locally instead of imported from `maplibre-gl` so this file has no
 * runtime dependency on the `maplibre-gl` package — a plugin that bundled its
 * own copy of `maplibre-gl` just to get this type would risk shipping a
 * second module instance alongside the host's, so we only rely on the
 * `map.addSource(id, source)` object shape, driven through the host's own
 * `Map` instance (`app.getMap()`).
 */
export type MapterhornCustomSource = {
  type: "custom";
  dataType: "raster";
  tileSize: number;
  minzoom?: number;
  maxzoom?: number;
  loadTile(tile: { x: number; y: number; z: number }, options: { signal: AbortSignal }): Promise<ImageBitmap>;
};

/**
 * Builds a MapLibre custom raster source (`type: "custom"`) that renders a
 * hypsometric-tint + contour-line raster tile derived from the underlying
 * Mapterhorn terrarium-encoded webp tile.
 *
 * This is the one piece a native `raster-dem` + `hillshade` layer can't do:
 * outlier-trimmed color scaling and contour lines. Everything else (basic
 * shaded relief, 3D terrain, vertical exaggeration) uses MapLibre's built-in
 * `raster-dem` source + `hillshade` layer + `map.setTerrain(...)`, wired up
 * in `layer-manager.ts`.
 *
 * Settings are read live via the `options` getters on every tile load, so
 * sliders/toggles apply to newly loaded tiles immediately; already-rendered
 * tiles need a source refresh (see `refreshMapterhornColorSource`) to
 * pick up a changed color ramp, outlier trim, or contour setting.
 */
export function createMapterhornColorSource(options: MapterhornColorSourceOptions): MapterhornCustomSource {
  const histogram = new ElevationHistogramAccumulator();

  return {
    type: "custom",
    dataType: "raster",
    tileSize: MAPTERHORN_TILE_SIZE,
    minzoom: 0,
    maxzoom: MAPTERHORN_MAX_ZOOM,

    async loadTile({ x, y, z }, { signal }): Promise<ImageBitmap> {
      const sourceUrl = mapterhornTileUrl(z, x, y);
      const response = await fetch(sourceUrl, { signal });
      if (!response.ok) throw new Error(`Mapterhorn tile fetch failed: ${response.status} ${sourceUrl}`);
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);

      const size = MAPTERHORN_TILE_SIZE;
      const canvas = new OffscreenCanvas(size, size);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("2D canvas context unavailable");
      ctx.drawImage(bitmap, 0, 0, size, size);
      bitmap.close();
      const rgba = ctx.getImageData(0, 0, size, size).data;

      const elevations = decodeTerrariumImage(rgba, size, size);
      histogram.add(elevations, 37); // sparse sample: plenty for a stable histogram, cheap per tile.
      const trim = computeOutlierTrim(
        histogram.snapshot(),
        options.getTrimOutliers() ? options.getOutlierPercentile() : 0,
      );
      options.onStatsUpdated?.(trim);

      const ramp = getVectorColorRamp(options.getColorRamp());
      const palette = interpolateColors(ramp.colors, RAMP_SAMPLES);
      const rgbPalette = palette.map((hex) => parseHexColor(hex));

      const output = ctx.createImageData(size, size);
      const span = Math.max(1e-6, trim.max - trim.min);
      for (let i = 0; i < elevations.length; i += 1) {
        const t = Math.min(1, Math.max(0, (elevations[i] - trim.min) / span));
        const paletteIndex = Math.min(RAMP_SAMPLES - 1, Math.round(t * (RAMP_SAMPLES - 1)));
        const color = rgbPalette[paletteIndex];
        const offset = i * 4;
        output.data[offset] = color.r;
        output.data[offset + 1] = color.g;
        output.data[offset + 2] = color.b;
        output.data[offset + 3] = 255;
      }

      if (options.getContours()) {
        drawContours(output, elevations, size, size, options.getContourInterval(), options.getContourSmoothing());
      }

      ctx.putImageData(output, 0, 0);
      return createImageBitmap(canvas);
    },
  };
}

function drawContours(
  image: ImageData,
  elevations: Float32Array,
  width: number,
  height: number,
  interval: number,
  smoothing: ContourSmoothing,
): void {
  const smoothed = smoothGrid(elevations, width, height, smoothing);
  const segments = extractContours(smoothed, width, height, interval);
  const { data } = image;
  const lineColor = { r: 60, g: 45, b: 30 };
  for (const [x1, y1, x2, y2] of segments) {
    plotLine(data, width, height, x1, y1, x2, y2, lineColor);
  }
}

/** Bresenham-style line plot directly into RGBA image data. */
function plotLine(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: { r: number; g: number; b: number },
): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 2));
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const px = Math.round(x1 + (x2 - x1) * t);
    const py = Math.round(y1 + (y2 - y1) * t);
    if (px < 0 || px >= width || py < 0 || py >= height) continue;
    const offset = (py * width + px) * 4;
    data[offset] = color.r;
    data[offset + 1] = color.g;
    data[offset + 2] = color.b;
    data[offset + 3] = 220;
  }
}
