import { describe, expect, it } from "vitest";
import { extractContours, smoothGrid } from "../src/lib/mapterhorn/contours";

/** Builds a row-major grid from an array of rows. */
function grid(rows: number[][]): { data: Float32Array; width: number; height: number } {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data[y * width + x] = rows[y][x];
    }
  }
  return { data, width, height };
}

describe("extractContours", () => {
  it("returns no segments for a flat grid", () => {
    const { data, width, height } = grid([
      [10, 10, 10],
      [10, 10, 10],
      [10, 10, 10],
    ]);
    expect(extractContours(data, width, height, 5)).toHaveLength(0);
  });

  it("returns no segments when interval is not positive", () => {
    const { data, width, height } = grid([
      [0, 10],
      [10, 20],
    ]);
    expect(extractContours(data, width, height, 0)).toHaveLength(0);
  });

  it("extracts at least one segment across a simple elevation ramp", () => {
    // A 4x2 ramp from 0 to 30 crosses the 10 and 20 contour levels.
    const { data, width, height } = grid([
      [0, 10, 20, 30],
      [0, 10, 20, 30],
    ]);
    const segments = extractContours(data, width, height, 10);
    expect(segments.length).toBeGreaterThan(0);
  });

  it("produces more crossings for a smaller interval", () => {
    const { data, width, height } = grid([
      [0, 100],
      [0, 100],
    ]);
    const coarse = extractContours(data, width, height, 50);
    const fine = extractContours(data, width, height, 10);
    expect(fine.length).toBeGreaterThanOrEqual(coarse.length);
  });
});

describe("smoothGrid", () => {
  it("is a no-op when smoothing is off", () => {
    const { data, width, height } = grid([
      [0, 100],
      [100, 0],
    ]);
    const result = smoothGrid(data, width, height, "off");
    expect(result).toBe(data);
  });

  it("reduces the peak-to-peak range for a noisy grid when smoothing is on", () => {
    const { data, width, height } = grid([
      [0, 100, 0, 100],
      [100, 0, 100, 0],
      [0, 100, 0, 100],
      [100, 0, 100, 0],
    ]);
    const smoothed = smoothGrid(data, width, height, "gentle");
    const originalRange = Math.max(...data) - Math.min(...data);
    const smoothedRange = Math.max(...smoothed) - Math.min(...smoothed);
    expect(smoothedRange).toBeLessThan(originalRange);
  });
});
