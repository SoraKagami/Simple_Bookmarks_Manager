/**
 * Options page controller.
 *
 * This file is shared by Chromium's normal options tab and the embedded
 * in-manager options iframe.  Settings are persisted in chrome.storage.local
 * and changes are observed by manager.js at runtime.
 */
import { applyI18n, populateLanguageSelect, setI18nLanguage, t } from "./i18n.js";
import { DEFAULT_SETTINGS, fontFamilyCss, normalizeSettingValue } from "./settings.js";
import { clearSessionLogRecords, getSessionLogRecords, installConsoleCapture, subscribeSessionLog } from "./session_log.js";
import { applyThemePreference, installThemePreferenceListener } from "./theme.js";

installConsoleCapture("SBM Options");

const api = chrome;

if (new URLSearchParams(location.search).has("embedded")) {
  document.body.classList.add("embedded");
}

const $ = (id) => document.getElementById(id);
let statusTimer = null;
let logRefreshTimer = null;
let currentThemeMode = DEFAULT_SETTINGS.ThemeMode;

installThemePreferenceListener(() => currentThemeMode);

/** Show a short-lived status message after saving/resetting options. */
function showStatus(message) {
  $("status").textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $("status").textContent = ""; }, 1600);
}

/** Apply normalized visual settings to the options page itself. */
function applyUserInterfaceSettings(settings) {
  currentThemeMode = normalizeSettingValue("ThemeMode", settings.ThemeMode);
  const family = normalizeSettingValue("UserInterfaceFontFamily", settings.UserInterfaceFontFamily);
  const size = normalizeSettingValue("UserInterfaceFontSize", settings.UserInterfaceFontSize);
  const spacing = normalizeSettingValue("UserInterfaceLineSpacing", settings.UserInterfaceLineSpacing);
  applyThemePreference(currentThemeMode);
  document.documentElement.style.setProperty("--sbm-ui-font-family", fontFamilyCss(family));
  document.documentElement.style.setProperty("--sbm-ui-font-size", `${size}px`);
  document.documentElement.style.setProperty("--sbm-ui-line-height", String(spacing));
}

/** Preview each font-family option using the font it represents. */
function applyFontOptionStyles() {
  const control = $("UserInterfaceFontFamily");
  for (const optionElement of control.options) {
    optionElement.style.fontFamily = fontFamilyCss(optionElement.value);
  }
}

/** Format one warning/error log record for the diagnostics textarea. */
function formatSessionLogRecord(record) {
  if (!record) return "";
  return `[${record.time}] ${record.source} ${record.level.toUpperCase()}: ${record.message}`;
}

/** Read transient manager-page log records when Options is embedded in the manager. */
function parentManagerLogRecords() {
  try {
    if (window.parent && window.parent !== window && typeof window.parent.SBM_getSessionLogRecords === "function") {
      return window.parent.SBM_getSessionLogRecords();
    }
  } catch {
    // A standalone options tab has no manager parent; ignore that case.
  }
  return [];
}

/** Refresh the visible warnings/errors log from manager and options session records. */
function refreshWarningsErrorsLog() {
  const section = $("warnings-errors-log-section");
  const output = $("warnings-errors-log");
  if (!section || !output || section.hidden) return;
  const records = [...parentManagerLogRecords(), ...getSessionLogRecords()]
    .sort((a, b) => String(a.time).localeCompare(String(b.time)));
  output.value = records.length ? records.map(formatSessionLogRecord).join("\n") : t("warningsErrorsLogEmpty");
}

/** Show or hide the diagnostics log and manage its refresh timer. */
function setWarningsErrorsLogVisible(visible) {
  const section = $("warnings-errors-log-section");
  if (!section) return;
  section.hidden = !visible;
  clearInterval(logRefreshTimer);
  logRefreshTimer = null;
  if (visible) {
    refreshWarningsErrorsLog();
    logRefreshTimer = setInterval(refreshWarningsErrorsLog, 1000);
  }
}

