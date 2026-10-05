import { SETTINGS_LIMITS, type MapterhornSettings } from "../mapterhorn/settings";

const CSS_PREFIX = "geolibre-mapterhorn";

export type MapterhornPanelHandle = {
  destroy: () => void;
};

/**
 * Renders the plugin's right-sidebar panel body: sliders/toggles for every
 * `MapterhornSettings` field. Plain DOM per the `registerRightPanel`
 * contract (no React).
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

  appendSection(form, "Source");
  appendTextInput(form, "Tile URL template", settings.tileUrlTemplate, (value) =>
    emit({ tileUrlTemplate: value }),
  );

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

  return {
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

function appendToggle(
  parent: HTMLElement,
  label: string,
  value: boolean,
  onChange: (value: boolean) => void,
): void {
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

/**
 * Text input row, used for the Mapterhorn tile URL template. Commits on
 * `change` (blur/Enter) rather than every keystroke, so editing the URL does
 * not retrigger tile fetches on each character typed.
 */
function appendTextInput(
  parent: HTMLElement,
  label: string,
  value: string,
  onChange: (value: string) => void,
): void {
  const row = document.createElement("label");
  row.className = `${CSS_PREFIX}-row ${CSS_PREFIX}-text-input`;

  const labelEl = document.createElement("span");
  labelEl.textContent = label;

  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.spellcheck = false;
  input.addEventListener("change", () => onChange(input.value));

  row.append(labelEl, input);
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
.${CSS_PREFIX}-text-input { flex-direction: column; align-items: stretch; gap: 2px; }
.${CSS_PREFIX}-text-input input {
  color-scheme: light;
  background: #ffffff;
  color: #111111;
  border: 1px solid #c9ccd1;
  border-radius: 4px;
  padding: 4px 6px;
  font-size: 12px;
  font-family: monospace;
}
`.trim();
  document.head.appendChild(style);
}
