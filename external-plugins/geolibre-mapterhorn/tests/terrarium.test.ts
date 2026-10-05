import { describe, expect, it } from "vitest";
import {
  decodeTerrariumImage,
  decodeTerrariumPixel,
  mapterhornTileUrl,
} from "../src/lib/mapterhorn/terrarium";

describe("decodeTerrariumPixel", () => {
  it("decodes the terrarium zero-elevation baseline (R=128, G=0, B=0)", () => {
    // Terrarium formula: (128 * 256 + 0 + 0/256) - 32768 = 0
    expect(decodeTerrariumPixel(128, 0, 0)).toBe(0);
  });

  it("matches the documented formula for an arbitrary pixel", () => {
    expect(decodeTerrariumPixel(131, 88, 0)).toBe(131 * 256 + 88 - 32768);
  });

  it("includes the blue channel as a sub-meter fraction", () => {
    const withoutBlue = decodeTerrariumPixel(128, 0, 0);
    const withBlue = decodeTerrariumPixel(128, 0, 256);
    expect(withBlue - withoutBlue).toBe(1);
  });
});

describe("decodeTerrariumImage", () => {
  it("decodes a full RGBA buffer, ignoring alpha", () => {
    const width = 2;
    const height = 1;
    // Two pixels: (128,0,0,255) => 0m, (129,0,0,0) => 256m
    const rgba = new Uint8ClampedArray([128, 0, 0, 255, 129, 0, 0, 0]);
    const elevations = decodeTerrariumImage(rgba, width, height);
    expect(elevations.length).toBe(2);
    expect(elevations[0]).toBe(0);
    expect(elevations[1]).toBe(256);
  });

  it("throws when the buffer is too small for the declared dimensions", () => {
    const rgba = new Uint8ClampedArray([0, 0, 0, 0]);
    expect(() => decodeTerrariumImage(rgba, 2, 2)).toThrow();
  });
});

describe("mapterhornTileUrl", () => {
  it("substitutes z/x/y into the tile URL template", () => {
    expect(mapterhornTileUrl(3, 2, 1)).toBe("https://tiles.mapterhorn.com/3/2/1.webp");
  });
});
