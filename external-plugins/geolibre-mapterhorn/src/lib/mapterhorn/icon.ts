/**
 * Shared Mapterhorn glyph (a simple mountain silhouette), used wherever the
 * host renders a plugin-supplied icon as an `<img>` (right-panel rail,
 * toolbar menus) instead of inline SVG. `<img>` can't resolve `currentColor`,
 * so this is rendered with a fixed stroke color instead of inheriting the
 * host's theme color — unlike `MapterhornControl`'s inline SVG button, which
 * uses `stroke="currentColor"` directly.
 */
const MAPTERHORN_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" ' +
  'stroke="#4b5563" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
  '<path d="M3 20 L9 9 L13 15 L16 10 L21 20 Z"/></svg>';

export const MAPTERHORN_ICON_DATA_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(MAPTERHORN_ICON_SVG)}`;
