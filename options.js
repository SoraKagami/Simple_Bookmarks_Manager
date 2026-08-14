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
const EXPECTED_STORAGE_CHANGE_TTL_MS = 5000;
const expectedLocalSettingChanges = new Map();

installThemePreferenceListener(() => currentThemeMode);

/** Show a short-lived status message after saving/resetting options. */
function showStatus(message) {
  $("status").textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $("status").textContent = ""; }, 1600);
}

/** Track settings this Options page wrote so storage events do not reload it. */
function rememberExpectedLocalSettingChanges(update) {
  const expiresAt = Date.now() + EXPECTED_STORAGE_CHANGE_TTL_MS;
  for (const [key, value] of Object.entries(update)) {
    if (Object.prototype.hasOwnProperty.call(DEFAULT_SETTINGS, key)) {
      expectedLocalSettingChanges.set(key, { value, expiresAt });
    }
  }
}

/** Stop suppressing storage events for a write that failed before reaching storage. */
function forgetExpectedLocalSettingChanges(update) {
  for (const key of Object.keys(update)) {
    expectedLocalSettingChanges.delete(key);
  }
}

/** Remove stale expected-write records left behind by no-op storage writes. */
function pruneExpectedLocalSettingChanges() {
  const now = Date.now();
  for (const [key, expected] of expectedLocalSettingChanges) {
    if (expected.expiresAt <= now) expectedLocalSettingChanges.delete(key);
  }
}

