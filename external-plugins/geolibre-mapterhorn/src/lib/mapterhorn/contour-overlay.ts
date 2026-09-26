import type { Map as MapLibreMap } from "maplibre-gl";
import { extractContours, smoothGrid, type ContourSmoothing } from "./contours";
import { computeOutlierTrim, ElevationHistogramAccumulator, type OutlierTrimResult } from "./outlier-stats";
import { decodeTerrariumImage, mapterhornTileUrl, MAPTERHORN_MAX_ZOOM, MAPTERHORN_TILE_SIZE } from "./terrarium";
import { lngLatToTile, tileToLngLat } from "./tile-math";

/** Above this many tiles in view, skip drawing rather than fetch a huge grid (e.g. a very low zoom or a degenerate bounds read). */
const MAX_TILES_PER_REDRAW = 512;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;

export type MapterhornContourOverlayOptions = {
  getContourInterval: () => number;
  getContourSmoothing: () => ContourSmoothing;
  /** Outlier-trim controls only feed the stats readout here (there is no color scale to clip). */
  getTrimOutliers: () => boolean;
  getOutlierPercentile: () => number;
  /** Called after each tile decodes, so the stats panel can refresh. */
  onStatsUpdated?: (stats: OutlierTrimResult) => void;
};

type CachedTile = {
  bitmap: ImageBitmap;
  /** Fingerprint of the settings this bitmap was rendered with. */
  settingsKey: string;
};

/**
 * Renders contour lines for the currently visible Mapterhorn tiles as a
 * plain 2D `<canvas>` overlay positioned over the map and redrawn via
 * `map.project()` on every pan/zoom/resize. Also feeds the outlier-trim
 * statistics readout in the right panel (elevation histogram, min/max),
 * since decoding a tile's elevation grid here is the natural place to sample
 * it — this overlay does not otherwise use outlier-trim to affect its own
 * rendering.
 *
 * Why not a MapLibre *source*: MapLibre GL JS has no `type: "custom"`
 * **source** (that is Mapbox GL JS's `CustomSourceInterface` — MapLibre only
 * supports custom source *types* registered imperatively through
 * `Map.addSourceType()`/`addProtocol()`, which are plain exports of the
 * `maplibre-gl` *module*, not methods on a `Map` instance). An external
 * plugin bundle is loaded from a `blob:` URL with no import map, so it has
 * no way to import the exact same `maplibre-gl` module instance the host
 * page resolved, and therefore cannot reach those registries — attempting
 * `map.addSource(id, { type: "custom", ... })` throws
 * `"... is not a constructor"` because MapLibre falls through to an
 * unregistered source type. A `map.project()`-synced DOM overlay only needs
 * the public, instance-level `Map` API, so it works no matter how the
 * plugin bundle was loaded.
 *
 * Trade-off: this is a flat, unprojected 2D overlay, correct for top-down
 * (`pitch: 0`, `bearing: 0`) viewing. `MapterhornLayerManager` hides it
 * whenever 3D terrain is enabled, so pitching the camera never shows a
 * floating flat sheet over the pitched relief — 3D mode falls back to
 * hillshade + terrain only (the native `raster-dem`/`hillshade`/
 * `setTerrain` pipeline, unaffected by any of this). Rendering true contour
 * lines that drape over 3D terrain/globe would require a native MapLibre
 * vector layer instead of this canvas; left as a known limitation (contours
 * are a flat, 2D-only feature by design, matching the plugin's other 2D-only
 * overlay behavior).
 */
export class MapterhornContourOverlay {
  private readonly map: MapLibreMap;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private options: MapterhornContourOverlayOptions;
  private readonly tiles = new Map<string, CachedTile>();
  private readonly pending = new Set<string>();
  private readonly histogram = new ElevationHistogramAccumulator();
  private mounted = false;
  private destroyed = false;
  private visible = true;
  private redrawScheduled = false;

  private readonly onMove = (): void => this.scheduleRedraw();
  private readonly onResize = (): void => {
    this.resizeCanvas();
    this.scheduleRedraw();
  };

  constructor(map: MapLibreMap, options: MapterhornContourOverlayOptions) {
    this.map = map;
    this.options = options;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "geolibre-mapterhorn-overlay-canvas";
    Object.assign(this.canvas.style, {
      position: "absolute",
      top: "0",
      left: "0",
      pointerEvents: "none",
    });
    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
  }

  mount(): void {
    if (this.mounted) return;
    this.mounted = true;
    this.map.getCanvasContainer().appendChild(this.canvas);
    this.resizeCanvas();
    this.map.on("move", this.onMove);
    this.map.on("resize", this.onResize);
    this.scheduleRedraw();
  }

  unmount(): void {
    if (!this.mounted) return;
    this.mounted = false;
    this.destroyed = true;
    this.map.off("move", this.onMove);
    this.map.off("resize", this.onResize);
    this.canvas.remove();
    for (const tile of this.tiles.values()) tile.bitmap.close();
    this.tiles.clear();
    this.pending.clear();
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.canvas.style.display = visible ? "" : "none";
    if (visible) this.scheduleRedraw();
  }

