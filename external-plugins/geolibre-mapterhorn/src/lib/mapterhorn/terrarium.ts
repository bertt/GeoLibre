/**
 * Mapterhorn (https://tiles.mapterhorn.com) serves global terrain tiles as
 * `.webp` raster-DEM tiles using the "terrarium" encoding (512px tiles), the
 * same encoding as the legacy AWS "elevation-tiles-prod" dataset it replaces.
 * See https://github.com/mapterhorn/mapterhorn#migrate-from-aws-elevation-tiles-tilezen-joerd
 *
 * This module is pure (no DOM/network access) so it can be unit-tested
 * without a browser; the actual tile fetch + image decode lives in
 * `elevation-source.ts`.
 */

export const MAPTERHORN_TILE_URL_TEMPLATE = "https://tiles.mapterhorn.com/{z}/{x}/{y}.webp";
export const MAPTERHORN_TILE_SIZE = 512;
export const MAPTERHORN_ENCODING = "terrarium" as const;
export const MAPTERHORN_MAX_ZOOM = 14;

/**
 * Builds the concrete tile URL for a given tile coordinate. `template`
 * defaults to the stock Mapterhorn URL but accepts the user-overridable
 * template from `MapterhornSettings.tileUrlTemplate` (see settings.ts) so a
 * self-hosted/mirrored `{z}/{x}/{y}` terrarium source can be used instead.
 */
export function mapterhornTileUrl(
  z: number,
  x: number,
  y: number,
  template: string = MAPTERHORN_TILE_URL_TEMPLATE,
): string {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/**
 * Decodes a single terrarium-encoded RGB pixel into an elevation in meters.
 *
 * Formula (Mapzen/Tilezen "terrarium"):
 *   height = (R * 256 + G + B / 256) - 32768
 */
export function decodeTerrariumPixel(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/**
 * Decodes a full RGBA pixel buffer (as produced by `CanvasRenderingContext2D
 * .getImageData().data`) into a `Float32Array` of elevations, one per pixel.
 * Alpha is ignored (Mapterhorn tiles are opaque terrain-RGB).
 *
 * @param rgba - Row-major RGBA bytes, length `width * height * 4`.
 * @param width - Tile width in pixels.
 * @param height - Tile height in pixels.
 */
export function decodeTerrariumImage(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
): Float32Array {
  const pixelCount = width * height;
  if (rgba.length < pixelCount * 4) {
    throw new RangeError(
      `decodeTerrariumImage: buffer too small for ${width}x${height} (need ${pixelCount * 4} bytes, got ${rgba.length})`,
    );
  }
  const elevations = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    elevations[i] = decodeTerrariumPixel(rgba[offset], rgba[offset + 1], rgba[offset + 2]);
  }
  return elevations;
}