/** Return true when a storage change matches a recent write from this page. */
function consumeExpectedLocalSettingChange(key, change) {
  const expected = expectedLocalSettingChanges.get(key);
  if (!expected || expected.expiresAt <= Date.now() || !Object.is(change.newValue, expected.value)) {
    return false;
  }
  expectedLocalSettingChanges.delete(key);
  return true;
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

/** Add the packaged manifest version to the visible Options heading and document title. */
function applyOptionsPageTitle() {
  const version = api.runtime.getManifest().version;
  const title = `${t("appName").toLocaleUpperCase()} (v${version}) ${t("options").toLocaleUpperCase()}`;
  const heading = $("options-page-title");
  if (heading) heading.textContent = title;
  document.title = title;
}

/** Read Chromium's currently assigned shortcut for SBM's action command. */
async function refreshLaunchShortcut() {
  const output = $("launch-shortcut-current");
  if (!output || !api.commands?.getAll) return;
  try {
    const commands = await api.commands.getAll();
    const launchCommand = commands.find((command) => command.name === "_execute_action");
    output.textContent = launchCommand?.shortcut || t("shortcutNotAssigned");
  } catch (err) {
    console.warn("[SBM] Could not read the current launch shortcut.", err);
    output.textContent = t("shortcutNotAssigned");
  }
}

/** Reflect Bookmark text mode into its conditional speed/pause/length controls. */
function updateBookmarkTextOptionRows() {
  const mode = normalizeSettingValue("Bookmark_TextTruncation", $("Bookmark_TextTruncation").value);
  setHidden($("bookmark-auto-scroll-speed-row"), mode !== 1);
  setHidden($("bookmark-auto-scroll-pause-row"), mode !== 1);
  setHidden($("bookmark-truncate-length-row"), mode !== 2);
}

/** Refresh the numeric readouts beside the Auto Scroll sliders. */
function updateBookmarkTextOutputs() {
  const speed = normalizeSettingValue("Bookmark_AutoScrollSpeed", $("Bookmark_AutoScrollSpeed").value);
  const pause = normalizeSettingValue("Bookmark_AutoScrollPause", $("Bookmark_AutoScrollPause").value);
  $("Bookmark_AutoScrollSpeed-value").value = String(speed);
  $("Bookmark_AutoScrollSpeed-value").textContent = String(speed);
  $("Bookmark_AutoScrollPause-value").value = pause.toFixed(1);
  $("Bookmark_AutoScrollPause-value").textContent = pause.toFixed(1);
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


/** Return a readable label for a bookmark folder in the startup-folder dropdown. */
function startupFolderTitle(node) {
  return String(node?.title || t("folderFallback") || t("folder"));
}

/** Flatten bookmark folders into stable dropdown options, excluding Chromium's invisible root node. */
function collectStartupFolderOptions(root) {
  const folders = [];
  const visit = (node, path = []) => {
    if (!node || node.url) return;
    const nextPath = node.id === "0" ? path : [...path, startupFolderTitle(node)];
    if (node.id !== "0") folders.push({ id: String(node.id), label: nextPath.join(" / ") });
    for (const child of node.children || []) visit(child, nextPath);
  };
  visit(root);
  return folders;
}

/** Create one safe option element for the startup-folder dropdown. */
function makeStartupFolderOption(value, label, { disabled = false } = {}) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.disabled = disabled;
  return option;
}

/** Populate the startup-folder dropdown from Chromium's local bookmark tree. */
async function populateStartupFolderSelect(selectedId = "") {
  const select = $("StartupBookmarkFolderId");
  if (!select) return;
  const wantedId = String(selectedId || "");
  const fragment = document.createDocumentFragment();
  fragment.append(makeStartupFolderOption("", t("startupBookmarkFolderNone")));

  try {
    const [root] = await api.bookmarks.getTree();
    const folders = collectStartupFolderOptions(root);
    const folderIds = new Set(folders.map((folder) => folder.id));
    for (const folder of folders) fragment.append(makeStartupFolderOption(folder.id, folder.label));
    if (wantedId && !folderIds.has(wantedId)) {
      fragment.append(makeStartupFolderOption(wantedId, t("startupBookmarkFolderMissing"), { disabled: true }));
    }
    select.replaceChildren(fragment);
    const hasWantedOption = [...select.options].some((option) => option.value === wantedId);
    select.value = wantedId && hasWantedOption ? wantedId : "";
  } catch (err) {
    console.error(err);
    fragment.append(makeStartupFolderOption(wantedId, t("startupBookmarkFolderLoadFailed"), { disabled: true }));
    select.replaceChildren(fragment);
    select.value = wantedId;
  }
}

/** Reflect the drag-hover delay slider value beside the control. */
function updateAutoExpandDelayOutput() {
  const control = $("Folder_AutoExpandAfterWait");
  const output = $("Folder_AutoExpandAfterWait-value");
  if (!control || !output) return;
  const value = normalizeSettingValue("Folder_AutoExpandAfterWait", control.value);
  output.value = value.toFixed(1);
  output.textContent = value.toFixed(1);
}

/** Reflect persisted settings into form controls and dependent disabled states. */
function setControlState(settings) {
  populateLanguageSelect($("UserInterfaceLanguage"), settings.UserInterfaceLanguage);
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const control = $(key);
    if (!control) continue;
    const value = normalizeSettingValue(key, settings[key]);
    if (control.type === "checkbox") control.checked = value;
    else control.value = String(value);
  }
  updateAutoExpandDelayOutput();
  updateBookmarkTextOutputs();
  updateBookmarkTextOptionRows();

  const startupFolderSelect = $("StartupBookmarkFolderId");
  if (startupFolderSelect) startupFolderSelect.disabled = !$("StartAtConfiguredBookmarkFolder").checked;

  const autoExpandDelay = $("Folder_AutoExpandAfterWait");
  const autoExpandDelayRow = $("folder-auto-expand-wait-row");
  const autoExpandEnabled = $("Folder_AutoExpandOnDrag").checked;
  if (autoExpandDelay) autoExpandDelay.disabled = !autoExpandEnabled;
  if (autoExpandDelayRow) {
    autoExpandDelayRow.classList.toggle("option-row-disabled", !autoExpandEnabled);
    autoExpandDelayRow.setAttribute("aria-disabled", String(!autoExpandEnabled));
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
  applyOptionsPageTitle();
  applyFontOptionStyles();
  await populateStartupFolderSelect(settings.StartupBookmarkFolderId);
  setControlState(settings);
  await refreshLaunchShortcut();
}

/** Save one changed option and refresh controls that depend on it. */
async function saveOption(key, value) {
  const update = { [key]: normalizeSettingValue(key, value) };

  if (key === "EnableAdvancedDetailsViewing" && !value) {
    update.EnableAdvancedDetailsEditing = false;
  }

  rememberExpectedLocalSettingChanges(update);
  try {
    await api.storage.local.set(update);
  } catch (err) {
    forgetExpectedLocalSettingChanges(update);
    throw err;
  }
  const settings = { ...DEFAULT_SETTINGS, ...(await api.storage.local.get(Object.keys(DEFAULT_SETTINGS))) };
  if (key === "UserInterfaceLanguage") {
    await setI18nLanguage(settings.UserInterfaceLanguage);
    applyI18n(document);
    applyOptionsPageTitle();
    applyFontOptionStyles();
    await populateStartupFolderSelect(settings.StartupBookmarkFolderId);
  }
  setControlState(settings);
  showStatus(t("optionSaved"));
}

applyFontOptionStyles();

for (const key of Object.keys(DEFAULT_SETTINGS)) {
  $(key).addEventListener("input", () => {
    if (key === "Folder_AutoExpandAfterWait") updateAutoExpandDelayOutput();
    if (key === "Bookmark_AutoScrollSpeed" || key === "Bookmark_AutoScrollPause") updateBookmarkTextOutputs();
    if (key === "Bookmark_TextTruncation") updateBookmarkTextOptionRows();
    if (key === "UserInterfaceFontFamily" || key === "UserInterfaceFontSize" || key === "UserInterfaceLineSpacing") {
      applyUserInterfaceSettings({ ...DEFAULT_SETTINGS, ...readAllControlValues() });
    }
  });
  $(key).addEventListener("change", () => {
    if (key === "Bookmark_TextTruncation") updateBookmarkTextOptionRows();
    const value = readControlValue(key);
    const savePromise = saveOption(key, value);
    savePromise.catch((err) => {
      console.error(err);
      showStatus(t("saveFailed", { error: err.message || err }));
    });
  });
}

$("reset").addEventListener("click", async () => {
  const update = { ...DEFAULT_SETTINGS };
  rememberExpectedLocalSettingChanges(update);
  try {
    await api.storage.local.set(update);
  } catch (err) {
    forgetExpectedLocalSettingChanges(update);
    throw err;
  }
  await setI18nLanguage(DEFAULT_SETTINGS.UserInterfaceLanguage);
  applyI18n(document);
  applyOptionsPageTitle();
  await populateStartupFolderSelect(DEFAULT_SETTINGS.StartupBookmarkFolderId);
  setControlState(DEFAULT_SETTINGS);
  populateLanguageSelect($("UserInterfaceLanguage"), DEFAULT_SETTINGS.UserInterfaceLanguage);
  applyFontOptionStyles();
  showStatus(t("defaultsRestored"));
});

$("open-keyboard-shortcuts").addEventListener("click", async (e) => {
  e.preventDefault();
  try {
    await api.tabs.create({ url: "chrome://extensions/shortcuts" });
  } catch (err) {
    console.warn("[SBM] Could not open Chromium's Keyboard Shortcuts page.", err);
    showStatus(t("shortcutOpenFailed"));
  }
});

window.addEventListener("focus", () => { refreshLaunchShortcut(); });
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) refreshLaunchShortcut();
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
  pruneExpectedLocalSettingChanges();

  let hasExternalSettingChange = false;
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
    if (!consumeExpectedLocalSettingChange(key, changes[key])) hasExternalSettingChange = true;
  }

  if (hasExternalSettingChange) loadOptions().catch(console.error);
});

loadOptions().catch((err) => {
  console.error(err);
  showStatus(t("loadFailed", { error: err.message || err }));
});