/** Hide or show an option row while keeping inline display state consistent. */
function setHidden(element, hidden) {
  if (!element) return;
  element.hidden = hidden;
  // Some option rows have author-level display rules; keep inline display in sync
  // so debug-only controls stay hidden even if stylesheet order changes.
  element.style.display = hidden ? "none" : "";
}

/** Toggle debug-only options and their dependent diagnostics log state. */
function setDebugOptionsVisible(visible) {
  setHidden($("debug-failed-bookmark-operation"), !visible);
  setHidden($("debug-settings-group"), !visible);

  // Keep the diagnostics log hidden unless the explicit Debug options gate is enabled.
  // The Show_ErrorsWarnings setting is still preserved so it can resume if Debug options is re-enabled.
  if (!visible) setWarningsErrorsLogVisible(false);
}

/** Read one option control using checkbox/value semantics. */
function readControlValue(key) {
  const control = $(key);
  if (control.type === "checkbox") return control.checked;
  return control.value;
}

/** Collect all option control values according to the shared settings schema. */
function readAllControlValues() {
  const values = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    values[key] = readControlValue(key);
  }
  return values;
}

/** Reflect persisted settings into form controls and dependent disabled states. */
function setControlState(settings) {
  populateLanguageSelect($("UserInterfaceLanguage"), settings.UserInterfaceLanguage);
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
  setDebugOptionsVisible(Boolean(settings.DebugOptions));
  setWarningsErrorsLogVisible(Boolean(settings.DebugOptions && settings.Show_ErrorsWarnings));
}

/** Load settings, language strings, and initial control state. */
async function loadOptions() {
  const stored = await api.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  await setI18nLanguage(settings.UserInterfaceLanguage);
  applyI18n(document);
  applyFontOptionStyles();
  setControlState(settings);
}

/** Save one changed option and refresh controls that depend on it. */
async function saveOption(key, value) {
  const update = { [key]: normalizeSettingValue(key, value) };

  if (key === "EnableAdvancedDetailsViewing" && !value) {
    update.EnableAdvancedDetailsEditing = false;
  }

  await api.storage.local.set(update);
  const settings = { ...DEFAULT_SETTINGS, ...(await api.storage.local.get(Object.keys(DEFAULT_SETTINGS))) };
  if (key === "UserInterfaceLanguage") {
    await setI18nLanguage(settings.UserInterfaceLanguage);
    applyI18n(document);
    applyFontOptionStyles();
  }
  setControlState(settings);
  showStatus(t("optionSaved"));
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
      showStatus(t("saveFailed", { error: err.message || err }));
    });
  });
}

$("reset").addEventListener("click", async () => {
  await api.storage.local.set({ ...DEFAULT_SETTINGS });
  setControlState(DEFAULT_SETTINGS);
  await setI18nLanguage(DEFAULT_SETTINGS.UserInterfaceLanguage);
  applyI18n(document);
  populateLanguageSelect($("UserInterfaceLanguage"), DEFAULT_SETTINGS.UserInterfaceLanguage);
  applyFontOptionStyles();
  showStatus(t("defaultsRestored"));
});

$("clear-warnings-errors-log").addEventListener("click", () => {
  clearSessionLogRecords();
  try {
    if (window.parent && window.parent !== window && typeof window.parent.SBM_clearSessionLogRecords === "function") {
      window.parent.SBM_clearSessionLogRecords();
    }
  } catch {
    // Standalone options tabs do not have a manager parent.
  }
  refreshWarningsErrorsLog();
});

$("debug-failed-bookmark-operation").addEventListener("click", async () => {
  try {
    await api.bookmarks.create({ parentId: "__sbm_debug_invalid_parent__", title: "SBM debug failure", url: "https://example.invalid/" });
    showStatus(t("debugFailureUnexpectedSuccess"));
  } catch (err) {
    const errorText = err?.message || String(err);
    console.error("[SBM] Debug bookmark failure test triggered as expected.", err);
    alert(t("bookmarkMutationFailed", { action: t("debugFailedBookmarkOperationAction"), error: errorText }));
    refreshWarningsErrorsLog();
  }
});

subscribeSessionLog(refreshWarningsErrorsLog);

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
  showStatus(t("loadFailed", { error: err.message || err }));
});
