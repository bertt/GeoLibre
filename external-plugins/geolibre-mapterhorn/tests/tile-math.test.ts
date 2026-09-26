import { describe, expect, it } from "vitest";
import { lngLatToTile, tileToLngLat } from "../src/lib/mapterhorn/tile-math";

describe("lngLatToTile / tileToLngLat", () => {
  it("maps the origin (0, 0) to the four center tiles at zoom 1", () => {
    // At zoom 1 the world is a 2x2 tile grid; (0, 0) lng/lat sits exactly on
    // the shared corner of all four tiles, so it resolves to the bottom-right
    // of the top-left quadrant, tile (1, 1).
    expect(lngLatToTile(0, 0, 1)).toEqual({ x: 1, y: 1 });
  });

  it("maps the top-left tile (0, 0, 0) to the world corners", () => {
    const nw = tileToLngLat(0, 0, 0);
    expect(nw.lng).toBeCloseTo(-180, 6);
    expect(nw.lat).toBeCloseTo(85.0511287798, 6);
  });

  it("round-trips a tile's NW corner back to the same tile index", () => {
    const z = 8;
    const x = 42;
    const y = 77;
    const { lng, lat } = tileToLngLat(x, y, z);
    // Nudge slightly inward so floating-point error at the exact boundary
    // doesn't spill into the neighboring tile.
    expect(lngLatToTile(lng + 1e-6, lat - 1e-6, z)).toEqual({ x, y });
  });

  it("increases the tile x index eastward and y index southward", () => {
    const z = 5;
    const west = lngLatToTile(-100, 40, z);
    const east = lngLatToTile(-90, 40, z);
    expect(east.x).toBeGreaterThan(west.x);

    const north = lngLatToTile(-95, 45, z);
    const south = lngLatToTile(-95, 35, z);
    expect(south.y).toBeGreaterThan(north.y);
  });
});
