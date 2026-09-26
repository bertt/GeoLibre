import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../src/lib/mapterhorn/settings";
import { decodeSettingsFromUrlParams, encodeSettingsToUrlParams } from "../src/lib/utils/deep-link";

describe("encodeSettingsToUrlParams / decodeSettingsFromUrlParams", () => {
  it("round-trips every setting through URL params", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      exaggeration: 2.5,
      hillshadeStrength: 0.8,
      hillshadeDirection: 200,
      terrain3d: true,
      contours: true,
      contourInterval: 50,
      contourSmoothing: "strong" as const,
      trimOutliers: false,
      outlierPercentile: 5,
    };
    const params = encodeSettingsToUrlParams(settings);
    const decoded = decodeSettingsFromUrlParams(params, DEFAULT_SETTINGS);
    expect(decoded.exaggeration).toBe(2.5);
    expect(decoded.hillshadeStrength).toBe(0.8);
    expect(decoded.hillshadeDirection).toBe(200);
    expect(decoded.terrain3d).toBe(true);
    expect(decoded.contours).toBe(true);
    expect(decoded.contourInterval).toBe(50);
    expect(decoded.contourSmoothing).toBe("strong");
    expect(decoded.trimOutliers).toBe(false);
    expect(decoded.outlierPercentile).toBe(5);
  });

  it("leaves the base settings untouched for params that are absent", () => {
    const decoded = decodeSettingsFromUrlParams(new URLSearchParams(), DEFAULT_SETTINGS);
    expect(decoded).toEqual(DEFAULT_SETTINGS);
  });

  it("decodes boolean params from '1'/'0'", () => {
    const params = new URLSearchParams({ mtTerrain3d: "1", mtTrimOutliers: "0" });
    const decoded = decodeSettingsFromUrlParams(params, DEFAULT_SETTINGS);
    expect(decoded.terrain3d).toBe(true);
    expect(decoded.trimOutliers).toBe(false);
  });
});
