import { describe, expect, it } from "vitest";
import {
  computeOutlierTrim,
  ElevationHistogramAccumulator,
  percentileFromHistogram,
  type ElevationHistogram,
} from "../src/lib/mapterhorn/outlier-stats";

function uniformHistogram(min: number, max: number, bins: number): ElevationHistogram {
  return { min, max, bins: new Array(bins).fill(1) };
}

describe("percentileFromHistogram", () => {
  it("returns min for p=0 and max for p=1 on a uniform histogram", () => {
    const stats = uniformHistogram(0, 100, 10);
    expect(percentileFromHistogram(stats, 0)).toBeCloseTo(0, 5);
    expect(percentileFromHistogram(stats, 1)).toBeCloseTo(100, 5);
  });

  it("returns the midpoint for p=0.5 on a uniform histogram", () => {
    const stats = uniformHistogram(0, 100, 10);
    expect(percentileFromHistogram(stats, 0.5)).toBeCloseTo(50, 5);
  });

  it("falls back to min when there are no samples", () => {
    const stats: ElevationHistogram = { min: 10, max: 20, bins: [0, 0, 0] };
    expect(percentileFromHistogram(stats, 0.5)).toBeCloseTo(15, 5);
  });
});

describe("ElevationHistogramAccumulator", () => {
  it("accumulates samples across multiple `add()` calls", () => {
    const acc = new ElevationHistogramAccumulator(0, 100, 10);
    acc.add([5, 15, 25]);
    acc.add([95]);
    expect(acc.count).toBe(4);
  });

  it("ignores non-finite samples", () => {
    const acc = new ElevationHistogramAccumulator(0, 100, 10);
    acc.add([5, NaN, Infinity, 10]);
    expect(acc.count).toBe(2);
  });

  it("supports a stride to sparsely sample large tiles", () => {
    const acc = new ElevationHistogramAccumulator(0, 100, 10);
    acc.add([1, 2, 3, 4, 5, 6], 2);
    expect(acc.count).toBe(3);
  });
});

describe("computeOutlierTrim", () => {
  it("trims both tails symmetrically for a uniform histogram", () => {
    const histogram = uniformHistogram(0, 100, 100);
    const result = computeOutlierTrim(histogram, 10);
    expect(result.min).toBeCloseTo(10, 0);
    expect(result.max).toBeCloseTo(90, 0);
    expect(result.observedMin).toBeCloseTo(0, 0);
    expect(result.observedMax).toBeCloseTo(100, 0);
  });

  it("returns the observed range unchanged when trimming is disabled (percentile 0)", () => {
    const histogram = uniformHistogram(0, 100, 100);
    const result = computeOutlierTrim(histogram, 0);
    expect(result.min).toBeCloseTo(result.observedMin, 0);
    expect(result.max).toBeCloseTo(result.observedMax, 0);
  });

  it("reports zero samples for an empty histogram", () => {
    const histogram: ElevationHistogram = { min: 0, max: 10, bins: [0, 0, 0] };
    const result = computeOutlierTrim(histogram, 5);
    expect(result.sampleCount).toBe(0);
  });
});
