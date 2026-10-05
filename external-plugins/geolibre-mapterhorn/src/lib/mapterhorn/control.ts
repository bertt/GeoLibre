import type { IControl } from "maplibre-gl";

/**
 * Minimal MapLibre control: a single toggle button that opens/closes the
 * plugin's right-sidebar panel (see `registerRightPanel` in `geolibre.ts`).
 * All actual UI (sliders, toggles, stats) lives in the right panel; this
 * control only exists because `addMapControl`/`removeMapControl` are the one
 * guaranteed host capability every GeoLibre plugin must use to attach itself
 * to the map (see docs/plugin-api.md).
 */
export class MapterhornControl implements IControl {
  private container?: HTMLElement;

  constructor(private readonly onToggle: () => void) {}

  onAdd(): HTMLElement {
    const container = document.createElement("div");
    container.className = "maplibregl-ctrl maplibregl-ctrl-group geolibre-mapterhorn-control";

    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", "Mapterhorn");
    button.title = "Mapterhorn";
    // Flex-centers the SVG in the button: MapLibre's other built-in controls
    // center their icon via a `background-image`, which auto-centers, but an
    // inline <svg> child needs explicit centering or it sits at the button's
    // default top-left text-flow position.
    button.style.display = "flex";
    button.style.alignItems = "center";
    button.style.justifyContent = "center";
    // Explicit stroke color, not `currentColor`: MapLibre's `.maplibregl-ctrl-group`
    // button background is hardcoded white regardless of GeoLibre's theme, and in
    // dark mode `currentColor` resolves to the page's light (near-white) text
    // color, rendering an invisible white-on-white icon.
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#4b5563" stroke-width="2" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M3 20 L9 9 L13 15 L16 10 L21 20 Z"/></svg>';
    button.addEventListener("click", () => this.onToggle());

    container.appendChild(button);
    this.container = container;
    return container;
  }

  onRemove(): void {
    this.container?.parentNode?.removeChild(this.container);
    this.container = undefined;
  }
}
