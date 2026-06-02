const api = chrome;

if (new URLSearchParams(location.search).has("embedded")) {
  document.body.classList.add("embedded");
}

const FONT_FAMILY_OPTIONS = Object.freeze([
  { value: "system", css: "system-ui, sans-serif" },
  { value: "sans", css: "Arial, Helvetica, sans-serif" },
  { value: "serif", css: "Georgia, 'Times New Roman', serif" },
  { value: "mono", css: "Consolas, 'Cascadia Mono', 'Courier New', monospace" }
]);

const DEFAULT_SETTINGS = Object.freeze({
  UserInterfaceFontFamily: "system",
  UserInterfaceFontSize: 14,
  UserInterfaceLineSpacing: 1.4,
  SearchLimitToFolderAndSub: true,
  DeleteShowWarning: true,
  SortShowWarning: true,
  KeyboardDeleteAllow: true,
  SortByNameNatural: true,
  EnableAdvancedDetailsViewing: false,
  EnableAdvancedDetailsEditing: false
});

const $ = (id) => document.getElementById(id);
let statusTimer = null;

function showStatus(message) {
  $("status").textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $("status").textContent = ""; }, 1600);
}

function clampNumber(value, min, max, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}

function fontFamilyCss(value) {
  return (FONT_FAMILY_OPTIONS.find((option) => option.value === value) || FONT_FAMILY_OPTIONS[0]).css;
}

function normalizeSettingValue(key, value) {
  if (key === "UserInterfaceFontFamily") {
    return FONT_FAMILY_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_SETTINGS[key];
  }
  if (key === "UserInterfaceFontSize") return clampNumber(value, 11, 20, DEFAULT_SETTINGS[key]);
  if (key === "UserInterfaceLineSpacing") return clampNumber(value, 1.0, 1.8, DEFAULT_SETTINGS[key]);
  return typeof value === "boolean" ? value : DEFAULT_SETTINGS[key];
}

function applyUserInterfaceSettings(settings) {
  const family = normalizeSettingValue("UserInterfaceFontFamily", settings.UserInterfaceFontFamily);
  const size = normalizeSettingValue("UserInterfaceFontSize", settings.UserInterfaceFontSize);
  const spacing = normalizeSettingValue("UserInterfaceLineSpacing", settings.UserInterfaceLineSpacing);
  document.documentElement.style.setProperty("--sbm-ui-font-family", fontFamilyCss(family));
  document.documentElement.style.setProperty("--sbm-ui-font-size", `${size}px`);
  document.documentElement.style.setProperty("--sbm-ui-line-height", String(spacing));
}

function applyFontOptionStyles() {
  const control = $("UserInterfaceFontFamily");
  for (const optionElement of control.options) {
    optionElement.style.fontFamily = fontFamilyCss(optionElement.value);
  }
}

function readControlValue(key) {
  const control = $(key);
  if (control.type === "checkbox") return control.checked;
  return control.value;
}

function readAllControlValues() {
  const values = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    values[key] = readControlValue(key);
  }
  return values;
}

function setControlState(settings) {
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const control = $(key);
    const value = normalizeSettingValue(key, settings[key]);
    if (control.type === "checkbox") control.checked = value;
    else control.value = String(value);
  }

  if (!$("EnableAdvancedDetailsViewing").checked) {
    $("EnableAdvancedDetailsEditing").checked = false;
  }
  $("EnableAdvancedDetailsEditing").disabled = !$("EnableAdvancedDetailsViewing").checked;
  applyUserInterfaceSettings(settings);
}

async function loadOptions() {
  const stored = await api.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  setControlState({ ...DEFAULT_SETTINGS, ...stored });
}

async function saveOption(key, value) {
  const update = { [key]: normalizeSettingValue(key, value) };

  if (key === "EnableAdvancedDetailsViewing" && !value) {
    update.EnableAdvancedDetailsEditing = false;
  }

  await api.storage.local.set(update);
  setControlState({ ...DEFAULT_SETTINGS, ...(await api.storage.local.get(Object.keys(DEFAULT_SETTINGS))) });
  showStatus("Saved");
}

applyFontOptionStyles();

for (const key of Object.keys(DEFAULT_SETTINGS)) {
  $(key).addEventListener("input", () => {
    if (key === "UserInterfaceFontFamily" || key === "UserInterfaceFontSize" || key === "UserInterfaceLineSpacing") {
      applyUserInterfaceSettings({ ...DEFAULT_SETTINGS, ...readAllControlValues() });
    }
  });
  $(key).addEventListener("change", () => {
    saveOption(key, readControlValue(key)).catch((err) => {
      console.error(err);
      showStatus(`Save failed: ${err.message || err}`);
    });
  });
}

$("reset").addEventListener("click", async () => {
  await api.storage.local.set({ ...DEFAULT_SETTINGS });
  setControlState(DEFAULT_SETTINGS);
  showStatus("Defaults restored");
});

api.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  const updated = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (Object.prototype.hasOwnProperty.call(changes, key)) updated[key] = changes[key].newValue;
  }
  if (Object.keys(updated).length) loadOptions().catch(console.error);
});

loadOptions().catch((err) => {
  console.error(err);
  showStatus(`Load failed: ${err.message || err}`);
});
