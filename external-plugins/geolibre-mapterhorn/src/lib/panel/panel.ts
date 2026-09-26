import { VECTOR_COLOR_RAMPS } from "@geolibre/core";
import { SETTINGS_LIMITS, type MapterhornSettings } from "../mapterhorn/settings";
import type { OutlierTrimResult } from "../mapterhorn/outlier-stats";

const CSS_PREFIX = "geolibre-mapterhorn";

export type MapterhornPanelHandle = {
  /** Updates the stats readout after a tile decodes (see `layer-manager.ts`'s `onStatsUpdated`). */
  setStats: (stats: OutlierTrimResult) => void;
  destroy: () => void;
};

/**
 * Renders the plugin's right-sidebar panel body: sliders/toggles for every
 * `MapterhornSettings` field, plus a live outlier-statistics readout. Plain
 * DOM per the `registerRightPanel` contract (no React).
 */
export function renderMapterhornPanel(
  container: HTMLElement,
  initial: MapterhornSettings,
  onChange: (patch: Partial<MapterhornSettings>) => void,
): MapterhornPanelHandle {
  let settings = initial;

  container.innerHTML = "";
  container.classList.add(`${CSS_PREFIX}-panel`);
  injectStyleOnce();

  const form = document.createElement("div");
  form.className = `${CSS_PREFIX}-form`;
  container.appendChild(form);

  const emit = (patch: Partial<MapterhornSettings>) => {
    settings = { ...settings, ...patch };
    onChange(patch);
  };

  appendToggle(form, "Show terrain shading", settings.enabled, (value) => emit({ enabled: value }));

  appendSection(form, "Relief");
  appendSlider(
    form,
    "Vertical exaggeration",
    settings.exaggeration,
    SETTINGS_LIMITS.exaggeration,
    (value) => emit({ exaggeration: value }),
  );
  appendSlider(
    form,
    "Hillshade strength",
    settings.hillshadeStrength,
    SETTINGS_LIMITS.hillshadeStrength,
    (value) => emit({ hillshadeStrength: value }),
  );
  appendSlider(
    form,
    "Hillshade direction (\u00b0)",
    settings.hillshadeDirection,
    SETTINGS_LIMITS.hillshadeDirection,
    (value) => emit({ hillshadeDirection: value }),
  );
  appendToggle(form, "3D terrain", settings.terrain3d, (value) => emit({ terrain3d: value }));

  appendSection(form, "Color");
  appendSelect(
    form,
    "Color ramp",
    VECTOR_COLOR_RAMPS.map((ramp) => ({ value: ramp.value, label: ramp.label })),
    settings.colorRamp,
    (value) => emit({ colorRamp: value }),
  );
  appendSlider(form, "Color opacity", settings.colorOpacity, SETTINGS_LIMITS.colorOpacity, (value) =>
    emit({ colorOpacity: value }),
  );

  appendSection(form, "Contours");
  appendToggle(form, "Show contours", settings.contours, (value) => emit({ contours: value }));
  appendSlider(
    form,
    "Contour interval (m)",
    settings.contourInterval,
    SETTINGS_LIMITS.contourInterval,
    (value) => emit({ contourInterval: value }),
  );
  appendSelect(
    form,
    "Contour smoothing",
    [
      { value: "off", label: "Off" },
      { value: "gentle", label: "Gentle" },
      { value: "strong", label: "Strong" },
    ],
    settings.contourSmoothing,
    (value) => emit({ contourSmoothing: value as MapterhornSettings["contourSmoothing"] }),
  );

  appendSection(form, "Outlier trim");
  appendToggle(form, "Trim outliers", settings.trimOutliers, (value) => emit({ trimOutliers: value }));
  appendSlider(
    form,
    "Outlier percentile (%)",
    settings.outlierPercentile,
    SETTINGS_LIMITS.outlierPercentile,
    (value) => emit({ outlierPercentile: value }),
  );

  const statsEl = document.createElement("div");
  statsEl.className = `${CSS_PREFIX}-stats`;
  statsEl.textContent = "Elevation statistics: waiting for tiles\u2026";
  form.appendChild(statsEl);

  return {
    setStats(stats: OutlierTrimResult): void {
      const format = (value: number) => `${Math.round(value)} m`;
      statsEl.textContent =
        `Observed: ${format(stats.observedMin)} \u2013 ${format(stats.observedMax)} ` +
        `\u2022 Color scale: ${format(stats.min)} \u2013 ${format(stats.max)} ` +
        `\u2022 Samples: ${stats.sampleCount.toLocaleString()}`;
    },
    destroy(): void {
      container.innerHTML = "";
    },
  };
}

