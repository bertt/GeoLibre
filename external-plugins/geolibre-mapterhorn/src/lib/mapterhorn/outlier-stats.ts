/**
 * Outlier-trim statistics for the Mapterhorn elevation color scale.
 *
 * The percentile-from-histogram math is ported (copied, not imported) from
 * `packages/plugins/src/plugins/raster-symbology.ts` (`percentileFromHistogram`),
 * which is itself a dependency-free reimplementation of
 * `maplibre-gl-raster`'s helper of the same name. It is copied rather than
 * imported because `@geolibre/plugins` is a private, unpublished workspace
 * package (not resolvable once this plugin is extracted into its own repo),
 * while this file has no such constraint.
 */

export type ElevationHistogram = {
  min: number;
  max: number;
  /** Bin counts evenly distributed over [min, max]. */
  bins: number[];
};

/** Default global elevation range (meters) used to size the running histogram bins. */
export const DEFAULT_ELEVATION_RANGE: readonly [number, number] = [-430, 8850];

const DEFAULT_BIN_COUNT = 256;

/**
 * Accumulates a running histogram of decoded elevation samples across tiles,
 * so the outlier-trim min/max and stats panel improve as more tiles decode
 * (rather than only reflecting a single tile).
 */
export class ElevationHistogramAccumulator {
  private readonly bins: Float64Array;
  private readonly min: number;
  private readonly max: number;
  private sampleCount = 0;

  constructor(
    min: number = DEFAULT_ELEVATION_RANGE[0],
    max: number = DEFAULT_ELEVATION_RANGE[1],
    binCount: number = DEFAULT_BIN_COUNT,
  ) {
    this.min = min;
    this.max = max;
    this.bins = new Float64Array(Math.max(1, binCount));
  }

  /** Folds a decoded tile's elevation samples into the running histogram. */
  add(samples: ArrayLike<number>, stride = 1): void {
    const { min, max, bins } = this;
    const span = max - min;
    if (span <= 0) return;
    const binCount = bins.length;
    for (let i = 0; i < samples.length; i += stride) {
      const value = samples[i];
      if (!Number.isFinite(value)) continue;
      let index = Math.floor(((value - min) / span) * binCount);
      if (index < 0) index = 0;
      else if (index >= binCount) index = binCount - 1;
      bins[index] += 1;
      this.sampleCount += 1;
    }
  }

  get count(): number {
    return this.sampleCount;
  }

  snapshot(): ElevationHistogram {
    return { min: this.min, max: this.max, bins: Array.from(this.bins) };
  }

  reset(): void {
    this.bins.fill(0);
    this.sampleCount = 0;
  }
}

/**
 * Linear-interpolated percentile from a histogram. Ported from
 * `percentileFromHistogram` in `raster-symbology.ts` (see file header).
 *
 * @param stats - The histogram (min, max, bin counts).
 * @param p - The percentile in [0, 1].
 * @returns The value at percentile `p`.
 */
export function percentileFromHistogram(stats: ElevationHistogram, p: number): number {
  const { min, max, bins } = stats;
  const binCount = bins.length;
  if (binCount === 0 || max <= min) return min;
  const total = bins.reduce((sum, count) => sum + count, 0);
  if (total === 0) return min + (max - min) * p;

  const target = p * total;
  let cumulative = 0;
  const binWidth = (max - min) / binCount;
  for (let index = 0; index < binCount; index += 1) {
    const next = cumulative + bins[index];
    if (next >= target) {
      const within = bins[index] === 0 ? 0 : (target - cumulative) / bins[index];
      return min + (index + within) * binWidth;
    }
    cumulative = next;
  }
  return max;
}

export type OutlierTrimResult = {
  /** Trimmed lower bound used for color-scale stretching. */
  min: number;
  /** Trimmed upper bound used for color-scale stretching. */
  max: number;
  /** Untrimmed observed min/max, for the stats readout. */
  observedMin: number;
  observedMax: number;
  sampleCount: number;
};

/**
 * Computes a percentile-trimmed [min, max] color-scale range from a running
 * histogram, e.g. `outlierPercentile = 2` trims the bottom/top 2% of samples.
 *
 * @param histogram - The running elevation histogram.
 * @param outlierPercentile - Percent (0-49) to trim from each tail.
 */
export function computeOutlierTrim(
  histogram: ElevationHistogram,
  outlierPercentile: number,
): OutlierTrimResult {
  const p = Math.min(0.49, Math.max(0, outlierPercentile / 100));
  const observedMin = firstNonEmptyBinValue(histogram, "min");
  const observedMax = firstNonEmptyBinValue(histogram, "max");
  const sampleCount = histogram.bins.reduce((sum, count) => sum + count, 0);
  if (sampleCount === 0 || p === 0) {
    return {
      min: observedMin,
      max: observedMax,
      observedMin,
      observedMax,
      sampleCount,
    };
  }
  return {
    min: percentileFromHistogram(histogram, p),
    max: percentileFromHistogram(histogram, 1 - p),
    observedMin,
    observedMax,
    sampleCount,
  };
}

function firstNonEmptyBinValue(histogram: ElevationHistogram, edge: "min" | "max"): number {
  const { min, max, bins } = histogram;
  const binWidth = (max - min) / bins.length;
  if (edge === "min") {
    for (let i = 0; i < bins.length; i += 1) {
      if (bins[i] > 0) return min + i * binWidth;
    }
    return min;
  }
  for (let i = bins.length - 1; i >= 0; i -= 1) {
    if (bins[i] > 0) return min + (i + 1) * binWidth;
  }
  return max;
}
