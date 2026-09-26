/**
 * Contour-line extraction over a sampled elevation grid, using the classic
 * marching-squares algorithm. Kept pure (no canvas/DOM) so it is unit
 * testable; `color-tile-protocol.ts` rasterizes the returned segments.
 */

export type ContourSmoothing = "off" | "gentle" | "strong";

export type LineSegment = readonly [x1: number, y1: number, x2: number, y2: number];

/**
 * Applies a box-blur pass to a grid, used to pre-smooth elevation samples
 * before contouring so lines are less jagged at low resolution. `"gentle"`
 * uses a 3x3 box blur, `"strong"` applies it twice; `"off"` is a no-op.
 */
export function smoothGrid(
  grid: Float32Array,
  width: number,
  height: number,
  smoothing: ContourSmoothing,
): Float32Array {
  if (smoothing === "off") return grid;
  const passes = smoothing === "strong" ? 2 : 1;
  let current = grid;
  for (let pass = 0; pass < passes; pass += 1) {
    current = boxBlur3x3(current, width, height);
  }
  return current;
}

function boxBlur3x3(grid: Float32Array, width: number, height: number): Float32Array {
  const out = new Float32Array(grid.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          sum += grid[ny * width + nx];
          count += 1;
        }
      }
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

/**
 * Extracts contour line segments at every multiple of `interval` within the
 * grid's value range, via marching squares over each 2x2 cell.
 *
 * @param grid - Row-major elevation samples, length `width * height`.
 * @param width - Grid width in samples.
 * @param height - Grid height in samples.
 * @param interval - Contour interval in the same units as `grid` (meters).
 * @returns Line segments in grid (pixel) coordinates.
 */
export function extractContours(
  grid: Float32Array,
  width: number,
  height: number,
  interval: number,
): LineSegment[] {
  if (!(interval > 0) || width < 2 || height < 2) return [];

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < grid.length; i += 1) {
    const v = grid[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [];

  const firstLevel = Math.ceil(min / interval) * interval;
  const segments: LineSegment[] = [];

  for (let level = firstLevel; level <= max; level += interval) {
    for (let y = 0; y < height - 1; y += 1) {
      for (let x = 0; x < width - 1; x += 1) {
        marchCell(grid, width, x, y, level, segments);
      }
    }
  }
  return segments;
}

/** Corner values are sampled clockwise from top-left: tl, tr, br, bl. */
function marchCell(
  grid: Float32Array,
  width: number,
  x: number,
  y: number,
  level: number,
  out: LineSegment[],
): void {
  const tl = grid[y * width + x];
  const tr = grid[y * width + x + 1];
  const br = grid[(y + 1) * width + x + 1];
  const bl = grid[(y + 1) * width + x];

  let caseIndex = 0;
  if (tl > level) caseIndex |= 8;
  if (tr > level) caseIndex |= 4;
  if (br > level) caseIndex |= 2;
  if (bl > level) caseIndex |= 1;
  if (caseIndex === 0 || caseIndex === 15) return;

  // Edge midpoints, linearly interpolated toward the crossing level.
  const top = [x + lerp(tl, tr, level), y] as const;
  const right = [x + 1, y + lerp(tr, br, level)] as const;
  const bottom = [x + lerp(bl, br, level), y + 1] as const;
  const left = [x, y + lerp(tl, bl, level)] as const;

  const edgePairsByCase: Record<number, ReadonlyArray<readonly [typeof top, typeof top]>> = {
    1: [[left, bottom]],
    2: [[bottom, right]],
    3: [[left, right]],
    4: [[top, right]],
    5: [[top, left], [bottom, right]],
    6: [[top, bottom]],
    7: [[top, left]],
    8: [[left, top]],
    9: [[bottom, top]],
    10: [[left, top], [bottom, right]],
    11: [[right, top]],
    12: [[left, right]],
    13: [[right, bottom]],
    14: [[bottom, left]],
  };

  const pairs = edgePairsByCase[caseIndex];
  if (!pairs) return;
  for (const [a, b] of pairs) {
    out.push([a[0], a[1], b[0], b[1]]);
  }
}

/** Fraction along an edge (0..1) where `level` crosses between `a` and `b`. */
function lerp(a: number, b: number, level: number): number {
  if (a === b) return 0.5;
  const t = (level - a) / (b - a);
  return Math.min(1, Math.max(0, t));
}