function appendSection(parent: HTMLElement, title: string): void {
  const el = document.createElement("div");
  el.className = `${CSS_PREFIX}-section`;
  el.textContent = title;
  parent.appendChild(el);
}

function appendToggle(parent: HTMLElement, label: string, value: boolean, onChange: (value: boolean) => void): void {
  const row = document.createElement("label");
  row.className = `${CSS_PREFIX}-row ${CSS_PREFIX}-toggle`;

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = value;
  input.addEventListener("change", () => onChange(input.checked));

  const text = document.createElement("span");
  text.textContent = label;

  row.append(input, text);
  parent.appendChild(row);
}

function appendSlider(
  parent: HTMLElement,
  label: string,
  value: number,
  limits: { min: number; max: number; step: number },
  onChange: (value: number) => void,
): void {
  const row = document.createElement("div");
  row.className = `${CSS_PREFIX}-row ${CSS_PREFIX}-slider`;

  const labelEl = document.createElement("div");
  labelEl.className = `${CSS_PREFIX}-slider-label`;
  const valueEl = document.createElement("span");
  valueEl.textContent = formatSliderValue(value);
  labelEl.append(`${label}: `, valueEl);

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(limits.min);
  input.max = String(limits.max);
  input.step = String(limits.step);
  input.value = String(value);
  input.addEventListener("input", () => {
    const parsed = Number(input.value);
    valueEl.textContent = formatSliderValue(parsed);
    onChange(parsed);
  });

  row.append(labelEl, input);
  parent.appendChild(row);
}

function formatSliderValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function appendSelect(
  parent: HTMLElement,
  label: string,
  options: ReadonlyArray<{ value: string; label: string }>,
  selected: string,
  onChange: (value: string) => void,
): void {
  const row = document.createElement("label");
  row.className = `${CSS_PREFIX}-row ${CSS_PREFIX}-select`;

  const labelEl = document.createElement("span");
  labelEl.textContent = label;

  const select = document.createElement("select");
  for (const option of options) {
    const optionEl = document.createElement("option");
    optionEl.value = option.value;
    optionEl.textContent = option.label;
    optionEl.selected = option.value === selected;
    select.appendChild(optionEl);
  }
  select.addEventListener("change", () => onChange(select.value));

  row.append(labelEl, select);
  parent.appendChild(row);
}

let styleInjected = false;

/** Scopes all rules to `.geolibre-mapterhorn-panel` per the plugin CSS contract (injected CSS is global). */
function injectStyleOnce(): void {
  if (styleInjected) return;
  styleInjected = true;
  const style = document.createElement("style");
  style.textContent = `
.${CSS_PREFIX}-panel { padding: 8px 12px; font-size: 13px; }
.${CSS_PREFIX}-form { display: flex; flex-direction: column; gap: 8px; }
.${CSS_PREFIX}-section { font-weight: 600; margin-top: 8px; opacity: 0.8; }
.${CSS_PREFIX}-row { display: flex; align-items: center; gap: 8px; }
.${CSS_PREFIX}-slider { flex-direction: column; align-items: stretch; gap: 2px; }
.${CSS_PREFIX}-slider-label { display: flex; justify-content: space-between; }
.${CSS_PREFIX}-select { justify-content: space-between; }
.${CSS_PREFIX}-stats { margin-top: 8px; font-size: 12px; opacity: 0.75; line-height: 1.4; }
`.trim();
  document.head.appendChild(style);
}
