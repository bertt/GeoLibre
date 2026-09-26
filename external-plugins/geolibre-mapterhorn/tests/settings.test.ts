import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/lib/mapterhorn/settings";

describe("normalizeSettings", () => {
  it("clamps exaggeration to its supported range", () => {
    expect(normalizeSettings({ exaggeration: 999 }).exaggeration).toBe(5);
    expect(normalizeSettings({ exaggeration: -10 }).exaggeration).toBe(0);
  });

  it("wraps hillshade direction into [0, 360)", () => {
    expect(normalizeSettings({ hillshadeDirection: 370 }).hillshadeDirection).toBe(10);
    expect(normalizeSettings({ hillshadeDirection: -10 }).hillshadeDirection).toBe(350);
  });

  it("clamps outlier percentile to [0, 25]", () => {
    expect(normalizeSettings({ outlierPercentile: 40 }).outlierPercentile).toBe(25);
    expect(normalizeSettings({ outlierPercentile: -5 }).outlierPercentile).toBe(0);
  });

  it("merges a partial patch onto the provided base rather than always the defaults", () => {
    const base = normalizeSettings({ exaggeration: 3 }, DEFAULT_SETTINGS);
    const next = normalizeSettings({ contours: true }, base);
    expect(next.exaggeration).toBe(3);
    expect(next.contours).toBe(true);
  });

  it("leaves values already within range untouched", () => {
    const result = normalizeSettings({ outlierPercentile: 4.2 });
    expect(result.outlierPercentile).toBe(4.2);
  });
});
