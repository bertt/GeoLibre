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

  it("merges a partial patch onto the provided base rather than always the defaults", () => {
    const base = normalizeSettings({ exaggeration: 3 }, DEFAULT_SETTINGS);
    const next = normalizeSettings({ terrain3d: false }, base);
    expect(next.exaggeration).toBe(3);
    expect(next.terrain3d).toBe(false);
  });

  it("leaves values already within range untouched", () => {
    const result = normalizeSettings({ hillshadeStrength: 0.42 });
    expect(result.hillshadeStrength).toBe(0.42);
  });

  it("falls back to the stock tile URL for blank input", () => {
    expect(normalizeSettings({ tileUrlTemplate: "  " }).tileUrlTemplate).toBe(DEFAULT_SETTINGS.tileUrlTemplate);
  });
});
