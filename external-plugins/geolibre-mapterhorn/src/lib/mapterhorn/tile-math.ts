/**
 * Standard slippy-map tile math, shared by the Mapterhorn contour overlay
 * ({@link MapterhornContourOverlay}) so its per-tile geographic bounds stay
 * consistent with the tile source it decodes from.
 */

/** Lng/lat (deg) to the containing tile index at zoom `z`. */
export function lngLatToTile(lng: number, lat: number, z: number): { x: number; y: number } {
  const n = 2 ** z;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

/** Inverse of {@link lngLatToTile}: the lng/lat (deg) of tile `(x, y)`'s NW corner at zoom `z`. */
export function tileToLngLat(x: number, y: number, z: number): { lng: number; lat: number } {
  const n = 2 ** z;
  const lng = (x / n) * 360 - 180;
  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  return { lng, lat: (latRad * 180) / Math.PI };
}