  /** Drops cached tiles and re-renders — call after a contour/outlier setting changes. */
  invalidate(options: MapterhornContourOverlayOptions): void {
    this.options = options;
    for (const tile of this.tiles.values()) tile.bitmap.close();
    this.tiles.clear();
    this.pending.clear();
    this.scheduleRedraw();
  }

  private resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth, clientHeight } = this.map.getContainer();
    this.canvas.width = Math.max(1, Math.round(clientWidth * dpr));
    this.canvas.height = Math.max(1, Math.round(clientHeight * dpr));
    this.canvas.style.width = `${clientWidth}px`;
    this.canvas.style.height = `${clientHeight}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private scheduleRedraw(): void {
    if (this.redrawScheduled || this.destroyed || !this.visible) return;
    this.redrawScheduled = true;
    requestAnimationFrame(() => {
      this.redrawScheduled = false;
      if (!this.destroyed) this.redraw();
    });
  }

  private redraw(): void {
    const { ctx, map } = this;
    const { clientWidth, clientHeight } = map.getContainer();
    ctx.clearRect(0, 0, clientWidth, clientHeight);

    const zoom = Math.max(0, Math.min(MAPTERHORN_MAX_ZOOM, Math.floor(map.getZoom())));
    const bounds = map.getBounds();
    if (!bounds) return;
    const west = bounds.getWest();
    const east = bounds.getEast();
    const north = Math.min(WEB_MERCATOR_MAX_LATITUDE, bounds.getNorth());
    const south = Math.max(-WEB_MERCATOR_MAX_LATITUDE, bounds.getSouth());

    const corner1 = lngLatToTile(west, north, zoom);
    const corner2 = lngLatToTile(east, south, zoom);
    const maxIndex = 2 ** zoom - 1;
    const xMin = Math.max(0, Math.min(corner1.x, corner2.x));
    const xMax = Math.min(maxIndex, Math.max(corner1.x, corner2.x));
    const yMin = Math.max(0, Math.min(corner1.y, corner2.y));
    const yMax = Math.min(maxIndex, Math.max(corner1.y, corner2.y));

    const tileCountX = xMax - xMin + 1;
    const tileCountY = yMax - yMin + 1;
    // A degenerate bounds read (or the antimeridian, unhandled in v1) could
    // otherwise request an unbounded tile grid.
    if (tileCountX <= 0 || tileCountY <= 0 || tileCountX * tileCountY > MAX_TILES_PER_REDRAW) return;

    for (let x = xMin; x <= xMax; x += 1) {
      for (let y = yMin; y <= yMax; y += 1) {
        this.drawTile(x, y, zoom);
      }
    }
  }

  private drawTile(x: number, y: number, z: number): void {
    const key = `${z}/${x}/${y}`;
    const settingsKey = this.settingsFingerprint();
    const cached = this.tiles.get(key);
    if (!cached || cached.settingsKey !== settingsKey) {
      this.requestTile(x, y, z, key, settingsKey);
    }
    const bitmap = this.tiles.get(key)?.bitmap;
    if (!bitmap) return;

    const nw = tileToLngLat(x, y, z);
    const se = tileToLngLat(x + 1, y + 1, z);
    const p1 = this.map.project([nw.lng, nw.lat]);
    const p2 = this.map.project([se.lng, se.lat]);
    const left = Math.min(p1.x, p2.x);
    const top = Math.min(p1.y, p2.y);
    const width = Math.abs(p2.x - p1.x);
    const height = Math.abs(p2.y - p1.y);
    if (width <= 0 || height <= 0) return;
    // Slight overdraw hides sub-pixel seams between adjacent tiles caused by
    // `map.project()` rounding.
    this.ctx.drawImage(bitmap, left - 0.5, top - 0.5, width + 1, height + 1);
  }

  private requestTile(x: number, y: number, z: number, key: string, settingsKey: string): void {
    if (this.pending.has(key)) return;
    this.pending.add(key);
    void this.loadAndProcessTile(x, y, z)
      .then((bitmap) => {
        this.pending.delete(key);
        if (this.destroyed) {
          bitmap.close();
          return;
        }
        this.tiles.get(key)?.bitmap.close();
        this.tiles.set(key, { bitmap, settingsKey });
        this.scheduleRedraw();
      })
      .catch(() => {
        this.pending.delete(key);
      });
  }

  private settingsFingerprint(): string {
    const o = this.options;
    return [o.getContourInterval(), o.getContourSmoothing()].join("|");
  }

  private async loadAndProcessTile(x: number, y: number, z: number): Promise<ImageBitmap> {
    const sourceUrl = mapterhornTileUrl(z, x, y);
    const response = await fetch(sourceUrl);
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
    this.histogram.add(elevations, 37); // sparse sample: plenty for a stable histogram, cheap per tile.
    const trim = computeOutlierTrim(
      this.histogram.snapshot(),
      this.options.getTrimOutliers() ? this.options.getOutlierPercentile() : 0,
    );
    this.options.onStatsUpdated?.(trim);

    const output = ctx.createImageData(size, size);
    drawContours(output, elevations, size, size, this.options.getContourInterval(), this.options.getContourSmoothing());

    ctx.putImageData(output, 0, 0);
    return createImageBitmap(canvas);
  }
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
