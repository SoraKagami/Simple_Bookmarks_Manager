/**
 * Simple Bookmarks Manager main page controller.
 *
 * This file owns the bookmark tree state, pane rendering, details editing,
 * custom context menus, keyboard navigation, drag/drop, and bookmark mutation
 * calls.  The code intentionally keeps DOM text assignment on textContent and
 * uses a small i18n helper for all user-facing strings.
 */
import { applyI18n, setI18nLanguage, t } from "./i18n.js";
import { DEFAULT_SETTINGS, MID_FC_COLUMN_MIN_WIDTHS, fontFamilyCss, normalizeSettingValue } from "./settings.js";
import { addSessionLogRecord, clearSessionLogRecords, getSessionLogRecords, installConsoleCapture } from "./session_log.js";
import { applyThemePreference, installThemePreferenceListener } from "./theme.js";

installConsoleCapture("SBM Manager");
globalThis.SBM_getSessionLogRecords = getSessionLogRecords;
globalThis.SBM_clearSessionLogRecords = clearSessionLogRecords;

const api = chrome;

// Chrome extension APIs are exposed through this alias so calls are easier to
// scan and can be wrapped by small helpers where useful.

// Central UI state.  This is the single source of truth for the active folder,
// active pane, history stacks, drag/drop state, clipboard state, and current
// multi-selection.  Bookmark data itself is always reloaded from Chrome after
// mutations so the UI does not depend on stale local copies.
const state = {
  tree: null,
  folderId: null,
  selectedId: null,
  treeSelectedId: null,
  activePane: "tree",
  search: "",
  sort: "index",
  sortDirection: "asc",
  back: [],
  forward: [],
  expandedFolders: new Set(),
  detailsVisible: true,
  detailsOriginal: null,
  drag: null,
  dropIndicator: null,
  clipboard: null,
  contextMenu: null,
  multiSelect: { pane: null, ids: new Set(), anchorId: null, focusId: null },
  suppressBookmarkEvents: false,
  unsavedPromptActive: false,
  resetMiddleScrollOnNextRender: false,
  faviconRefreshToken: String(Date.now())
};

const $ = (id) => document.getElementById(id);
const nodes = new Map();
const SEPARATOR_TITLE = "———";
const SEPARATOR_URL = "about:blank";
let left_Lib_Width = DEFAULT_SETTINGS.left_Lib_Width;
let right_Details_Width = DEFAULT_SETTINGS.right_Details_Width;
let bottom_Details_Height = DEFAULT_SETTINGS.bottom_Details_Height;
let UserInterfaceLanguage = DEFAULT_SETTINGS.UserInterfaceLanguage;
let ThemeMode = DEFAULT_SETTINGS.ThemeMode;
let DetailsPanePosition = DEFAULT_SETTINGS.DetailsPanePosition;
let UserInterfaceFontFamily = DEFAULT_SETTINGS.UserInterfaceFontFamily;
let UserInterfaceFontSize = DEFAULT_SETTINGS.UserInterfaceFontSize;
let UserInterfaceLineSpacing = DEFAULT_SETTINGS.UserInterfaceLineSpacing;
let EnableAdvancedDetailsViewing = DEFAULT_SETTINGS.EnableAdvancedDetailsViewing;
let EnableAdvancedDetailsEditing = DEFAULT_SETTINGS.EnableAdvancedDetailsEditing;
let SortByNameNatural = DEFAULT_SETTINGS.SortByNameNatural;
let SortShowWarning = DEFAULT_SETTINGS.SortShowWarning;
let KeyboardDeleteAllow = DEFAULT_SETTINGS.KeyboardDeleteAllow;
let DeleteShowWarning = DEFAULT_SETTINGS.DeleteShowWarning;
let SearchLimitToFolderAndSub = DEFAULT_SETTINGS.SearchLimitToFolderAndSub;
let MultipleInstancesAllowed = DEFAULT_SETTINGS.MultipleInstancesAllowed;
let StartAtConfiguredBookmarkFolder = DEFAULT_SETTINGS.StartAtConfiguredBookmarkFolder;
let StartupBookmarkFolderId = DEFAULT_SETTINGS.StartupBookmarkFolderId;
let BlockJavascriptBookmarkOpens = DEFAULT_SETTINGS.BlockJavascriptBookmarkOpens;
let BlockDataBookmarkOpens = DEFAULT_SETTINGS.BlockDataBookmarkOpens;
let BlockBlobBookmarkOpens = DEFAULT_SETTINGS.BlockBlobBookmarkOpens;
let Optimisation_TempBookmarkTreeMaps = DEFAULT_SETTINGS.Optimisation_TempBookmarkTreeMaps;
let Optimisation_DOMrendering = DEFAULT_SETTINGS.Optimisation_DOMrendering;
let Show_ErrorsWarnings = DEFAULT_SETTINGS.Show_ErrorsWarnings;
let DebugOptions = DEFAULT_SETTINGS.DebugOptions;
let ShowHelpOnLaunch = DEFAULT_SETTINGS.ShowHelpOnLaunch;
let cachedChangelogMarkdown = null;
let mid_FC_Width_Name = DEFAULT_SETTINGS.mid_FC_Width_Name;
let mid_FC_Width_URL = DEFAULT_SETTINGS.mid_FC_Width_URL;
let mid_FC_Width_DateAdded = DEFAULT_SETTINGS.mid_FC_Width_DateAdded;
let mid_FC_Width_ID = DEFAULT_SETTINGS.mid_FC_Width_ID;
let mid_FC_Width_Order = DEFAULT_SETTINGS.mid_FC_Width_Order;
let mid_FC_Show_DateAdded = DEFAULT_SETTINGS.mid_FC_Show_DateAdded;
let mid_FC_Show_ID = DEFAULT_SETTINGS.mid_FC_Show_ID;
let mid_FC_Show_Order = DEFAULT_SETTINGS.mid_FC_Show_Order;

installThemePreferenceListener(() => ThemeMode);

/** Record this manager tab so the toolbar button can focus it when single-instance mode is enabled. */
async function registerManagerInstance() {
  try {
    const tab = await api.tabs.getCurrent();
    if (tab?.id == null) return;
    const { managerTabIds } = await api.storage.session.get("managerTabIds");
    const ids = Array.isArray(managerTabIds) ? managerTabIds.filter((id) => Number.isInteger(id) && id !== tab.id) : [];
    ids.push(tab.id);
    await api.storage.session.set({ managerTabId: tab.id, managerTabIds: ids });
  } catch (err) {
    // getCurrent() is available to extension pages, but failure is non-fatal;
    // the toolbar button can still open a fresh manager tab.
    console.warn("[SBM] Could not register manager tab for single-instance handling.", err);
  }
}

/** Release the session manager-tab marker only when it still points at this tab. */
async function clearManagerInstanceIfCurrent() {
  try {
    const tab = await api.tabs.getCurrent();
    const { managerTabId, managerTabIds } = await api.storage.session.get(["managerTabId", "managerTabIds"]);
    if (tab?.id == null) return;
    const ids = Array.isArray(managerTabIds) ? managerTabIds.filter((id) => id !== tab.id) : [];
    await api.storage.session.set({ managerTabIds: ids });
    if (managerTabId === tab.id) await api.storage.session.remove("managerTabId");
  } catch {
    // Best-effort cleanup only.
  }
}

// ---------------------------------------------------------------------------
// Settings and localization
// ---------------------------------------------------------------------------

/** Apply normalized visual settings that are represented as CSS variables or attributes. */
function applyUserInterfaceSettings() {
  applyThemePreference(ThemeMode);
  document.documentElement.style.setProperty("--sbm-ui-font-family", fontFamilyCss(UserInterfaceFontFamily));
  document.documentElement.style.setProperty("--sbm-ui-font-size", `${UserInterfaceFontSize}px`);
  document.documentElement.style.setProperty("--sbm-ui-line-height", String(UserInterfaceLineSpacing));
  document.documentElement.style.setProperty("--left-lib-width", `${left_Lib_Width}px`);
  document.documentElement.style.setProperty("--right-details-width", `${right_Details_Width}px`);
  document.documentElement.style.setProperty("--bottom-details-height", `${bottom_Details_Height}px`);
  applyFolderContentsColumnSettings();
}

/**
 * Apply one or more validated settings to runtime globals and optionally
 * refresh affected UI areas.
 */
function applySettings(settings, { render = false } = {}) {
  const keys = Object.keys(DEFAULT_SETTINGS);
  for (const key of keys) {
    if (!(key in settings)) continue;
    const value = normalizeSettingValue(key, settings[key]);
    if (key === "left_Lib_Width") left_Lib_Width = value;
    else if (key === "right_Details_Width") right_Details_Width = value;
    else if (key === "bottom_Details_Height") bottom_Details_Height = value;
    else if (key === "UserInterfaceLanguage") UserInterfaceLanguage = value;
    else if (key === "ThemeMode") ThemeMode = value;
    else if (key === "DetailsPanePosition") DetailsPanePosition = value;
    else if (key === "UserInterfaceFontFamily") UserInterfaceFontFamily = value;
    else if (key === "UserInterfaceFontSize") UserInterfaceFontSize = value;
    else if (key === "UserInterfaceLineSpacing") UserInterfaceLineSpacing = value;
    else if (key === "EnableAdvancedDetailsViewing") EnableAdvancedDetailsViewing = value;
    else if (key === "EnableAdvancedDetailsEditing") EnableAdvancedDetailsEditing = value;
    else if (key === "SortByNameNatural") SortByNameNatural = value;
    else if (key === "SortShowWarning") SortShowWarning = value;
    else if (key === "KeyboardDeleteAllow") KeyboardDeleteAllow = value;
    else if (key === "DeleteShowWarning") DeleteShowWarning = value;
    else if (key === "SearchLimitToFolderAndSub") SearchLimitToFolderAndSub = value;
    else if (key === "MultipleInstancesAllowed") MultipleInstancesAllowed = value;
    else if (key === "StartAtConfiguredBookmarkFolder") StartAtConfiguredBookmarkFolder = value;
    else if (key === "StartupBookmarkFolderId") StartupBookmarkFolderId = value;
    else if (key === "BlockJavascriptBookmarkOpens") BlockJavascriptBookmarkOpens = value;
    else if (key === "BlockDataBookmarkOpens") BlockDataBookmarkOpens = value;
    else if (key === "BlockBlobBookmarkOpens") BlockBlobBookmarkOpens = value;
    else if (key === "Optimisation_TempBookmarkTreeMaps") Optimisation_TempBookmarkTreeMaps = value;
    else if (key === "Optimisation_DOMrendering") Optimisation_DOMrendering = value;
    else if (key === "Show_ErrorsWarnings") Show_ErrorsWarnings = value;
    else if (key === "DebugOptions") DebugOptions = value;
    else if (key === "ShowHelpOnLaunch") ShowHelpOnLaunch = value;
    else if (key === "mid_FC_Width_Name") mid_FC_Width_Name = value;
    else if (key === "mid_FC_Width_URL") mid_FC_Width_URL = value;
    else if (key === "mid_FC_Width_DateAdded") mid_FC_Width_DateAdded = value;
    else if (key === "mid_FC_Width_ID") mid_FC_Width_ID = value;
    else if (key === "mid_FC_Width_Order") mid_FC_Width_Order = value;
    else if (key === "mid_FC_Show_DateAdded") mid_FC_Show_DateAdded = value;
    else if (key === "mid_FC_Show_ID") mid_FC_Show_ID = value;
    else if (key === "mid_FC_Show_Order") mid_FC_Show_Order = value;
  }

  applyUserInterfaceSettings();

  if (!EnableAdvancedDetailsViewing) EnableAdvancedDetailsEditing = false;
  const searchLimit = $("search-limit");
  if (searchLimit) searchLimit.checked = SearchLimitToFolderAndSub;

  if (render && state.tree) {
    renderList();
    renderDetails();
  }
}


/** Reflect the configured Details pane position into layout classes and resizer metadata. */
function applyDetailsPanePosition() {
  const layout = $("layout");
  if (!layout) return;
  const isBottom = DetailsPanePosition === "bottom";
  layout.classList.toggle("details-bottom", isBottom);
  const resizer = $("right-pane-resizer");
  if (resizer) resizer.setAttribute("aria-orientation", isBottom ? "horizontal" : "vertical");
}


/** Start a pane resize drag and persist the final width/height setting. */
function beginPaneResize(e, pane) {
  const isLeft = pane === "left";
  const isBottomDetails = pane === "right" && DetailsPanePosition === "bottom";
  const settingKey = isLeft ? "left_Lib_Width" : isBottomDetails ? "bottom_Details_Height" : "right_Details_Width";
  const minSize = isLeft ? 180 : isBottomDetails ? 160 : 220;
  const maxSize = isLeft ? 800 : isBottomDetails ? 800 : 900;
  const startX = e.clientX;
  const startY = e.clientY;
  const startSize = isLeft ? left_Lib_Width : isBottomDetails ? bottom_Details_Height : right_Details_Width;
  let latestSize = startSize;

  e.preventDefault();
  e.stopPropagation();
  document.body.classList.add("pane-resizing", isBottomDetails ? "pane-resizing-bottom" : "pane-resizing-side");

  const onMove = (moveEvent) => {
    const deltaX = moveEvent.clientX - startX;
    const deltaY = moveEvent.clientY - startY;
    const rawSize = isBottomDetails ? startSize - deltaY : isLeft ? startSize + deltaX : startSize - deltaX;
    const nextSize = normalizeSettingValue(settingKey, Math.min(maxSize, Math.max(minSize, rawSize)));
    if (nextSize === latestSize) return;
    latestSize = nextSize;
    applySettings({ [settingKey]: latestSize }, { render: false });
  };

  const onUp = async () => {
    document.body.classList.remove("pane-resizing", "pane-resizing-bottom", "pane-resizing-side");
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("mouseup", onUp, true);
    try {
      await saveSetting(settingKey, latestSize);
    } catch (err) {
      console.error(err);
      alert(t("actionFailed", { error: err.message || err }));
    }
  };

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
  return true;
}

/** Resize a pane dimension by a keyboard-friendly delta while respecting configured bounds. */
function nudgePaneWidth(pane, delta) {
  const isLeft = pane === "left";
  const isBottomDetails = pane === "right" && DetailsPanePosition === "bottom";
  const key = isLeft ? "left_Lib_Width" : isBottomDetails ? "bottom_Details_Height" : "right_Details_Width";
  const current = isLeft ? left_Lib_Width : isBottomDetails ? bottom_Details_Height : right_Details_Width;
  saveSetting(key, current + delta).catch((err) => {
    console.error(err);
    alert(t("actionFailed", { error: err.message || err }));
  });
}

/** Return the localized display label for a Folder Contents column sort key. */
function localizedColumnLabel(key) {
  if (key === "title") return t("sortName");
  if (key === "url") return t("sortUrl");
  if (key === "dateAdded") return t("sortDateAddedHeader");
  if (key === "id") return t("sortId");
  if (key === "index") return t("sortOrder");
  return key;
}

const MID_FC_COLUMNS = Object.freeze([
  { id: "Name", sortKey: "title", settingKey: "mid_FC_Width_Name", showKey: null },
  { id: "URL", sortKey: "url", settingKey: "mid_FC_Width_URL", showKey: null },
  { id: "DateAdded", sortKey: "dateAdded", settingKey: "mid_FC_Width_DateAdded", showKey: "mid_FC_Show_DateAdded" },
  { id: "ID", sortKey: "id", settingKey: "mid_FC_Width_ID", showKey: "mid_FC_Show_ID" },
  { id: "Order", sortKey: "index", settingKey: "mid_FC_Width_Order", showKey: "mid_FC_Show_Order" }
]);

/** Read and normalize a Folder Contents column setting from the current settings state. */
function midFcSettingValue(key) {
  if (key === "mid_FC_Width_Name") return mid_FC_Width_Name;
  if (key === "mid_FC_Width_URL") return mid_FC_Width_URL;
  if (key === "mid_FC_Width_DateAdded") return mid_FC_Width_DateAdded;
  if (key === "mid_FC_Width_ID") return mid_FC_Width_ID;
  if (key === "mid_FC_Width_Order") return mid_FC_Width_Order;
  if (key === "mid_FC_Show_DateAdded") return mid_FC_Show_DateAdded;
  if (key === "mid_FC_Show_ID") return mid_FC_Show_ID;
  if (key === "mid_FC_Show_Order") return mid_FC_Show_Order;
  return DEFAULT_SETTINGS[key];
}

/** Return Folder Contents columns that should currently be rendered. */
function visibleMidFcColumns() {
  return MID_FC_COLUMNS.filter((column) => !column.showKey || Boolean(midFcSettingValue(column.showKey)));
}

/** Build the CSS grid template used by the Folder Contents header and rows. */
function midFcGridTemplate() {
  return visibleMidFcColumns()
    .map((column) => `${Math.max(MID_FC_COLUMN_MIN_WIDTHS[column.id] || 48, Number(midFcSettingValue(column.settingKey)) || 0)}px`)
    .join(" ") || "1fr";
}

/** Synchronize Folder Contents column visibility and widths with CSS custom properties. */
function applyFolderContentsColumnSettings() {
  const columns = visibleMidFcColumns();
  const minWidth = columns.reduce((total, column) => {
    const width = Math.max(MID_FC_COLUMN_MIN_WIDTHS[column.id] || 48, Number(midFcSettingValue(column.settingKey)) || 0);
    return total + width;
  }, 0) + Math.max(0, columns.length - 1) * 10 + 24;
  document.documentElement.style.setProperty("--mid-fc-grid-template", midFcGridTemplate());
  document.documentElement.style.setProperty("--bookmark-table-min-width", `${Math.max(360, minWidth)}px`);
}

/** Apply translated text, labels, and tooltips to static manager UI controls. */
function localizeStaticUi() {
  applyI18n(document);
  document.title = t("appName");
  for (const button of document.querySelectorAll(".columns [data-sort-key]")) {
    button.dataset.label = localizedColumnLabel(button.dataset.sortKey);
  }
  setSortSelectTooltips();
  if (state.tree) renderColumnHeaders();
}

/** Load persisted settings before initial bookmark rendering. */
async function loadSettings() {
  const stored = await api.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  applySettings(settings);
  await setI18nLanguage(UserInterfaceLanguage);
  localizeStaticUi();
}

/** Persist a single setting and update any already-rendered UI that depends on it. */
async function saveSetting(key, value) {
  const normalized = normalizeSettingValue(key, value);
  await api.storage.local.set({ [key]: normalized });
  applySettings({ [key]: normalized }, { render: true });
  if (key === "UserInterfaceLanguage") {
    await setI18nLanguage(UserInterfaceLanguage);
    localizeStaticUi();
    render();
  }
}

// ---------------------------------------------------------------------------
// Bookmark tree indexing and model helpers
// ---------------------------------------------------------------------------

/** Promise-friendly wrapper around chrome.bookmarks methods. */
async function bookmarks(method, ...args) {
  return await api.bookmarks[method](...args);
}


/**
 * Return a fresh Chrome bookmark node, or null if it no longer exists.
 *
 * Race note: Chrome bookmark operations are asynchronous and SBM cannot lock
 * the browser's bookmark store.  The built-in manager, another extension, sync,
 * or another SBM tab can change an item between UI validation and mutation.
 * Callers use this for cheap pre-flight checks before sensitive mutations.
 */
async function getFreshBookmarkNode(id) {
  if (typeof id !== "string" || !id) return null;
  try {
    const result = await bookmarks("get", id);
    return result?.[0] || null;
  } catch (err) {
    console.warn("[SBM] Bookmark node changed or disappeared before an operation completed.", { id, error: err });
    return null;
  }
}

/** Identify bookmark operations where failures should be surfaced directly to the user. */
function isUserCriticalBookmarkMutation(method) {
  return method === "create" || method === "update" || method === "remove" || method === "removeTree";
}

/** Report bookmark mutation failures through the debug log and optional user alert. */
function notifyBookmarkMutationFailure(action, method, err) {
  const errorText = err?.message || String(err || t("notAvailable"));
  console.error(`[SBM] ${action} failed.`, { method, error: err });
  if (isUserCriticalBookmarkMutation(method)) {
    alert(t("bookmarkMutationFailed", { action, error: errorText }));
  }
}

/**
 * Run a bookmark mutation that may legitimately fail if external bookmark data
 * changed after SBM rendered the row/menu.  Returning null lets callers stop
 * safely, refresh from Chrome, and avoid continuing with stale assumptions.
 */
async function tryBookmarkMutation(action, method, ...args) {
  try {
    return await bookmarks(method, ...args);
  } catch (err) {
    notifyBookmarkMutationFailure(action, method, err);
    return null;
  }
}

/**
 * Convert the Chrome bookmark tree into lightweight indexed nodes with parent
 * pointers.  The nodes map is rebuilt whenever loadTree() refreshes data.
 */
function indexTree(root, parent = null, out = [], computedIndex = null) {
  const node = { ...root, parentNode: parent };
  if (Number.isInteger(computedIndex)) node.index = computedIndex;
  nodes.set(node.id, node);
  out.push(node);
  for (const [index, child] of (root.children || []).entries()) {
    indexTree(child, node, out, index);
  }
  return out;
}


/**
 * Build short-lived lookup maps from the currently loaded bookmark tree.
 *
 * These maps are intentionally temporary: they are rebuilt from the latest
 * Chrome bookmark data already loaded by loadTree() and are discarded after the
 * render/operation that asked for them.  They improve readability/performance
 * in tree-walk-heavy UI paths without introducing a long-lived stale cache.
 */
function buildTempBookmarkTreeMaps(root = state.tree) {
  const map = {
    nodesById: new Map(),
    parentById: new Map(),
    childrenById: new Map(),
    rootFolders: []
  };

  const visit = (node, parent = null) => {
    if (!node) return;
    map.nodesById.set(node.id, node);
    map.parentById.set(node.id, parent);
    const children = Array.isArray(node.children) ? node.children : [];
    map.childrenById.set(node.id, children);
    if (parent && parent.id === "0" && isFolder(node)) map.rootFolders.push(node);
    for (const child of children) visit(child, node);
  };

  visit(root, null);
  return map;
}

/** Return cached tree maps when enabled, otherwise rebuild maps for the current snapshot. */
function tempBookmarkTreeMaps() {
  return Optimisation_TempBookmarkTreeMaps && state.tree ? buildTempBookmarkTreeMaps(state.tree) : null;
}

/** Flatten a folder subtree using precomputed child lookup maps. */
function flattenBookmarksWithMaps(folder, maps) {
  if (!folder || !maps) return flattenBookmarks(folder);
  const out = [];
  const visitChildren = (parent) => {
    for (const child of maps.childrenById.get(parent.id) || []) {
      out.push(child);
      if (isFolder(child)) visitChildren(child);
    }
  };
  visitChildren(folder);
  return out;
}

/** True when a bookmark node is a folder rather than a URL bookmark. */
function isFolder(node) {
  return !!node && !node.url;
}

/** Detect the extension's Chromium-compatible separator convention. */
function isSeparator(node) {
  return !!node && !isFolder(node) && (node.title || "") === SEPARATOR_TITLE && (node.url || "") === SEPARATOR_URL;
}

/** Remove C0/C1 control characters that do not belong in bookmark text fields. */
function stripControlChars(value) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F-\u009F]/gu, " ");
}

/** Remove unsafe control characters from a title and fall back when it becomes empty. */
function sanitizeBookmarkTitle(value, fallback = "") {
  const cleaned = stripControlChars(value).trim();
  return cleaned || fallback;
}

/** Trim bookmark URL input and remove control characters before validation or saving. */
function sanitizeBookmarkUrl(value) {
  return stripControlChars(value).trim();
}

/**
 * Extension-initiated tab/window opens are intentionally conservative only for
 * high-risk active/document-producing schemes.  Other schemes are passed through
 * after URL parsing so Chromium-family browser pages (chrome://, brave://,
 * edge://, opera://), about: pages, mailto:, file:, and other user-bookmarked
 * schemes remain usable without maintaining a browser-specific allowlist.
 */
function bookmarkOpenProtocolBlocked(protocol) {
  if (protocol === "javascript:") return BlockJavascriptBookmarkOpens;
  if (protocol === "data:") return BlockDataBookmarkOpens;
  if (protocol === "blob:") return BlockBlobBookmarkOpens;
  return false;
}

/** Validate a user-controlled bookmark URL before passing it to Chromium open APIs. */
function safeBookmarkOpenUrl(rawValue) {
  const sanitized = sanitizeBookmarkUrl(rawValue);
  if (!sanitized) return null;
  let parsed;
  try {
    parsed = new URL(sanitized);
  } catch {
    return null;
  }
  if (bookmarkOpenProtocolBlocked(parsed.protocol.toLowerCase())) return null;
  return parsed.href;
}

/** Filter a list of bookmark URLs to the subset allowed by the current protections. */
function safeBookmarkOpenUrls(urls) {
  const safeUrls = [];
  for (const url of urls || []) {
    const safeUrl = safeBookmarkOpenUrl(url);
    if (safeUrl) safeUrls.push(safeUrl);
    else console.warn("[SBM] Blocked bookmark URL from extension-initiated open.", { url });
  }
  return safeUrls;
}

/** Build a user-facing explanation for bookmark URLs blocked by protection settings. */
function bookmarkOpenBlockedMessage() {
  return t("urlOpenBlockedByProtection");
}

/**
 * Validate a bookmark URL using local parsing only.  This never performs a
 * network request; it only catches values that Chromium is likely to reject or
 * that can cause bookmark nodes to lose their URL shape after mutation.
 */
function bookmarkUrlProblem(rawValue) {
  const raw = String(rawValue ?? "");
  const sanitized = sanitizeBookmarkUrl(raw);
  if (!sanitized) return t("urlWarningEmpty");
  if (sanitized !== raw.trim()) return t("urlWarningControlCharacters");
  if (/\s/u.test(sanitized)) return t("urlWarningWhitespace");

  let parsed;
  try {
    parsed = new URL(sanitized);
  } catch {
    return t("urlWarningInvalidBlocked");
  }

  const protocol = parsed.protocol.toLowerCase();
  if ((protocol === "http:" || protocol === "https:" || protocol === "ftp:") && !parsed.hostname) {
    return t("urlWarningInvalidBlocked");
  }

  // Chromium accepts about:blank as a bookmark URL; malformed about: variants
  // are blocked because they can behave inconsistently in bookmark mutations.
  if (protocol === "about:" && sanitized.toLowerCase() !== SEPARATOR_URL) {
    return t("urlWarningInvalidBlocked");
  }

  return "";
}

/** Return the blocking reason for risky URL protocols controlled by advanced settings. */
function bookmarkUrlBlockingProblem(rawValue) {
  const sanitized = sanitizeBookmarkUrl(rawValue);
  if (!sanitized) return t("urlWarningEmpty");

  let parsed;
  try {
    parsed = new URL(sanitized);
  } catch {
    return t("urlWarningInvalidBlocked");
  }

  const protocol = parsed.protocol.toLowerCase();
  if ((protocol === "http:" || protocol === "https:" || protocol === "ftp:") && !parsed.hostname) {
    return t("urlWarningInvalidBlocked");
  }
  if (protocol === "about:" && sanitized.toLowerCase() !== SEPARATOR_URL) {
    return t("urlWarningInvalidBlocked");
  }

  return "";
}

/** Return whether a URL is acceptable for saving in Chromium bookmarks. */
function isValidBookmarkUrl(rawValue) {
  return !bookmarkUrlBlockingProblem(rawValue);
}

/** Show the localized bookmark URL validation message to the user. */
function showUrlValidationError(rawValue) {
  const warning = $("url-warning");
  const message = bookmarkUrlBlockingProblem(rawValue) || bookmarkUrlProblem(rawValue);
  if (warning && message) {
    warning.textContent = message;
    warning.hidden = false;
  }
  return message;
}

/** Return the localized message for a bookmark URL validation failure. */
function urlValidationMessage(rawValue) {
  return bookmarkUrlProblem(rawValue);
}

/** Refresh inline URL validation and URL-open protection warnings in the editor dialog. */
function updateUrlWarning() {
  const warning = $("url-warning");
  const input = $("url");
  if (!warning || !input) return;
  if (input.hidden || input.disabled) {
    warning.textContent = "";
    warning.hidden = true;
    return;
  }
  const message = urlValidationMessage(input.value);
  warning.textContent = message;
  warning.hidden = !message;
}


/**
 * Show an in-page bookmark editor for create/edit prompt flows.
 *
 * Native prompt() closes before validation feedback can be displayed.  This
 * lightweight modal keeps the user's current values visible, shows local-only
 * URL validation errors inline, and only resolves with bookmark data when the
 * URL is safe to send to chrome.bookmarks.
 */
function showBookmarkEditorDialog({ heading, title = "", url = "https://", submitLabel = t("save"), initialFocus = "url" } = {}) {
  return new Promise((resolve) => {
    hideContextMenu();

    const backdrop = document.createElement("div");
    backdrop.className = "unsaved-modal-backdrop";
    backdrop.setAttribute("role", "presentation");

    const modal = document.createElement("section");
    modal.className = "unsaved-modal bookmark-editor-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "bookmark-editor-title");

    const headingEl = document.createElement("h3");
    headingEl.id = "bookmark-editor-title";
    headingEl.textContent = heading || t("newBookmark");

    const form = document.createElement("form");
    form.className = "bookmark-editor-form";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = t("bookmarkNamePrompt");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = title || "";
    nameInput.autocomplete = "off";
    nameLabel.append(nameInput);

    const urlLabel = document.createElement("label");
    urlLabel.textContent = t("bookmarkUrlPrompt");
    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.value = url || "https://";
    urlInput.autocomplete = "off";
    urlLabel.append(urlInput);

    const warning = document.createElement("div");
    warning.className = "url-warning bookmark-editor-warning";
    warning.setAttribute("role", "alert");
    warning.hidden = true;

    const actions = document.createElement("div");
    actions.className = "unsaved-modal-actions";

    const finish = (value) => {
      backdrop.remove();
      resolve(value);
    };

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = t("cancel");
    cancel.onclick = () => finish(null);

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = submitLabel;

    const updateWarning = () => {
      const message = bookmarkUrlProblem(urlInput.value);
      warning.textContent = message;
      warning.hidden = !message;
    };

    urlInput.addEventListener("input", updateWarning);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const cleanUrl = sanitizeBookmarkUrl(urlInput.value);
      const blockingMessage = bookmarkUrlBlockingProblem(cleanUrl);
      if (blockingMessage) {
        warning.textContent = blockingMessage;
        warning.hidden = false;
        urlInput.focus();
        urlInput.select();
        return;
      }
      finish({
        title: sanitizeBookmarkTitle(nameInput.value, cleanUrl),
        url: cleanUrl,
      });
    });

    // Do not close the bookmark editor on backdrop clicks. The user may have
    // partially entered data; closing on an accidental click can lose work.
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) e.preventDefault();
    });
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      }
    });

    actions.append(submit, cancel);
    form.append(nameLabel, urlLabel, warning, actions);
    modal.append(headingEl, form);
    backdrop.append(modal);
    document.body.append(backdrop);
    updateWarning();
    const focusInput = initialFocus === "title" ? nameInput : urlInput;
    focusInput.focus();
    focusInput.select();
  });
}


/**
 * Show an in-page folder rename editor using the same modal behavior as the
 * bookmark editor.  Backdrop clicks are ignored so partially typed names are
 * not lost accidentally; the dialog resolves only through Save, Cancel, or Esc.
 */
function showFolderRenameDialog({ heading = t("renameFolder"), title = "", submitLabel = t("save") } = {}) {
  return new Promise((resolve) => {
    hideContextMenu();

    const backdrop = document.createElement("div");
    backdrop.className = "unsaved-modal-backdrop";
    backdrop.setAttribute("role", "presentation");

    const modal = document.createElement("section");
    modal.className = "unsaved-modal bookmark-editor-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "folder-rename-title");

    const headingEl = document.createElement("h3");
    headingEl.id = "folder-rename-title";
    headingEl.textContent = heading;

    const form = document.createElement("form");
    form.className = "bookmark-editor-form";

    const nameLabel = document.createElement("label");
    nameLabel.textContent = t("folderNamePrompt");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = title || "";
    nameInput.autocomplete = "off";
    nameLabel.append(nameInput);

    const actions = document.createElement("div");
    actions.className = "unsaved-modal-actions";

    const finish = (value) => {
      backdrop.remove();
      resolve(value);
    };

    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = submitLabel;

    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = t("cancel");
    cancel.onclick = () => finish(null);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      finish({ title: sanitizeBookmarkTitle(nameInput.value, title || t("newFolderDefaultName")) });
    });
    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) e.preventDefault();
    });
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      }
    });

    actions.append(submit, cancel);
    form.append(nameLabel, actions);
    modal.append(headingEl, form);
    backdrop.append(modal);
    document.body.append(backdrop);
    nameInput.focus();
    nameInput.select();
  });
}

/** Return whether an ID points to a known bookmark-tree node. */
function validNodeId(id) {
  return typeof id === "string" && nodes.has(id);
}

/** Return whether an ID points to a known node that Chromium allows SBM to change. */
function validMutableNodeId(id) {
  return validNodeId(id) && isMutable(nodes.get(id));
}

/** Return whether an ID points to a known folder node. */
function validFolderId(id) {
  return validNodeId(id) && canContainChildren(nodes.get(id));
}

/** Strip unsafe move parameters and keep only valid Chromium bookmark move details. */
function safeMoveDetails(parentId, index = null) {
  if (!validFolderId(parentId)) return null;
  const details = { parentId };
  const safeIndex = normalizeMoveIndex(parentId, index);
  if (Number.isInteger(safeIndex)) details.index = safeIndex;
  return details;
}

/** Create a minimal sanitized bookmark snapshot for cut/copy/paste operations. */
function sanitizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const clean = { title: sanitizeBookmarkTitle(snapshot.title) };
  if ("url" in snapshot) clean.url = sanitizeBookmarkUrl(snapshot.url);
  if (Array.isArray(snapshot.children)) {
    clean.children = snapshot.children.map(sanitizeSnapshot).filter(Boolean);
    delete clean.url;
  }
  if (!clean.children && !clean.url) clean.url = SEPARATOR_URL;
  return clean;
}

/** Resolve the packaged extension icon URL for a given size. */
function extensionIconPath(name) {
  return api.runtime.getURL(`icons/${name}`);
}

/** Refresh the favicon cache-busting token after bookmark URL changes. */
function refreshFaviconToken() {
  // Chromium's extension favicon endpoint can keep returning the same cached
  // image URL while the browser learns new favicons in the background.  This
  // tiny token is updated only when switching folders, so visible bookmark
  // icons get a fresh request without building an in-memory favicon cache.
  state.faviconRefreshToken = String(Date.now());
}

/** Build a chrome-extension favicon endpoint URL without fetching remote assets. */
function bookmarkFaviconUrl(url, size = 16) {
  if (!url) return "";
  const favicon = new URL(api.runtime.getURL("/_favicon/"));
  favicon.searchParams.set("pageUrl", url);
  favicon.searchParams.set("size", String(size));
  favicon.searchParams.set("refresh", state.faviconRefreshToken);
  return favicon.toString();
}

/** Create the icon element used in tree, list, and menu rows. */
function makeIcon(src, alt = "") {
  const img = document.createElement("img");
  img.className = "row-icon";
  img.alt = alt;
  img.src = src;
  img.width = 16;
  img.height = 16;
  img.loading = "lazy";
  if (Optimisation_DOMrendering) img.decoding = "async";
  return img;
}

/** Return a Set of IDs currently shown with the cut/ghosted style. */
function clipboardCutIdSet() {
  if (state.clipboard?.mode !== "cut") return new Set();
  return new Set(clipboardItems().map((entry) => entry.id).filter(Boolean));
}

/** Apply active/inactive selection classes without rebuilding row DOM. */
function applySelectionState(row, selected, active) {
  row.classList.toggle("selected", selected && row.classList.contains("item"));
  row.classList.toggle("selected-active", selected && active);
  row.classList.toggle("selected-inactive", selected && !active);
}

/** Replace children through a DocumentFragment for benchmarkable batched DOM rendering. */
function replaceChildrenWithFragment(element, children) {
  const fragment = document.createDocumentFragment();
  for (const child of children) fragment.append(child);
  element.replaceChildren(fragment);
}

/** Create the title cell, including icon and type-specific fallback text. */
function makeTitleCell(item) {
  const cell = document.createElement("span");
  cell.className = "title-cell";

  const icon = isFolder(item)
    ? makeIcon(extensionIconPath("folder-16.png"), t("folderAlt"))
    : makeIcon(bookmarkFaviconUrl(item.url, 16), t("bookmarkAlt"));

  const text = document.createElement("span");
  text.className = "title-text";
  text.textContent = item.title || item.url || (isFolder(item) ? t("folderFallback") : t("bookmarkFallback"));

  cell.append(icon, text);
  return cell;
}

/** Return whether a node is one of Chromium's immutable root bookmark containers. */
function isRootFolder(node) {
  return !!node && node.parentId === "0";
}

/** Return whether a node can legally contain child bookmark items. */
function canContainChildren(node) {
  return isFolder(node) && node.id !== "0" && !node.unmodifiable && node.folderType !== "managed";
}

/** Return whether SBM should allow editing, moving, or deleting a node. */
function isMutable(node) {
  // Chrome forbids modifying the root, special root children, and managed folders.
  return (canContainChildren(node) && !isRootFolder(node)) || (!!node && !isFolder(node) && !node.unmodifiable);
}

/** Return whether a node can be reordered within its current parent. */
function isReorderable(node) {
  return isMutable(node) && !isRootFolder(node);
}

/** Return whether a Folder Contents item can start a drag operation. */
function canDragListItem(node) {
  // Items can always be dragged to a folder. Before/after reordering is
  // separately gated by canReorderList() in validDrop().
  return isReorderable(node);
}

/** Return whether a Library tree folder can start a drag operation. */
function canDragTreeFolder(node) {
  return isFolder(node) && isReorderable(node);
}

/** Return whether the current list sort preserves Chromium child order for reordering. */
function canReorderList() {
  // Drag order only makes sense in the natural direct-child order.
  return !state.search && state.sort === "index";
}

/** Return whether the middle pane is currently showing filtered search results. */
function isSearchResultsActive() {
  return state.search.trim().length > 0;
}

/** Return all non-folder bookmarks under a folder, recursively, for search/open-all. */
function flattenBookmarks(folder) {
  const out = [];
  for (const child of folder.children || []) {
    out.push(child);
    if (child.children) out.push(...flattenBookmarks(child));
  }
  return out;
}

/** Compare two bookmark nodes according to the active sort key and direction. */
function compareNodes(a, b, key) {
  const value = (node) => {
    if (key === "dateAdded") return node.dateAdded || 0;
    if (key === "id") {
      const numeric = Number(node.id);
      return Number.isFinite(numeric) ? numeric : node.id;
    }
    return node[key] || "";
  };

  const av = value(a);
  const bv = value(b);
  if (typeof av === "number" && typeof bv === "number") return av - bv;
  return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
}

/** Return the default direction to use when activating a sort key. */
function defaultSortDirection(key) {
  return key === "dateAdded" || key === "id" ? "desc" : "asc";
}

/**
 * Calculate the middle pane rows from current folder/search/sort state.  Search
 * can be global or limited to the active folder subtree.
 */
function visibleItems() {
  const folder = nodes.get(state.folderId);
  if (!folder) return [];
  const needle = state.search.toLocaleLowerCase();
  let items;

  if (needle) {
    const searchRoot = SearchLimitToFolderAndSub ? folder : state.tree;
    const maps = tempBookmarkTreeMaps();
    items = searchRoot ? flattenBookmarksWithMaps(searchRoot, maps) : [];
    items = items.filter((n) =>
      [n.title, n.url].some((v) => (v || "").toLocaleLowerCase().includes(needle)));
  } else {
    items = folder.children || [];
  }

  if (state.sort !== "index") {
    const direction = state.sortDirection === "desc" ? -1 : 1;
    items = [...items].sort((a, b) => compareNodes(a, b, state.sort) * direction);
  }
  return items;
}

/** Reload Chrome bookmark data and rebuild the local node index. */
async function loadTree(options = {}) {
  const { renderNow = true, fallbackFolder = true } = options;
  nodes.clear();
  const [root] = await bookmarks("getTree");
  state.tree = root;
  indexTree(root);
  if (state.expandedFolders.size === 0) {
    for (const folder of rootFolders()) state.expandedFolders.add(folder.id);
  }
  if (!state.folderId || !nodes.has(state.folderId)) {
    // Chrome root's first children are normally Bookmarks Bar / Other / Mobile.
    state.folderId = fallbackFolder ? defaultFolderId() : null;
  }
  if (state.treeSelectedId && !nodes.has(state.treeSelectedId)) state.treeSelectedId = null;
  if (state.selectedId && !nodes.has(state.selectedId)) state.selectedId = null;
  if (state.folderId && nodes.has(state.folderId)) ensureExpandedPath(state.folderId);
  if (renderNow) render();
}

/** Return Chromium's visible top-level bookmark roots. */
function rootFolders() {
  const maps = tempBookmarkTreeMaps();
  if (maps) return maps.rootFolders;
  return (state.tree?.children || []).filter(isFolder);
}

/** Choose the startup folder, preferring the bookmarks bar when available. */
function defaultFolderId() {
  return rootFolders()[0]?.id || state.tree?.id || null;
}


/** Return whether a node is a valid target for the configured startup folder. */
function isValidStartupFolderNode(node) {
  return isFolder(node) && node.id !== "0";
}

/** Clear a stale configured-startup folder so future launches use the default folder. */
async function clearInvalidStartupFolderSetting() {
  const update = {
    StartAtConfiguredBookmarkFolder: false,
    StartupBookmarkFolderId: ""
  };
  applySettings(update, { render: false });
  await api.storage.local.set(update);
  addSessionLogRecord("warn", ["[SBM] Cleared invalid configured startup bookmark folder."], "SBM Manager");
}

/** Resolve the initial folder for this manager launch after the bookmark tree is indexed. */
async function resolveInitialFolderId() {
  if (StartAtConfiguredBookmarkFolder) {
    const configuredFolder = nodes.get(StartupBookmarkFolderId);
    if (isValidStartupFolderNode(configuredFolder)) return configuredFolder.id;
    await clearInvalidStartupFolderSetting();
  }
  return defaultFolderId();
}

/** Apply startup-folder preferences without pushing history entries or prompting for Details edits. */
async function applyInitialFolderPreference() {
  const initialFolderId = await resolveInitialFolderId();
  state.folderId = initialFolderId;
  state.treeSelectedId = initialFolderId;
  state.selectedId = initialFolderId;
  state.activePane = "tree";
  if (initialFolderId) ensureExpandedPath(initialFolderId);
}

/** Return direct folder children, optionally using precomputed tree maps. */
function childFolders(folder) {
  return (folder.children || []).filter(isFolder);
}

/** Return all descendant folders for a folder, optionally using precomputed tree maps. */
function descendantFolders(folder) {
  const out = [];
  const maps = tempBookmarkTreeMaps();
  const visit = (node) => {
    for (const child of childFolders(node, maps)) {
      out.push(child);
      visit(child);
    }
  };
  if (folder) visit(folder);
  return out;
}

/** Flatten the currently expanded left tree into visible rows. */
function visibleTreeFolders() {
  const out = [];
  const maps = tempBookmarkTreeMaps();
  const visit = (folder) => {
    out.push(folder);
    if (state.expandedFolders.has(folder.id)) {
      for (const child of childFolders(folder, maps)) visit(child);
    }
  };
  for (const folder of (maps ? maps.rootFolders : rootFolders())) visit(folder);
  return out;
}

/** Expand all ancestor folders so a target folder is visible in the Library tree. */
function ensureExpandedPath(folderId) {
  for (let n = nodes.get(folderId)?.parentNode; n && n.id !== "0"; n = n.parentNode) {
    state.expandedFolders.add(n.id);
  }
}

/** Reset search, sort, selection, and expansion state when moving to a new folder view. */
function resetFolderViewState() {
  refreshFaviconToken();
  state.resetMiddleScrollOnNextRender = true;
  state.search = "";
  state.sort = "index";
  state.sortDirection = defaultSortDirection(state.sort);
  $("search").value = "";
  $("sort").value = state.sort;
}

/** Toggle a tree folder while keeping active selection safe if a selected child collapses. */
async function toggleTreeFolderFromClick(folder) {
  const children = childFolders(folder);
  if (!children.length) return;

  const isExpanded = state.expandedFolders.has(folder.id);
  if (!isExpanded) {
    state.expandedFolders.add(folder.id);
    renderRoots();
    return;
  }

  const currentFolder = nodes.get(state.folderId);
  const selectedFolder = nodes.get(state.treeSelectedId);
  const collapseAffectsCurrent = currentFolder && currentFolder.id !== folder.id && isDescendantOf(currentFolder, folder);
  const collapseAffectsTreeSelection = selectedFolder && selectedFolder.id !== folder.id && isDescendantOf(selectedFolder, folder);

  if (collapseAffectsCurrent || collapseAffectsTreeSelection) {
    if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
    if (collapseAffectsCurrent && state.folderId) {
      state.back.unshift(state.folderId);
      state.forward = [];
    }
    clearMultiSelect();
    state.folderId = folder.id;
    state.treeSelectedId = folder.id;
    state.selectedId = folder.id;
    state.activePane = "tree";
    resetFolderViewState();
  }

  state.expandedFolders.delete(folder.id);
  render();
}

/** Return whether one node is inside another node's subtree. */
function isDescendantOf(node, possibleAncestor) {
  for (let n = node?.parentNode; n; n = n.parentNode) {
    if (n.id === possibleAncestor?.id) return true;
  }
  return false;
}

/** Expand a folder and every descendant folder in the visible Library tree. */
async function expandAllTreeFolders(folder) {
  if (!isFolder(folder)) return;
  state.expandedFolders.add(folder.id);
  for (const child of descendantFolders(folder)) state.expandedFolders.add(child.id);
  renderRoots();
  focusActivePane();
}

/**
 * Collapse a subtree.  If the active folder is inside that subtree, selection is
 * first moved to the collapsing folder so ensureExpandedPath() does not reopen it.
 */
async function collapseAllTreeFolders(folder) {
  if (!isFolder(folder)) return;

  const currentFolder = nodes.get(state.folderId);
  const selectedFolder = nodes.get(state.treeSelectedId);
  const collapseAffectsCurrent = currentFolder && currentFolder.id !== folder.id && isDescendantOf(currentFolder, folder);
  const collapseAffectsTreeSelection = selectedFolder && selectedFolder.id !== folder.id && isDescendantOf(selectedFolder, folder);

  if (collapseAffectsCurrent || collapseAffectsTreeSelection) {
    if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
    if (collapseAffectsCurrent && state.folderId) {
      state.back.unshift(state.folderId);
      state.forward = [];
    }
    clearMultiSelect();
    state.folderId = folder.id;
    state.treeSelectedId = folder.id;
    state.selectedId = folder.id;
    state.activePane = "tree";
    resetFolderViewState();
  }

  state.expandedFolders.delete(folder.id);
  for (const child of descendantFolders(folder)) state.expandedFolders.delete(child.id);
  render();
  focusActivePane();
}


// ---------------------------------------------------------------------------
// Selection and multi-selection
// ---------------------------------------------------------------------------

/** Return selectable row nodes for a pane in their visible order. */
function paneItems(pane) {
  return pane === "tree" ? visibleTreeFolders() : pane === "list" ? visibleItems() : [];
}

/** Return the selected node ID for the requested pane. */
function paneSelectionId(pane) {
  return pane === "tree" ? (state.treeSelectedId || state.folderId) : state.selectedId;
}

/** Return whether a pane currently has an active multi-selection. */
function isMultiSelectActive(pane = state.activePane) {
  return state.multiSelect.pane === pane && state.multiSelect.ids.size > 1;
}

/** Clear any active multi-selection without changing the normal single selection. */
function clearMultiSelect() {
  state.multiSelect = { pane: null, ids: new Set(), anchorId: null, focusId: null };
}

/** Return selected IDs for a pane, expanding multi-selection when active. */
function selectionIdsForPane(pane) {
  if (isMultiSelectActive(pane)) return [...state.multiSelect.ids].filter((id) => nodes.has(id));
  const id = paneSelectionId(pane);
  return id && nodes.has(id) ? [id] : [];
}

/** Return pane selection IDs in their current visual order. */
function orderedIdsForPane(ids, pane) {
  const wanted = new Set(ids);
  return paneItems(pane).filter((item) => wanted.has(item.id)).map((item) => item.id);
}

/** Return whether a node is already covered by a selected ancestor. */
function hasAncestorInSet(node, idSet) {
  for (let n = node?.parentNode; n && n.id !== "0"; n = n.parentNode) {
    if (idSet.has(n.id)) return true;
  }
  return false;
}

/** Remove descendants when their ancestor is already selected. */
function topLevelIds(ids) {
  const idSet = new Set(ids);
  return ids.filter((id) => !hasAncestorInSet(nodes.get(id), idSet));
}

/** Enforce Library-tree multi-select safety rules: no roots and no parent+child set. */
function normalizeTreeMultiCandidate(ids, focusId) {
  const clean = orderedIdsForPane(ids, "tree").filter((id) => {
    const node = nodes.get(id);
    return node && isFolder(node) && !isRootFolder(node) && isMutable(node);
  });
  if (clean.length <= 1) return clean;

  const cleanSet = new Set(clean);
  const hasParentChildConflict = clean.some((id) => hasAncestorInSet(nodes.get(id), cleanSet));
  if (!hasParentChildConflict) return clean;

  const focus = nodes.get(focusId);
  if (focus && cleanSet.has(focus.id)) {
    const focusHasSelectedDescendant = clean.some((id) => id !== focus.id && isDescendantOf(nodes.get(id), focus));
    if (focusHasSelectedDescendant || hasAncestorInSet(focus, cleanSet)) return [focus.id];
  }

  return [topLevelIds(clean)[0]].filter(Boolean);
}

/** Set the active pane and single selected row. */
function setPaneSelection(pane, id, options = {}) {
  if (pane === "tree") {
    state.treeSelectedId = id || null;
    state.selectedId = id || null;
    if (options.navigate) state.folderId = id || state.folderId;
  } else if (pane === "list") {
    state.selectedId = id || null;
  }
  state.activePane = pane;
}

/** Set an isolated multi-selection for one pane only. */
function setMultiSelection(pane, ids, anchorId, focusId) {
  const ordered = pane === "tree" ? normalizeTreeMultiCandidate(ids, focusId) : orderedIdsForPane(ids, pane);
  if (ordered.length <= 1) {
    clearMultiSelect();
    setPaneSelection(pane, ordered[0] || focusId || null, { navigate: false });
    return;
  }
  state.multiSelect = { pane, ids: new Set(ordered), anchorId: anchorId || ordered[0], focusId: focusId || ordered[ordered.length - 1] };
  if (pane === "tree") {
    state.treeSelectedId = state.multiSelect.focusId;
    state.selectedId = state.multiSelect.focusId;
  }
  if (pane === "list") state.selectedId = state.multiSelect.focusId;
  state.activePane = pane;
}

/** Return the contiguous visual ID range between two pane items. */
function rangeIds(pane, fromId, toId) {
  const items = paneItems(pane);
  const a = items.findIndex((item) => item.id === fromId);
  const b = items.findIndex((item) => item.id === toId);
  if (a < 0 || b < 0) return [toId];
  const [start, end] = a < b ? [a, b] : [b, a];
  return items.slice(start, end + 1).map((item) => item.id);
}

/** Implement Windows-style Ctrl/Shift click selection for a pane. */
async function handlePaneClick(e, pane, item) {
  if (!item) return;
  const isMultiGesture = e.ctrlKey || e.shiftKey;
  if (pane === "tree" && isMultiGesture && isRootFolder(item)) return;

  if (!isMultiGesture) {
    clearMultiSelect();
    if (pane === "tree") await navigate(item.id, true, "tree");
    else await select(item.id, "list");
    return;
  }

  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;

  const currentIds = state.multiSelect.pane === pane ? [...state.multiSelect.ids] : selectionIdsForPane(pane);
  let nextIds;
  let anchorId = state.multiSelect.pane === pane ? state.multiSelect.anchorId : (paneSelectionId(pane) || item.id);

  if (e.shiftKey) {
    nextIds = rangeIds(pane, anchorId || item.id, item.id);
  } else {
    const set = new Set(currentIds);
    if (set.has(item.id)) set.delete(item.id);
    else set.add(item.id);
    nextIds = [...set];
    anchorId = item.id;
  }

  setMultiSelection(pane, nextIds, anchorId, item.id);
  state.detailsOriginal = null;
  render();
}

/** Collapse a multi-selection to one focused item without navigating away. */
function cancelMultiSelectToFocus() {
  if (!state.multiSelect.pane) return false;
  const pane = state.multiSelect.pane;
  const focusId = state.multiSelect.focusId || selectionIdsForPane(pane)[0] || null;
  clearMultiSelect();
  setPaneSelection(pane, focusId, { navigate: false });
  render();
  return true;
}

/** Calculate the Details Multiselect summary counts. */
function multiSelectionStats() {
  const ids = selectionIdsForPane(state.activePane);
  const stats = { total: 0, folders: 0, bookmarks: 0, separators: 0 };
  for (const id of ids) {
    const item = nodes.get(id);
    if (!item) continue;
    stats.total += 1;
    if (isFolder(item)) stats.folders += 1;
    else if (isSeparator(item)) stats.separators += 1;
    else stats.bookmarks += 1;
  }
  return stats;
}

/** Return whether an event target is inside the Details pane. */
function isInDetailsPane(element) {
  return !!element?.closest?.("#details-pane");
}

/** Collect bookmark URLs from a folder subtree in Chromium order. */
function folderUrls(folder) {
  const urls = [];
  const visit = (node) => {
    for (const child of node.children || []) {
      if (child.url) {
        const safeUrl = isSeparator(child) ? null : safeBookmarkOpenUrl(child.url);
        if (safeUrl) urls.push(safeUrl);
        else if (!isSeparator(child)) console.warn("[SBM] Skipped unsupported bookmark URL while building folder open list.", { id: child.id, url: child.url });
      } else {
        visit(child);
      }
    }
  };
  visit(folder);
  return urls;
}

// ---------------------------------------------------------------------------
// Clipboard, mutations, and open-all helpers
// ---------------------------------------------------------------------------

/** Create a serializable bookmark/folder snapshot for copy/paste. */
function cloneBookmarkNode(node) {
  const copy = { title: node.title || "" };
  if (node.url) copy.url = node.url;
  if (node.children) copy.children = node.children.map(cloneBookmarkNode);
  return copy;
}

/** Recreate a bookmark/folder snapshot recursively at a destination. */
async function createFromSnapshot(snapshot, parentId, index = null) {
  const clean = sanitizeSnapshot(snapshot);
  const target = safeMoveDetails(parentId, index);
  if (!clean || !target) return null;

  const createDetails = { ...target, title: clean.title || "" };
  if (clean.url) createDetails.url = clean.url;
  const created = await tryBookmarkMutation(t("mutationCreateFromClipboardSnapshot"), "create", createDetails);
  if (!created) return null;
  for (const child of clean.children || []) {
    await createFromSnapshot(child, created.id);
  }
  return created;
}


/** Return the IDs affected by the current context-menu action. */
function selectedContextIds(context = state.contextMenu) {
  if (context?.kind === "multi") return orderedIdsForPane(context.ids || [], context.pane);
  return context?.id ? [context.id] : [];
}

/** Return openable bookmark URLs for a set of selected IDs. */
function selectionUrls(ids) {
  const urls = [];
  for (const id of ids) {
    const item = nodes.get(id);
    if (!item) continue;
    if (isFolder(item)) urls.push(...folderUrls(item));
    else if (item.url && !isSeparator(item)) {
      const safeUrl = safeBookmarkOpenUrl(item.url);
      if (safeUrl) urls.push(safeUrl);
      else console.warn("[SBM] Skipped bookmark URL while building selection open list.", { id: item.id, url: item.url });
    }
  }
  return urls;
}

/** Return raw URL strings for direct URL-bookmark IDs without expanding folders. */
function directBookmarkUrlsForIds(ids) {
  const urls = [];
  for (const id of orderedIdsForPane(ids || [], "list")) {
    const item = nodes.get(id);
    if (item?.url && !isFolder(item) && !isSeparator(item)) urls.push(item.url);
  }
  return urls;
}

/** Return bookmark URLs represented by the active multi-selection context. */
function multiContextUrls(context) {
  return selectionUrls(selectedContextIds(context));
}

/** Return sanitized clipboard snapshots from the current cut/copy buffer. */
function clipboardItems(clipboard = state.clipboard) {
  if (!clipboard) return [];
  if (clipboard.items) return clipboard.items;
  if (clipboard.mode === "cut" && clipboard.id) return [{ id: clipboard.id }];
  if (clipboard.mode === "copy" && clipboard.snapshot) return [{ snapshot: clipboard.snapshot }];
  return [];
}

/** Return whether snapshots can be pasted into a destination folder. */
function canPasteInto(parentFolder, clipboard = state.clipboard) {
  if (!clipboard || !canContainChildren(parentFolder)) return false;
  if (clipboard.mode === "cut") {
    for (const entry of clipboardItems(clipboard)) {
      const cutNode = nodes.get(entry.id);
      if (!cutNode || !isMutable(cutNode)) return false;
      if (cutNode.id === parentFolder.id) return false;
      if (isFolder(cutNode) && isDescendantOf(parentFolder, cutNode)) return false;
    }
  }
  return true;
}


/** Return whether the current clipboard can be pasted for a context-menu target. */
function canPasteForContext(context) {
  const target = pasteTargetForContext(context);
  if (!target || !target.parent || !canPasteInto(target.parent)) return false;
  if (state.clipboard?.mode === "cut" && clipboardItems().some((entry) => entry.id === context?.id)) return false;
  return true;
}

/** Resolve the folder ID that should receive a context-menu paste action. */
function pasteTargetForContext(context) {
  if (!context) return null;
  const item = nodes.get(context.id);
  if (context.kind === "multi") {
    if (!item) return { parent: nodes.get(state.folderId), index: null };
    if (canContainChildren(item)) return { parent: item, index: null };
    const parent = nodes.get(item.parentId);
    const index = Number.isInteger(item.index) ? item.index + 1 : null;
    return { parent, index };
  }
  if (context.kind === "folder") {
    return canContainChildren(item) ? { parent: item, index: null } : null;
  }
  if (context.kind === "bookmark") {
    const parent = nodes.get(item?.parentId);
    const index = Number.isInteger(item?.index) ? item.index + 1 : null;
    return { parent, index };
  }
  return { parent: nodes.get(state.folderId), index: null };
}

/** Paste the current clipboard into the folder/index described by a context menu target. */
async function pasteClipboard(context = state.contextMenu) {
  if (!canPasteForContext(context)) return;
  const target = pasteTargetForContext(context);
  const entries = clipboardItems(state.clipboard);
  if (!entries.length) return;

  let lastId = null;
  state.suppressBookmarkEvents = true;
  try {
    if (state.clipboard.mode === "cut") {
      let index = Number.isInteger(target.index) ? target.index : null;
      for (const entry of entries) {
        const node = nodes.get(entry.id);
        if (!node || !isMutable(node)) continue;
        if (isFolder(node) && isDescendantOf(target.parent, node)) continue;
        const moveDetails = safeMoveDetails(target.parent.id, index);
        if (!moveDetails) continue;
        if (Number.isInteger(index)) index = (moveDetails.index ?? index) + 1;
        await tryBookmarkMutation(t("mutationPasteCutItem"), "move", node.id, moveDetails);
        lastId = node.id;
      }
      state.clipboard = null;
    } else {
      let index = Number.isInteger(target.index) ? target.index : null;
      for (const entry of entries) {
        const created = await createFromSnapshot(entry.snapshot, target.parent.id, index);
        if (!created) continue;
        if (Number.isInteger(index)) index += 1;
        lastId = created.id;
      }
    }
  } finally {
    state.suppressBookmarkEvents = false;
  }

  clearMultiSelect();
  state.selectedId = lastId;
  state.activePane = "list";
  await loadTree();
}


/** Classify nodes so natural name sort keeps folders, bookmarks, and separators grouped. */
function naturalNameSortGroup(node) {
  if (isFolder(node)) return 0;
  if (isSeparator(node)) return 1;
  return 2;
}

/** Compare two nodes by localized natural title order with stable fallbacks. */
function compareNaturalNameSort(a, b) {
  const groupDiff = naturalNameSortGroup(a) - naturalNameSortGroup(b);
  if (groupDiff !== 0) return groupDiff;

  // Separators intentionally remain in their existing relative order.
  if (isSeparator(a) && isSeparator(b)) return (a.index || 0) - (b.index || 0);

  return compareNodes(a, b, "title");
}

/** Permanently sort Chrome bookmark children inside one folder. */
async function sortFolderChildren(folder, key) {
  if (!canContainChildren(folder)) return;
  const children = [...(folder.children || [])];
  if (children.length < 2) return;

  if (SortShowWarning) {
    const sortName = key === "dateAdded" ? t("sortDate") : t("sortNameLower");
    const folderName = folder.title || t("rootFallback");
    const ok = confirm(
      t("sortFolderConfirm", { folderName, sortName })
    );
    if (!ok) return;
  }

  const sorted = children.sort((a, b) => (key === "title" && SortByNameNatural)
    ? compareNaturalNameSort(a, b)
    : compareNodes(a, b, key));
  state.suppressBookmarkEvents = true;
  try {
    for (let i = 0; i < sorted.length; i += 1) {
      await tryBookmarkMutation(t("mutationSortFolderChild"), "move", sorted[i].id, { parentId: folder.id, index: i });
    }
  } finally {
    state.suppressBookmarkEvents = false;
  }
  state.folderId = folder.id;
  state.selectedId = folder.id;
  await loadTree();
}

/** Open allowed bookmark URLs as new tabs in the current browser window. */
async function openUrlsInCurrentWindow(urls) {
  const safeUrls = safeBookmarkOpenUrls(urls);
  if (!safeUrls.length) {
    alert(t("couldNotOpenBookmark", { error: bookmarkOpenBlockedMessage(urls) }));
    return;
  }
  try {
    for (const [i, url] of safeUrls.entries()) {
      await api.tabs.create({ url, active: i === 0 });
    }
  } catch (err) {
    console.error(err);
    alert(t("couldNotOpenBookmark", { error: err.message || err }));
  }
}

/** Open allowed bookmark URLs in a new normal or private browser window. */
async function openUrlsInWindow(urls, incognito = false) {
  const safeUrls = safeBookmarkOpenUrls(urls);
  if (!safeUrls.length) {
    alert(t("couldNotOpenWindow", { windowType: incognito ? t("privateWindowType") : t("newWindowType"), error: bookmarkOpenBlockedMessage(urls) }));
    return;
  }
  try {
    await api.windows.create({ url: safeUrls, incognito });
  } catch (err) {
    alert(t("couldNotOpenWindow", { windowType: incognito ? t("privateWindowType") : t("newWindowType"), error: err.message || err }));
  }
}

/** Open allowed bookmark URLs and group them when the tabGroups API is available. */
async function openUrlsInTabGroup(urls) {
  if (!api.tabs?.group) return;
  const safeUrls = safeBookmarkOpenUrls(urls);
  if (!safeUrls.length) {
    alert(t("couldNotOpenTabGroup", { error: bookmarkOpenBlockedMessage(urls) }));
    return;
  }
  try {
    const createdTabs = [];
    for (const [i, url] of safeUrls.entries()) {
      createdTabs.push(await api.tabs.create({ url, active: i === 0 }));
    }
    const tabIds = createdTabs.map((tab) => tab.id).filter(Number.isInteger);
    if (tabIds.length) await api.tabs.group({ tabIds });
  } catch (err) {
    alert(t("couldNotOpenTabGroup", { error: err.message || err }));
  }
}

/** Return whether the current Chromium build exposes tab-group creation APIs. */
function isTabGroupSupported() {
  return typeof api.tabs?.group === "function";
}

/** Return whether split-view commands should be exposed for this browser. */
function isSplitViewSupported() {
  // Chromium does not currently expose a stable cross-browser extension API
  // for browser-specific split-view features, so the menu item stays hidden.
  return false;
}


/** Write text to the clipboard from a user-triggered menu command. */
async function writeTextToClipboard(text) {
  let clipboardError = null;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (err) {
      clipboardError = err;
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.append(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw clipboardError || new Error("Clipboard copy command was rejected.");
  } finally {
    textarea.remove();
  }
}

/** Copy a direct bookmark URL without exposing folder or separator entries. */
async function copyBookmarkUrlToClipboard(bookmark) {
  if (!bookmark || isFolder(bookmark) || isSeparator(bookmark) || !bookmark.url) return;
  await writeTextToClipboard(bookmark.url);
}

/** Resolve all bookmark URLs affected by a context-menu open-all action. */
function contextUrls(context) {
  const item = nodes.get(context?.id);
  if (!item) return [];
  if (isFolder(item)) return folderUrls(item);
  if (isSeparator(item)) return [];
  const safeUrl = item.url ? safeBookmarkOpenUrl(item.url) : null;
  if (!safeUrl && item.url) console.warn("[SBM] Skipped bookmark URL while building context open list.", { id: item.id, url: item.url });
  return safeUrl ? [safeUrl] : [];
}

/** Return whether a search-result bookmark can offer its containing folder action. */
function canOpenContainingFolderContext(context, bookmark) {
  return context?.pane === "list"
    && context?.kind === "bookmark"
    && isSearchResultsActive()
    && !!bookmark?.parentId
    && nodes.has(bookmark.parentId)
    && !isSeparator(bookmark)
    && !isFolder(bookmark);
}

/**
 * Leave search mode, navigate to a bookmark's parent folder, and select the
 * bookmark so users can see its local folder context immediately.
 */
async function openContainingFolderForBookmark(bookmark) {
  if (!bookmark?.parentId || !nodes.has(bookmark.parentId)) return;
  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;

  const parentId = bookmark.parentId;
  const bookmarkId = bookmark.id;
  if (parentId !== state.folderId && state.folderId) {
    state.back.unshift(state.folderId);
    state.forward = [];
  }

  clearMultiSelect();
  state.folderId = parentId;
  state.treeSelectedId = parentId;
  state.selectedId = bookmarkId;
  state.activePane = "list";
  ensureExpandedPath(parentId);
  resetFolderViewState();
  render();

  requestAnimationFrame(() => {
    const list = $("list");
    for (const row of list?.children || []) {
      if (row.dataset.id === bookmarkId) {
        row.scrollIntoView({ block: "nearest", inline: "nearest" });
        break;
      }
    }
  });
}

/** Open the Rename Folder dialog and apply the saved title to a mutable folder node. */
async function renameFolder(folder, sourcePane = "tree") {
  if (!folder || !isFolder(folder) || !isMutable(folder)) return;
  const renamed = await showFolderRenameDialog({
    heading: t("renameFolder"),
    title: folder.title || "",
    submitLabel: t("save")
  });
  if (!renamed) return;
  const updated = await tryBookmarkMutation(t("mutationRenameFolder"), "update", folder.id, renamed);
  if (!updated) {
    await loadTree();
    return;
  }
  await loadTree();
  const targetPane = sourcePane === "list" && nodes.get(folder.id)?.parentId === state.folderId ? "list" : "tree";
  performSelect(folder.id, targetPane);
}

/** Open the Edit Bookmark dialog and update a mutable bookmark node. */
async function editBookmark(bookmark, { initialFocus = "url" } = {}) {
  if (!bookmark || isFolder(bookmark) || !isMutable(bookmark)) return;
  const edited = await showBookmarkEditorDialog({
    heading: t("editBookmark"),
    title: bookmark.title || bookmark.url || "",
    url: bookmark.url || "https://",
    submitLabel: t("save"),
    initialFocus
  });
  if (!edited) return;
  try {
    const updated = await tryBookmarkMutation(t("mutationEditBookmark"), "update", bookmark.id, edited);
    if (!updated) return;
  } catch (err) {
    console.error(err);
    alert(t("couldNotSaveChanges", { error: err.message || err }));
  }
  await loadTree();
  performSelect(bookmark.id, "list");
}

/** Choose the next Folder Contents selection after deleting an item. */
function listSelectionAfterDelete(item) {
  const items = visibleItems();
  const index = items.findIndex((node) => node.id === item?.id);
  return { index: index >= 0 ? index : null };
}

/** Choose the next Library tree selection after deleting a folder. */
function treeSelectionAfterDelete(item) {
  const parent = nodes.get(item?.parentId);
  const siblings = parent ? childFolders(parent) : rootFolders();
  const index = siblings.findIndex((node) => node.id === item?.id);
  return { parentId: parent?.id || null, index: index >= 0 ? index : null };
}

/** Return a stable list selection target after deleting one or more rows. */
function chooseListSelectionAfterDelete(snapshot) {
  if (!snapshot || snapshot.index === null) return null;
  const items = visibleItems();
  return items[snapshot.index]?.id || items[snapshot.index - 1]?.id || null;
}

/** Return a stable tree selection target after deleting one or more folders. */
function chooseTreeSelectionAfterDelete(snapshot) {
  if (!snapshot || snapshot.index === null) return null;
  const parent = snapshot.parentId ? nodes.get(snapshot.parentId) : null;
  const siblings = parent ? childFolders(parent) : rootFolders();
  return siblings[snapshot.index]?.id || siblings[snapshot.index - 1]?.id || null;
}

/** Delete a single node and choose the safest follow-up selection within the same pane. */
async function deleteNode(item, sourcePane = state.activePane) {
  if (!item || !isMutable(item)) return;
  const label = item.title || item.url || t("thisItem");
  if (DeleteShowWarning && !confirm(t("deleteSingleConfirm", { label }))) return;

  const deletingCurrentFolder = isFolder(item) && item.id === state.folderId;
  const selectionSnapshot = sourcePane === "tree"
    ? treeSelectionAfterDelete(item)
    : sourcePane === "list"
      ? listSelectionAfterDelete(item)
      : null;

  if (state.detailsOriginal?.id === item.id) {
    state.detailsOriginal = null;
  }

  const removed = isFolder(item)
    ? await tryBookmarkMutation(t("mutationDeleteFolder"), "removeTree", item.id)
    : await tryBookmarkMutation(t("mutationDeleteBookmark"), "remove", item.id);
  if (!removed) {
    await loadTree({ fallbackFolder: sourcePane !== "tree" });
    return;
  }
  if (state.clipboard?.mode === "cut" && clipboardItems().some((entry) => entry.id === item.id)) state.clipboard = null;

  await loadTree({ renderNow: false, fallbackFolder: sourcePane !== "tree" });

  if (sourcePane === "list") {
    state.activePane = "list";
    state.selectedId = chooseListSelectionAfterDelete(selectionSnapshot);
  } else if (sourcePane === "tree") {
    const nextFolderId = chooseTreeSelectionAfterDelete(selectionSnapshot);
    state.activePane = "tree";
    // Never jump to the parent, root, or another branch after deleting from the
    // Library tree.  Only select a same-parent sibling at the same depth; if no
    // sibling exists, leave the Library selection empty so repeated Delete/
    // Backspace cannot climb the tree and remove the wrong folder.
    state.folderId = nextFolderId || null;
    state.selectedId = nextFolderId || null;
    if (state.folderId && nodes.has(state.folderId)) ensureExpandedPath(state.folderId);
  } else {
    state.activePane = "details";
    state.selectedId = null;
  }

  setDetailsCleanBaseline(nodes.get(state.selectedId));
  render();
}
/** Delete all nodes in the active multi-selection or context target. */
async function deleteSelection(context = null) {
  const pane = context?.pane || state.activePane;
  const ids = topLevelIds(context?.kind === "multi" ? selectedContextIds(context) : selectionIdsForPane(pane))
    .filter((id) => isMutable(nodes.get(id)));
  const ordered = orderedIdsForPane(ids, pane);
  if (!ordered.length) return;
  if (DeleteShowWarning && !confirm(t("deleteMultipleConfirm", { count: ordered.length }))) return;

  state.suppressBookmarkEvents = true;
  try {
    for (const id of ordered.slice().reverse()) {
      const item = nodes.get(id);
      if (!item || !isMutable(item)) continue;
      if (isFolder(item)) await tryBookmarkMutation(t("mutationDeleteSelectedFolder"), "removeTree", item.id);
      else await tryBookmarkMutation(t("mutationDeleteSelectedBookmark"), "remove", item.id);
    }
  } finally {
    state.suppressBookmarkEvents = false;
  }
  clearMultiSelect();
  state.selectedId = null;
  if (pane === "tree") state.treeSelectedId = null;
  await loadTree({ fallbackFolder: pane !== "tree" });
}


/** Return the parent/index pair for inserting a new item after a node. */
function insertionTargetAfterNode(item) {
  if (!item || !item.parentId || item.parentId === "0") return null;
  const parent = nodes.get(item.parentId);
  if (!canContainChildren(parent)) return null;
  return { parentId: parent.id, index: Number.isInteger(item.index) ? item.index + 1 : null };
}

/** Calculate parent/index for creating or pasting relative to the current menu target. */
function insertionTargetForContext(context = null) {
  const contextItem = nodes.get(context?.id);

  // Adding from the Library tree should create the new item inside the clicked
  // folder. Adding from a folder row in the middle pane should stay in the
  // current visible folder and insert below that row, matching other middle-pane
  // add behavior.
  if (context?.kind === "folder") {
    if (context.pane === "tree" && canContainChildren(contextItem)) {
      return { parentId: contextItem.id, index: null };
    }
    const siblingTarget = insertionTargetAfterNode(contextItem);
    if (siblingTarget) return siblingTarget;
  }

  // Adding from a bookmark/separator row context should create the new item
  // immediately below that clicked row when possible.
  if (context?.kind === "bookmark") {
    const siblingTarget = insertionTargetAfterNode(contextItem);
    if (siblingTarget) return siblingTarget;
  }

  // Toolbar and empty-space additions operate on the current visible folder. If
  // the active middle-pane selection is still a direct child of that folder,
  // insert below it; otherwise append to the current folder. A selected folder
  // row in the middle pane is treated as a sibling target, not a destination.
  const selected = nodes.get(state.selectedId);
  if (state.activePane === "list" && selected?.parentId === state.folderId) {
    const siblingTarget = insertionTargetAfterNode(selected);
    if (siblingTarget) return siblingTarget;
  }

  return { parentId: state.folderId, index: null };
}

/** Create a folder under the requested parent with a localized default name. */
async function createFolderIn(parentId, index = null) {
  const target = safeMoveDetails(parentId, index);
  if (!target) return;
  const title = prompt(t("folderNamePrompt"), t("newFolderDefaultName"));
  if (title === null) return;
  const details = { ...target, title: sanitizeBookmarkTitle(title, t("newFolderDefaultName")) };
  const node = await tryBookmarkMutation(t("mutationCreateFolder"), "create", details);
  if (!node) {
    await loadTree();
    return;
  }
  await loadTree();
  performSelect(node.id);
}

/** Create a bookmark under the requested parent after collecting dialog input. */
async function createBookmarkIn(parentId, index = null) {
  const target = safeMoveDetails(parentId, index);
  if (!target) return;
  const bookmarkDetails = await showBookmarkEditorDialog({
    heading: t("newBookmark"),
    title: "",
    url: "https://",
    submitLabel: t("create"),
  });
  if (!bookmarkDetails) return;
  const details = { ...target, ...bookmarkDetails };
  try {
    const node = await tryBookmarkMutation(t("mutationCreateBookmark"), "create", details);
    if (!node) {
      await loadTree();
      return;
    }
    await loadTree();
    performSelect(node.id);
  } catch (err) {
    console.error(err);
    alert(t("couldNotSaveChanges", { error: err.message || err }));
  }
}

/** Create SBM's separator bookmark marker under the requested parent. */
async function createSeparatorIn(parentId, index = null) {
  const target = safeMoveDetails(parentId, index);
  if (!target) return;
  const details = { ...target, title: SEPARATOR_TITLE, url: SEPARATOR_URL };
  const node = await tryBookmarkMutation(t("mutationCreateSeparator"), "create", details);
  if (!node) {
    await loadTree();
    return;
  }
  await loadTree();
  performSelect(node.id);
}

/** Prevent create actions that would discard unsaved Details pane changes. */
async function blockAddIfUnsavedDetails() {
  if (!hasUnsavedDetails()) return false;
  // Adding a new item changes selection after creation. If the Details pane has
  // unsaved edits, show the same unsaved-changes prompt first, but do not
  // continue the add operation in this click. This prevents accidental loss of
  // edits and avoids surprising item creation after the user chooses Save or
  // Discard in the prompt.
  await confirmUnsavedDetailsBeforeNavigation();
  return true;
}

/** Create a folder at the currently focused/contextual insertion target. */
async function createFolderAtTarget(context = null) {
  if (await blockAddIfUnsavedDetails()) return;
  const target = insertionTargetForContext(context);
  if (!target || !canContainChildren(nodes.get(target.parentId))) return;
  await createFolderIn(target.parentId, target.index);
}

/** Create a bookmark at the currently focused/contextual insertion target. */
async function createBookmarkAtTarget(context = null) {
  if (await blockAddIfUnsavedDetails()) return;
  const target = insertionTargetForContext(context);
  if (!target || !canContainChildren(nodes.get(target.parentId))) return;
  await createBookmarkIn(target.parentId, target.index);
}

/** Create a separator at the currently focused/contextual insertion target. */
async function createSeparatorAtTarget(context = null) {
  if (await blockAddIfUnsavedDetails()) return;
  const target = insertionTargetForContext(context);
  if (!target || !canContainChildren(nodes.get(target.parentId))) return;
  await createSeparatorIn(target.parentId, target.index);
}

/** Store a single node snapshot for a later move-style paste. */
function cutNode(item) {
  if (!item || !isMutable(item)) return;
  state.clipboard = { mode: "cut", items: [{ id: item.id }] };
  render();
}

/** Store a single node snapshot for a later clone-style paste. */
function copyNode(item) {
  if (!item || item.id === "0") return;
  state.clipboard = { mode: "copy", items: [{ snapshot: cloneBookmarkNode(item) }] };
  render();
}

/** Store selected nodes as a cut clipboard payload. */
function cutSelection(context = state.contextMenu) {
  const ids = topLevelIds(selectedContextIds(context)).filter((id) => isMutable(nodes.get(id)));
  if (!ids.length) return;
  state.clipboard = { mode: "cut", items: orderedIdsForPane(ids, context.pane).map((id) => ({ id })) };
  clearMultiSelect();
  render();
}

/** Store selected nodes as a copy clipboard payload. */
function copySelection(context = state.contextMenu) {
  const ids = topLevelIds(selectedContextIds(context)).filter((id) => {
    const item = nodes.get(id);
    return item && item.id !== "0" && !isRootFolder(item);
  });
  if (!ids.length) return;
  state.clipboard = { mode: "copy", items: orderedIdsForPane(ids, context.pane).map((id) => ({ snapshot: cloneBookmarkNode(nodes.get(id)) })) };
  clearMultiSelect();
  render();
}

// ---------------------------------------------------------------------------
// Drag and drop
// ---------------------------------------------------------------------------

/** Resolve above/into/below drop intent from pointer position and target type. */
function dropIntent(event, element, target) {
  const rect = element.getBoundingClientRect();
  const y = event.clientY - rect.top;

  if (isFolder(target) && canContainChildren(target)) {
    if (y < rect.height * 0.25) return "before";
    if (y > rect.height * 0.75) return "after";
    return "into";
  }

  return y < rect.height / 2 ? "before" : "after";
}

/** Return the CSS class that represents a drag/drop intent. */
function dropClass(intent) {
  return intent === "into" ? "drop-into" : intent === "before" ? "drop-before" : "drop-after";
}

/** Remove row-level drag/drop highlighting from all panes. */
function clearDropRow(row) {
  row?.classList?.remove("drop-before", "drop-after", "drop-into");
}

/** Clear all drag/drop visual indicators. */
function clearDropIndicators() {
  clearDropRow(state.dropIndicator?.row);
  state.dropIndicator = null;
  document.querySelectorAll(".drop-before,.drop-after,.drop-into,.dragging").forEach((el) => {
    el.classList.remove("drop-before", "drop-after", "drop-into", "dragging");
  });
}

/** Update the visible drop target with minimal DOM class churn during dragover. */
function setDropIndicator(row, intent) {
  if (!Optimisation_DOMrendering) {
    clearDropIndicators();
    row.classList.add(dropClass(intent));
    return;
  }

  const className = dropClass(intent);
  if (state.dropIndicator?.row === row && state.dropIndicator?.className === className) return;
  clearDropRow(state.dropIndicator?.row);
  row.classList.remove("drop-before", "drop-after", "drop-into");
  row.classList.add(className);
  state.dropIndicator = { row, className };
}

/** Validate a single-item drag/drop before mutation. */
function validDrop(dragged, target, intent, context) {
  if (!dragged || !target || dragged.id === target.id) return false;
  if (!isMutable(dragged)) return false;

  if (intent === "into") {
    if (!canContainChildren(target)) return false;
    if (isFolder(dragged) && isDescendantOf(target, dragged)) return false;
    return true;
  }

  if (context === "list" && !canReorderList()) return false;
  if (!isReorderable(dragged) || !isReorderable(target)) return false;
  if (isFolder(dragged) && isDescendantOf(target, dragged)) return false;
  return !!target.parentId && target.parentId !== "0";
}

/** Return the number of children in a folder node. */
function childCount(parentId) {
  return (nodes.get(parentId)?.children || []).length;
}

/** Clamp a requested move index to Chromium's valid range for a destination folder. */
function normalizeMoveIndex(parentId, requestedIndex) {
  if (!Number.isInteger(requestedIndex)) return null;

  // chrome.bookmarks.move() already handles same-parent index adjustment when
  // the moved node is removed from its old position.  Do not pre-subtract for
  // downward moves, or the node lands one row too high when dropping below an
  // item or when applying an advanced Sort order change.
  const maxIndex = childCount(parentId);
  return Math.max(0, Math.min(requestedIndex, maxIndex));
}

/** Move one bookmark node above, into, or below a target node. */
async function moveWithIntent(draggedId, targetId, intent) {
  const dragged = nodes.get(draggedId);
  const target = nodes.get(targetId);
  if (!validDrop(dragged, target, intent, "any")) return;

  if (intent === "into") {
    const previousFolderId = state.folderId && nodes.has(state.folderId) ? state.folderId : null;
    const moveDetails = safeMoveDetails(target.id);
    if (!moveDetails) return;
    await tryBookmarkMutation(t("mutationDragDropMove"), "move", dragged.id, moveDetails);

    // Keep the user in their current folder after a successful move-into.
    // If there is no current folder, move the view to the drop target. If that
    // is unavailable after refresh, loadTree() falls back to the root folder.
    state.folderId = previousFolderId || target.id || null;
    state.selectedId = dragged.id;
    state.expandedFolders.add(target.id);
    if (isFolder(dragged)) ensureExpandedPath(dragged.id);
    await loadTree();
    return;
  }

  const requestedIndex = (Number.isInteger(target.index) ? target.index : 0) + (intent === "after" ? 1 : 0);
  const index = normalizeMoveIndex(target.parentId, requestedIndex);

  const moveDetails = safeMoveDetails(target.parentId, index);
  if (!moveDetails) return;
  await tryBookmarkMutation(t("mutationDragDropMove"), "move", dragged.id, moveDetails);
  state.selectedId = dragged.id;
  if (isFolder(dragged)) ensureExpandedPath(dragged.id);
  await loadTree();
}

/** Resolve the drop intent for a pointer location over a Folder Contents row. */
function listDropIntent(event, element, target) {
  // Multi-drag in the middle pane needs three folder zones: above, into, below.
  // Non-folder targets keep the simpler before/after behavior.
  return dropIntent(event, element, target);
}

/** Return the selected IDs that should move together with a drag source. */
function draggableIdsForPane(ids, pane) {
  const ordered = topLevelIds(orderedIdsForPane(ids || [], pane));
  return ordered.filter((id) => {
    const item = nodes.get(id);
    return pane === "tree" ? canDragTreeFolder(item) : canDragListItem(item);
  });
}

/** Validate a middle-pane multi-selection drag/drop target. */
function canMoveSelectedListItemsToTarget(target, intent, context, ids = null) {
  const sourceIds = ids || (isMultiSelectActive("list") ? [...state.multiSelect.ids] : []);
  const selectedIds = draggableIdsForPane(sourceIds, "list");
  if (!selectedIds.length || !target) return false;
  const selectedSet = new Set(selectedIds);

  if (intent === "into") {
    if (!canContainChildren(target) || selectedSet.has(target.id)) return false;
    for (const id of selectedIds) {
      const item = nodes.get(id);
      if (!item || !isMutable(item)) return false;
      if (isFolder(item) && isDescendantOf(target, item)) return false;
    }
    return true;
  }

  if (!isReorderable(target) || !target.parentId || target.parentId === "0") return false;

  for (const id of selectedIds) {
    const item = nodes.get(id);
    if (!item || !isMutable(item)) return false;
    if (isFolder(item) && isDescendantOf(target, item)) return false;
  }

  if (context === "list") return canReorderList() && target.parentId === state.folderId;
  return context === "tree";
}

/** Return whether selected Library folders can move to a target folder safely. */
function canMoveSelectedTreeFoldersToTarget(target, intent, context, ids = null) {
  const sourceIds = ids || (isMultiSelectActive("tree") ? [...state.multiSelect.ids] : []);
  const selectedIds = draggableIdsForPane(sourceIds, "tree");
  if (context !== "tree" || !selectedIds.length || !target) return false;
  const selectedSet = new Set(selectedIds);
  if (selectedSet.has(target.id)) return false;

  for (const id of selectedIds) {
    const item = nodes.get(id);
    if (!canDragTreeFolder(item)) return false;
    if (isDescendantOf(target, item)) return false;
  }

  if (intent === "into") return canContainChildren(target);
  return isReorderable(target) && !!target.parentId && target.parentId !== "0";
}

/** Move all selected middle-pane rows while preserving relative order. */
async function moveSelectedListItems(targetId, intent, context = "list", ids = null) {
  const target = nodes.get(targetId);
  const selectedIds = draggableIdsForPane(ids || (isMultiSelectActive("list") ? [...state.multiSelect.ids] : []), "list");
  if (!selectedIds.length || !canMoveSelectedListItemsToTarget(target, intent, context, selectedIds)) return;

  if (intent === "into") {
    let lastId = null;
    state.suppressBookmarkEvents = true;
    try {
      for (const id of selectedIds) {
        const item = nodes.get(id);
        if (!item || !isMutable(item)) continue;
        if (isFolder(item) && isDescendantOf(target, item)) continue;
        const moveDetails = safeMoveDetails(target.id);
        if (!moveDetails) continue;
        await tryBookmarkMutation(t("mutationMoveSelectedItem"), "move", item.id, moveDetails);
        lastId = item.id;
      }
    } finally {
      state.suppressBookmarkEvents = false;
    }
    clearMultiSelect();
    state.selectedId = lastId;
    state.activePane = "list";
    state.expandedFolders.add(target.id);
    await loadTree();
    return;
  }

  const targetParentId = target.parentId;
  const targetParent = nodes.get(targetParentId);
  const targetChildren = targetParent?.children || [];
  const targetIndex = targetChildren.findIndex((item) => item.id === targetId);
  if (targetIndex < 0) return;

  const selectedSet = new Set(selectedIds);
  const remaining = targetChildren.filter((item) => !selectedSet.has(item.id));
  const selectedBeforeTarget = targetChildren.slice(0, targetIndex).filter((item) => selectedSet.has(item.id)).length;
  let insertIndex = targetIndex - selectedBeforeTarget + (intent === "after" ? 1 : 0);
  insertIndex = Math.max(0, Math.min(insertIndex, remaining.length));
  const selectedItems = selectedIds.map((id) => nodes.get(id)).filter(Boolean);
  const finalOrder = [
    ...remaining.slice(0, insertIndex),
    ...selectedItems,
    ...remaining.slice(insertIndex)
  ];

  state.suppressBookmarkEvents = true;
  try {
    for (let i = 0; i < finalOrder.length; i += 1) {
      const moveDetails = safeMoveDetails(targetParentId, i);
      if (moveDetails) await tryBookmarkMutation(t("mutationReorderSelectedItems"), "move", finalOrder[i].id, moveDetails);
    }
  } finally {
    state.suppressBookmarkEvents = false;
  }
  clearMultiSelect();
  state.selectedId = selectedIds[selectedIds.length - 1] || null;
  state.activePane = context === "tree" ? "tree" : "list";
  if (context === "tree") {
    state.treeSelectedId = target.id;
    if (targetParentId) state.expandedFolders.add(targetParentId);
  }
  await loadTree();
}

/** Move all selected Library folders while preserving relative order. */
async function moveSelectedTreeFolders(targetId, intent, context = "tree", ids = null) {
  const target = nodes.get(targetId);
  const selectedIds = draggableIdsForPane(ids || (isMultiSelectActive("tree") ? [...state.multiSelect.ids] : []), "tree");
  if (!selectedIds.length || !canMoveSelectedTreeFoldersToTarget(target, intent, context, selectedIds)) return;

  let lastId = null;
  state.suppressBookmarkEvents = true;
  try {
    if (intent === "into") {
      for (const id of selectedIds) {
        const item = nodes.get(id);
        if (!canDragTreeFolder(item) || isDescendantOf(target, item)) continue;
        const moveDetails = safeMoveDetails(target.id);
        if (!moveDetails) continue;
        await tryBookmarkMutation(t("mutationMoveSelectedItem"), "move", item.id, moveDetails);
        lastId = item.id;
      }
    } else {
      const targetParent = nodes.get(target.parentId);
      const selectedSet = new Set(selectedIds);
      const remainingChildren = (targetParent?.children || []).filter((child) => !selectedSet.has(child.id));
      const targetIndex = remainingChildren.findIndex((child) => child.id === target.id);
      if (targetIndex < 0) return;
      let insertIndex = targetIndex + (intent === "after" ? 1 : 0);
      insertIndex = Math.max(0, Math.min(insertIndex, remainingChildren.length));

      for (let i = 0; i < selectedIds.length; i += 1) {
        const item = nodes.get(selectedIds[i]);
        if (!canDragTreeFolder(item)) continue;
        const moveDetails = safeMoveDetails(target.parentId, insertIndex + i);
        if (!moveDetails) continue;
        await tryBookmarkMutation(t("mutationMoveSelectedItem"), "move", item.id, moveDetails);
        lastId = item.id;
      }
    }
  } finally {
    state.suppressBookmarkEvents = false;
  }

  clearMultiSelect();
  state.activePane = "tree";
  state.treeSelectedId = lastId;
  state.selectedId = lastId;
  if (intent === "into") state.expandedFolders.add(target.id);
  if (lastId && isFolder(nodes.get(lastId))) ensureExpandedPath(lastId);
  await loadTree();
}

/** Return drag metadata captured from the browser dataTransfer object. */
function currentDragIntent(event, row, target, context) {
  const source = state.drag?.source;
  if (state.drag?.multi && source === "list" && context === "list") return listDropIntent(event, row, target);
  return dropIntent(event, row, target);
}

/** Return whether the active drag source can be dropped on a target. */
function canMoveCurrentDragToTarget(target, intent, context) {
  if (!(state.drag?.multi)) return false;
  if (state.drag.source === "list") return canMoveSelectedListItemsToTarget(target, intent, context, state.drag.ids || []);
  if (state.drag.source === "tree") return canMoveSelectedTreeFoldersToTarget(target, intent, context, state.drag.ids || []);
  return false;
}

/** Move the active drag selection to a resolved drop target. */
async function moveCurrentDragToTarget(targetId, intent, context) {
  const drag = state.drag;
  state.drag = null;
  if (drag?.source === "list") return await moveSelectedListItems(targetId, intent, context, drag.ids || []);
  if (drag?.source === "tree") return await moveSelectedTreeFolders(targetId, intent, context, drag.ids || []);
}

/** Attach drag-over/drop handlers to a rendered row. */
function attachDropTarget(row, target, context) {
  row.ondragover = (e) => {
    const multiDrag = !!state.drag?.multi;
    const intent = multiDrag ? currentDragIntent(e, row, target, context) : dropIntent(e, row, target);
    if (multiDrag) {
      if (!canMoveCurrentDragToTarget(target, intent, context)) return;
    } else {
      const dragged = nodes.get(state.drag?.id || e.dataTransfer.getData("text/plain"));
      if (!validDrop(dragged, target, intent, context)) return;
    }

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropIndicator(row, intent);
  };

  row.ondragleave = () => {
    if (state.dropIndicator?.row === row) state.dropIndicator = null;
    clearDropRow(row);
  };

  row.ondrop = async (e) => {
    const multiDrag = !!state.drag?.multi;
    const intent = multiDrag ? currentDragIntent(e, row, target, context) : dropIntent(e, row, target);
    if (multiDrag) {
      if (!canMoveCurrentDragToTarget(target, intent, context)) return;
    } else {
      const draggedId = state.drag?.id || e.dataTransfer.getData("text/plain");
      const dragged = nodes.get(draggedId);
      if (!validDrop(dragged, target, intent, context)) return;
    }

    e.preventDefault();
    clearDropIndicators();
    try {
      if (multiDrag) {
        await moveCurrentDragToTarget(target.id, intent, context);
      } else {
        const draggedId = state.drag?.id || e.dataTransfer.getData("text/plain");
        state.drag = null;
        await moveWithIntent(draggedId, target.id, intent);
      }
    } catch (err) {
      console.error(err);
      alert(t("couldNotMoveBookmark", { error: err.message || err }));
      await loadTree();
    }
  };
}




// ---------------------------------------------------------------------------
// Context menus and app menu
// ---------------------------------------------------------------------------

function hideContextMenu() {
  document.querySelector(".context-menu")?.remove();
  state.contextMenu = null;
}

/** Create a context-menu button with disabled and click behavior wired consistently. */
function makeMenuItem(label, action, { disabled = false, hidden = false } = {}) {
  if (hidden) return null;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "context-menu-item";
  button.textContent = label;
  button.disabled = disabled;
  button.onclick = async () => {
    if (disabled) return;
    const context = state.contextMenu;
    hideContextMenu();
    try {
      await action(context);
    } catch (err) {
      console.error(err);
      alert(t("actionFailed", { error: err.message || err }));
      await loadTree();
    }
  };
  return button;
}

/** Create a visual separator for custom context menus. */
function makeSeparator() {
  const sep = document.createElement("div");
  sep.className = "context-menu-separator";
  sep.setAttribute("role", "separator");
  return sep;
}

/** Hide the app menu and reset its expanded button state. */
function hideAppMenu() {
  document.querySelector(".app-menu")?.remove();
  $("app-menu-button")?.setAttribute("aria-expanded", "false");
}

/** Create an app-menu button with optional disabled state and click behavior. */
function makeAppMenuItem(label, action, { disabled = false } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "app-menu-item";
  button.textContent = label;
  button.disabled = disabled;
  button.setAttribute("role", "menuitem");
  button.onclick = async () => {
    if (disabled) return;
    hideAppMenu();
    try {
      await action();
    } catch (err) {
      console.error(err);
      alert(t("actionFailed", { error: err.message || err }));
    }
  };
  return button;
}

/** Create a visual separator for the app menu. */
function makeAppMenuSeparator() {
  const sep = document.createElement("div");
  sep.className = "app-menu-separator";
  sep.setAttribute("role", "separator");
  return sep;
}

/** Open Chromium's built-in bookmarks manager in a browser tab. */
async function openDefaultBookmarksManager() {
  try {
    await api.tabs.create({ url: "chrome://bookmarks/" });
  } catch (err) {
    console.error(err);
    alert(t("couldNotOpenBookmark", { error: err.message || err }));
  }
}

/** Return whether any manager-owned modal dialog is currently visible. */
function isManagerModalOpen() {
  return !$("options-modal").hidden || !$("info-modal").hidden;
}

/** Return whether the embedded Options dialog is currently visible. */
function isOptionsDialogOpen() {
  return !$('options-modal').hidden;
}

/** Open the Options page inside the manager modal iframe. */
function showOptionsDialog() {
  hideInfoDialog();
  hideContextMenu();
  hideAppMenu();
  const modal = $('options-modal');
  const host = $('options-frame-host');
  if (!host.querySelector('iframe')) {
    const frame = document.createElement('iframe');
    frame.className = 'options-frame';
    frame.title = t("optionsTitle");
    frame.referrerPolicy = "no-referrer";
    // Do not add a sandbox here: Options needs normal extension-page privileges
    // for chrome.storage and same-origin manager log access, and Chromium warns
    // that allow-scripts + allow-same-origin makes a sandbox ineffective.
    frame.src = api.runtime.getURL('options.html?embedded=1');
    host.append(frame);
  }
  modal.hidden = false;
  $('options-close').focus();
}

/** Close and reset the embedded Options dialog. */
function hideOptionsDialog({ restoreFocus = true } = {}) {
  const modal = $('options-modal');
  if (modal.hidden) return;
  modal.hidden = true;
  $('options-frame-host').replaceChildren();
  if (restoreFocus) $('app-menu-button')?.focus();
}

/** Open the extension Options page in the in-manager dialog. */
function openOptionsPage() {
  showOptionsDialog();
}

/** Close and clear the reusable About/Help/Changelog dialog. */
function hideInfoDialog({ restoreFocus = true } = {}) {
  const modal = $("info-modal");
  if (modal.hidden) return;
  modal.hidden = true;
  $("info-content-host").replaceChildren();
  const footer = $("info-footer");
  footer.replaceChildren();
  footer.hidden = true;
  if (restoreFocus) $("app-menu-button")?.focus();
}

/** Show the reusable About/Help/Changelog dialog with already-built content. */
function showInfoDialog(title, contentNode, { footerNode = null } = {}) {
  hideOptionsDialog({ restoreFocus: false });
  hideContextMenu();
  hideAppMenu();

  const modal = $("info-modal");
  const titleNode = $("info-modal-title");
  const host = $("info-content-host");
  const footer = $("info-footer");
  titleNode.textContent = title;
  host.replaceChildren(contentNode);
  footer.replaceChildren();
  footer.hidden = !footerNode;
  if (footerNode) footer.append(footerNode);
  modal.hidden = false;
  $("info-close").focus();
}

/** Build a packaged extension-page iframe for the reusable info dialog. */
function makeInfoPageFrame(title, pagePath) {
  const frame = document.createElement("iframe");
  frame.className = "info-frame";
  frame.title = title;
  frame.referrerPolicy = "no-referrer";
  frame.src = api.runtime.getURL(pagePath);
  return frame;
}

/** Open the packaged About page in an in-manager iframe. */
function showAboutDialog() {
  showInfoDialog(t("about"), makeInfoPageFrame(t("about"), "about.html"));
}

/** Persist the launch-help setting from the Help dialog footer without console noise. */
async function setShowHelpOnLaunch(value) {
  ShowHelpOnLaunch = Boolean(value);
  try {
    await api.storage.local.set({ ShowHelpOnLaunch });
  } catch (err) {
    addSessionLogRecord("error", ["Unable to update ShowHelpOnLaunch.", err?.message || err], "SBM Manager");
  }
}

/** Build the non-scrolling Help dialog footer toggle. */
function makeHelpLaunchFooter() {
  const label = document.createElement("label");
  label.className = "info-footer-toggle";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(ShowHelpOnLaunch);
  input.addEventListener("change", () => {
    setShowHelpOnLaunch(input.checked).catch(() => {
      // setShowHelpOnLaunch records failures in the transient diagnostics log.
    });
  });
  const text = document.createElement("span");
  text.textContent = t("showAtLaunch");
  label.append(input, text);
  return label;
}

/** Open the packaged Help page in an in-manager iframe. */
function showHelpDialog() {
  showInfoDialog(t("help"), makeInfoPageFrame(t("help"), "help.html"), { footerNode: makeHelpLaunchFooter() });
}

/** Show Help once on launch, then immediately clear the flag for future launches. */
async function showLaunchHelpIfNeeded() {
  if (!ShowHelpOnLaunch) return;
  ShowHelpOnLaunch = false;
  try {
    await api.storage.local.set({ ShowHelpOnLaunch: false });
  } catch (err) {
    addSessionLogRecord("error", ["Unable to clear ShowHelpOnLaunch after showing Help.", err?.message || err], "SBM Manager");
  }
  showHelpDialog();
}

/** Append inline markdown text with minimal safe formatting to a parent node. */
function appendMarkdownInline(parent, text) {
  const tokenPattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\(([^)\s]+)\))/g;
  let lastIndex = 0;
  for (const match of text.matchAll(tokenPattern)) {
    if (match.index > lastIndex) parent.append(document.createTextNode(text.slice(lastIndex, match.index)));
    const token = match[0];

    if (token.startsWith("**")) {
      const strong = document.createElement("strong");
      strong.textContent = token.slice(2, -2);
      parent.append(strong);
    } else if (token.startsWith("`")) {
      const code = document.createElement("code");
      code.textContent = token.slice(1, -1);
      parent.append(code);
    } else {
      const labelEnd = token.indexOf("](");
      const label = token.slice(1, labelEnd);
      const href = token.slice(labelEnd + 2, -1);
      const link = document.createElement("a");
      link.textContent = label;
      try {
        const url = new URL(href, api.runtime.getURL(""));
        if (url.protocol === "https:" || url.protocol === "http:") {
          link.href = url.href;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
      } catch {
        // Keep the label as inert text when the URL is not parseable.
      }
      if (link.href) parent.append(link);
      else parent.append(document.createTextNode(label));
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parent.append(document.createTextNode(text.slice(lastIndex)));
}

/** Convert the packaged changelog markdown to DOM nodes without using innerHTML. */
function renderMarkdownDocument(markdown) {
  const root = document.createElement("article");
  root.className = "markdown-view";

  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  let list = null;
  let paragraphLines = [];
  let codeBlock = null;

  const closeList = () => {
    list = null;
  };
  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    const paragraph = document.createElement("p");
    appendMarkdownInline(paragraph, paragraphLines.join(" "));
    root.append(paragraph);
    paragraphLines = [];
  };
  const appendHeading = (level, text) => {
    const heading = document.createElement(`h${level}`);
    appendMarkdownInline(heading, text.trim());
    root.append(heading);
  };
  const appendListItem = (text) => {
    if (!list) {
      list = document.createElement("ul");
      root.append(list);
    }
    const item = document.createElement("li");
    appendMarkdownInline(item, text.trim());
    list.append(item);
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (codeBlock) {
      if (line.trim().startsWith("```")) {
        root.append(codeBlock.pre);
        codeBlock = null;
      } else {
        codeBlock.lines.push(rawLine);
        codeBlock.code.textContent = codeBlock.lines.join("\n");
      }
      continue;
    }

    if (line.trim().startsWith("```")) {
      flushParagraph();
      closeList();
      const pre = document.createElement("pre");
      const code = document.createElement("code");
      pre.append(code);
      codeBlock = { pre, code, lines: [] };
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      closeList();
      appendHeading(headingMatch[1].length, headingMatch[2]);
      continue;
    }

    const bulletMatch = /^[-*]\s+(.+)$/.exec(line);
    if (bulletMatch) {
      flushParagraph();
      appendListItem(bulletMatch[1]);
      continue;
    }

    closeList();
    paragraphLines.push(line.trim());
  }

  if (codeBlock) root.append(codeBlock.pre);
  flushParagraph();
  return root;
}

/** Fetch and display the packaged changelog in a scrollable markdown view. */
async function showChangelogDialog() {
  if (cachedChangelogMarkdown === null) {
    const response = await fetch(api.runtime.getURL("CHANGELOG.md"));
    if (!response.ok) throw new Error(`Unable to load changelog (${response.status})`);
    cachedChangelogMarkdown = await response.text();
  }
  showInfoDialog(t("changelog"), renderMarkdownDocument(cachedChangelogMarkdown));
}

/** Render the top-right app menu based on browser feature support. */
function buildAppMenu() {
  return [
    makeAppMenuItem(t("openDefaultBookmarksManager"), openDefaultBookmarksManager),
    makeAppMenuSeparator(),
    makeAppMenuItem(t("options"), openOptionsPage),
    makeAppMenuItem(t("help"), showHelpDialog),
    makeAppMenuItem(t("about"), showAboutDialog),
    makeAppMenuItem(t("changelog"), showChangelogDialog)
  ];
}

/** Toggle the app menu and lazily rebuild its items when opened. */
function toggleAppMenu() {
  const button = $("app-menu-button");
  const existing = document.querySelector(".app-menu");
  hideContextMenu();
  if (existing) {
    hideAppMenu();
    return;
  }

  const menu = document.createElement("div");
  menu.className = "app-menu";
  menu.setAttribute("role", "menu");
  menu.append(...buildAppMenu());
  document.body.append(menu);

  const margin = 8;
  const buttonRect = button.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const left = Math.min(buttonRect.right - menuRect.width, window.innerWidth - menuRect.width - margin);
  const top = Math.min(buttonRect.bottom + 4, window.innerHeight - menuRect.height - margin);
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;
  button.setAttribute("aria-expanded", "true");
  menu.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
}

/** Resolve the folder that should receive create/paste context actions. */
function contextParentId(context) {
  const item = nodes.get(context?.id);
  if (context?.kind === "folder") return item?.id || state.folderId;
  if (context?.kind === "bookmark") return item?.parentId || state.folderId;
  return state.folderId;
}

/** Return whether new bookmark items can be created at the current context. */
function canCreateAtContext(context = null) {
  const target = insertionTargetForContext(context);
  return !!target && canContainChildren(nodes.get(target.parentId));
}

/** Render context-menu actions for a folder target. */
function buildFolderMenu(context) {
  const folder = nodes.get(context.id);
  const urls = contextUrls(context);
  const pasteDisabled = !canPasteForContext(context);
  const mutable = isMutable(folder);
  const copyAllowed = !!folder && folder.id !== "0" && !isRootFolder(folder);

  return [
    makeMenuItem(t("renameFolder"), (context) => renameFolder(folder, context?.pane || "tree"), { disabled: !mutable }),
    makeMenuItem(t("deleteFolder"), (context) => deleteNode(folder, context?.pane || "tree"), { disabled: !mutable }),
    makeSeparator(),
    makeMenuItem(t("cut"), () => cutNode(folder), { disabled: !mutable }),
    makeMenuItem(t("copy"), () => copyNode(folder), { disabled: !copyAllowed }),
    makeMenuItem(t("paste"), () => pasteClipboard(context), { disabled: pasteDisabled }),
    makeSeparator(),
    makeMenuItem(t("sortByName"), () => sortFolderChildren(folder, "title"), { disabled: !canContainChildren(folder) || (folder.children || []).length < 2 }),
    makeMenuItem(t("sortByDate"), () => sortFolderChildren(folder, "dateAdded"), { disabled: !canContainChildren(folder) || (folder.children || []).length < 2 }),
    makeSeparator(),
    makeMenuItem(t("addNewBookmark"), () => createBookmarkAtTarget(context), { disabled: !canCreateAtContext(context) }),
    makeMenuItem(t("addNewFolder"), () => createFolderAtTarget(context), { disabled: !canCreateAtContext(context) }),
    makeMenuItem(t("addSeparator"), () => createSeparatorAtTarget(context), { disabled: !canCreateAtContext(context) }),
    makeSeparator(),
    makeMenuItem(t("openAllBookmarks"), () => openUrlsInCurrentWindow(urls), { disabled: urls.length === 0 }),
    makeMenuItem(t("openAllInNewWindow"), () => openUrlsInWindow(urls, false), { disabled: urls.length === 0 }),
    makeMenuItem(t("openAllInPrivateWindow"), () => openUrlsInWindow(urls, true), { disabled: urls.length === 0 }),
    makeMenuItem(t("openAllInNewTabGroup"), () => openUrlsInTabGroup(urls), { disabled: urls.length === 0, hidden: !isTabGroupSupported() }),
    makeMenuItem(t("openAllInSplitView"), () => {}, { hidden: !isSplitViewSupported() }),
    makeSeparator(),
    makeMenuItem(t("expandAll"), () => expandAllTreeFolders(folder), { disabled: !childFolders(folder).length }),
    makeMenuItem(t("collapseAll"), () => collapseAllTreeFolders(folder), { disabled: !childFolders(folder).length })
  ];
}

/** Render context-menu actions for a bookmark or separator target. */
function buildBookmarkMenu(context) {
  const bookmark = nodes.get(context.id);
  const urls = contextUrls(context);
  const pasteDisabled = !canPasteForContext(context);
  const parentId = contextParentId(context);
  const canAddToParent = canCreateAtContext(context);
  const showContainingFolderAction = canOpenContainingFolderContext(context, bookmark);

  const items = [
    makeMenuItem(t("edit"), () => editBookmark(bookmark), { disabled: !isMutable(bookmark) }),
    makeMenuItem(t("delete"), (context) => deleteNode(bookmark, context?.pane || "list"), { disabled: !isMutable(bookmark) }),
    makeSeparator(),
    makeMenuItem(t("cut"), () => cutNode(bookmark), { disabled: !isMutable(bookmark) }),
    makeMenuItem(t("copy"), () => copyNode(bookmark), { disabled: !bookmark }),
    makeMenuItem(t("paste"), () => pasteClipboard(context), { disabled: pasteDisabled }),
    makeSeparator(),
    makeMenuItem(t("copyUrlToClipboard"), () => copyBookmarkUrlToClipboard(bookmark), { disabled: !bookmark?.url || isSeparator(bookmark) }),
    makeSeparator(),
    makeMenuItem(t("addNewBookmark"), () => createBookmarkAtTarget(context), { disabled: !canAddToParent }),
    makeMenuItem(t("addNewFolder"), () => createFolderAtTarget(context), { disabled: !canAddToParent }),
    makeMenuItem(t("addSeparator"), () => createSeparatorAtTarget(context), { disabled: !canAddToParent }),
    makeSeparator(),
    makeMenuItem(t("openInNewTab"), () => openUrlsInCurrentWindow(urls), { disabled: urls.length === 0 }),
    makeMenuItem(t("openInNewWindow"), () => openUrlsInWindow(urls, false), { disabled: urls.length === 0 }),
    makeMenuItem(t("openInPrivateWindow"), () => openUrlsInWindow(urls, true), { disabled: urls.length === 0 }),
    makeMenuItem(t("openInNewTabGroup"), () => openUrlsInTabGroup(urls), { disabled: urls.length === 0, hidden: !isTabGroupSupported() }),
    makeMenuItem(t("openInSplitView"), () => {}, { hidden: !isSplitViewSupported() })
  ];

  if (showContainingFolderAction) {
    items.push(
      makeSeparator(),
      makeMenuItem(t("openContainingFolder"), () => openContainingFolderForBookmark(bookmark))
    );
  }

  return items;
}

/** Build the reduced context menu used for active multi-selections. */
function buildMultiMenu(context) {
  const urls = multiContextUrls(context);
  const pasteDisabled = !canPasteForContext(context);
  return [
    makeMenuItem(t("delete"), () => deleteSelection(context), { disabled: selectedContextIds(context).every((id) => !isMutable(nodes.get(id))) }),
    makeSeparator(),
    makeMenuItem(t("cut"), () => cutSelection(context), { disabled: selectedContextIds(context).every((id) => !isMutable(nodes.get(id))) }),
    makeMenuItem(t("copy"), () => copySelection(context), { disabled: selectedContextIds(context).length === 0 }),
    makeMenuItem(t("paste"), () => pasteClipboard(context), { disabled: pasteDisabled }),
    makeSeparator(),
    makeMenuItem(t("openAllInNewTab"), () => openUrlsInCurrentWindow(urls), { disabled: urls.length === 0 }),
    makeMenuItem(t("openAllInNewWindow"), () => openUrlsInWindow(urls, false), { disabled: urls.length === 0 }),
    makeMenuItem(t("openAllInPrivateWindow"), () => openUrlsInWindow(urls, true), { disabled: urls.length === 0 }),
    makeMenuItem(t("openAllInNewTabGroup"), () => openUrlsInTabGroup(urls), { disabled: urls.length === 0, hidden: !isTabGroupSupported() })
  ];
}

/** Render context-menu actions for empty pane space. */
function buildEmptyMenu(context) {
  const parentId = contextParentId(context);
  const parent = nodes.get(parentId);
  const canPaste = canPasteForContext(context);
  const items = [
    makeMenuItem(t("addNewBookmark"), () => createBookmarkAtTarget(context), { disabled: !canCreateAtContext(context) }),
    makeMenuItem(t("addNewFolder"), () => createFolderAtTarget(context), { disabled: !canCreateAtContext(context) }),
    makeMenuItem(t("addSeparator"), () => createSeparatorAtTarget(context), { disabled: !canCreateAtContext(context) })
  ];

  if (canPaste) {
    items.push(makeSeparator());
    items.push(makeMenuItem(t("paste"), () => pasteClipboard(context)));
  }

  return items;
}

/** Resolve pane, item, and parent context from a pointer event target. */
function contextFromEvent(e) {
  const row = e.target.closest?.(".item,.tree-row");
  if (row?.dataset?.id) {
    const item = nodes.get(row.dataset.id);
    const pane = row.classList.contains("tree-row") ? "tree" : "list";
    const clickedSelected = state.multiSelect.pane === pane && state.multiSelect.ids.has(item?.id);
    const keepExistingMulti = state.multiSelect.pane && (clickedSelected || ((e.ctrlKey || e.shiftKey) && state.multiSelect.ids.size > 1));
    if (keepExistingMulti) {
      return { kind: "multi", id: clickedSelected ? item.id : null, pane: state.multiSelect.pane, ids: [...state.multiSelect.ids] };
    }
    if (isFolder(item)) return { kind: "folder", id: item.id, pane };
    if (item) return { kind: "bookmark", id: item.id, pane };
  }
  return { kind: "empty", id: state.folderId, pane: "list" };
}


/** Show the correct custom context menu for the clicked pane/row. */
function showContextMenu(e) {
  if (isInDetailsPane(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  hideContextMenu();
  hideAppMenu();

  const context = contextFromEvent(e);
  if (context.kind !== "multi") {
    clearMultiSelect();
    if (context.id && context.kind !== "empty") setPaneSelection(context.pane, context.id, { navigate: false });
    updateSelectionHighlights();
    renderDetails();
  }
  state.contextMenu = context;
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.setAttribute("role", "menu");

  const items = context.kind === "multi"
    ? buildMultiMenu(context)
    : context.kind === "folder"
      ? buildFolderMenu(context)
      : context.kind === "bookmark"
        ? buildBookmarkMenu(context)
        : buildEmptyMenu(context);

  menu.append(...items.filter(Boolean));
  document.body.append(menu);

  const margin = 8;
  const rect = menu.getBoundingClientRect();
  const left = Math.min(e.clientX, window.innerWidth - rect.width - margin);
  const top = Math.min(e.clientY, window.innerHeight - rect.height - margin);
  menu.style.left = `${Math.max(margin, left)}px`;
  menu.style.top = `${Math.max(margin, top)}px`;
  menu.querySelector("button:not(:disabled)")?.focus({ preventScroll: true });
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/** Render one visible Library tree row. */
function renderFolderTreeNode(folder, depth = 0, cutIds = Optimisation_DOMrendering ? clipboardCutIdSet() : null) {
  const children = childFolders(folder);
  const isExpanded = state.expandedFolders.has(folder.id);
  const container = document.createElement("div");
  container.className = "tree-node";

  const row = document.createElement("div");
  row.className = "tree-row";
  row.dataset.id = folder.id;
  row.style.setProperty("--depth", depth);
  row.setAttribute("role", "treeitem");
  const treeSelected = isMultiSelectActive("tree") ? state.multiSelect.ids.has(folder.id) : folder.id === (state.treeSelectedId || state.folderId);
  row.setAttribute("aria-selected", String(treeSelected));
  applySelectionState(row, treeSelected, state.activePane === "tree");
  const isCut = Optimisation_DOMrendering
    ? cutIds?.has(folder.id)
    : state.clipboard?.mode === "cut" && clipboardItems().some((entry) => entry.id === folder.id);
  if (isCut) row.classList.add("clipboard-cut");
  if (children.length) row.setAttribute("aria-expanded", String(isExpanded));

  if (canDragTreeFolder(folder)) {
    row.draggable = true;
    row.title = t("dragFolderTitle");
    row.ondragstart = (e) => {
      const multi = isMultiSelectActive("tree") && state.multiSelect.ids.has(folder.id);
      state.drag = multi ? { ids: [...state.multiSelect.ids], source: "tree", multi: true } : { id: folder.id, source: "tree" };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", folder.id);
      row.classList.add("dragging");
    };
    row.ondragend = () => {
      state.drag = null;
      clearDropIndicators();
    };
  }

  attachDropTarget(row, folder, "tree");

  const twisty = document.createElement("button");
  twisty.className = "twisty";
  twisty.type = "button";
  twisty.disabled = children.length === 0;
  twisty.textContent = children.length ? (isExpanded ? "▾" : "▸") : "";
  twisty.title = isExpanded ? t("collapseFolderTitle") : t("expandFolderTitle");
  twisty.onclick = async (e) => {
    e.stopPropagation();
    await toggleTreeFolderFromClick(folder);
  };

  const toggleFolderOnDoubleClick = async (e) => {
    if (!children.length) return;
    e.preventDefault();
    e.stopPropagation();
    await toggleTreeFolderFromClick(folder);
  };

  const label = document.createElement("button");
  label.className = "tree-label";
  label.type = "button";
  label.setAttribute("aria-current", String(folder.id === state.folderId));
  label.title = children.length ? t("doubleClickExpandCollapseTitle") : "";
  label.onclick = (e) => handlePaneClick(e, "tree", folder);
  label.ondblclick = toggleFolderOnDoubleClick;
  row.ondblclick = toggleFolderOnDoubleClick;

  const labelContent = document.createElement("span");
  labelContent.className = "tree-label-content";
  const labelText = document.createElement("span");
  labelText.className = "tree-label-text";
  labelText.textContent = folder.title || t("rootFallback");
  labelContent.append(makeIcon(extensionIconPath("folder-16.png"), t("folderAlt")), labelText);
  label.append(labelContent);

  row.append(twisty, label);
  container.append(row);

  if (children.length && isExpanded) {
    const group = document.createElement("div");
    group.className = "tree-children";
    group.setAttribute("role", "group");
    const childRows = children.map((child) => renderFolderTreeNode(child, depth + 1, cutIds));
    if (Optimisation_DOMrendering) replaceChildrenWithFragment(group, childRows);
    else group.append(...childRows);
    container.append(group);
  }

  return container;
}

/** Render root folders in the left Library pane. */
function renderRoots() {
  ensureExpandedPath(state.folderId);
  const roots = $("roots");
  const cutIds = Optimisation_DOMrendering ? clipboardCutIdSet() : null;
  roots.setAttribute("role", "tree");
  roots.tabIndex = 0;
  const rows = rootFolders().map((folder) => renderFolderTreeNode(folder, 0, cutIds));
  if (Optimisation_DOMrendering) replaceChildrenWithFragment(roots, rows);
  else roots.replaceChildren(...rows);
}

/** Return the correct tooltip for the Details pane toggle button. */
function detailsToggleTooltip() {
  return state.detailsVisible ? t("hideDetailsPaneTooltip") : t("showDetailsPaneTooltip");
}

/** Render the breadcrumb path for the current folder. */
function renderCrumbs() {
  const path = [];
  for (let n = nodes.get(state.folderId); n && n.id !== "0"; n = n.parentNode) path.unshift(n.title || t("rootFallback"));

  const pathText = document.createElement("span");
  pathText.className = "path-text";
  pathText.textContent = path.join(" / ") || t("bookmarksPathFallback");

  const sortLabel = document.createElement("label");
  sortLabel.className = "visual-sort-label";
  sortLabel.htmlFor = "sort";
  sortLabel.textContent = t("visualSort");

  const sortSelect = $("sort");
  sortSelect.value = state.sort;

  const detailsToggle = document.createElement("button");
  detailsToggle.id = "toggle-details";
  detailsToggle.className = "details-toggle";
  detailsToggle.type = "button";
  detailsToggle.textContent = state.detailsVisible ? t("clickHideDetails") : t("clickShowDetails");
  detailsToggle.title = detailsToggleTooltip();
  detailsToggle.setAttribute("aria-pressed", String(state.detailsVisible));
  detailsToggle.onclick = toggleDetailsPane;

  const crumbs = $("crumbs");
  const crumbNodes = [pathText, sortLabel, sortSelect, detailsToggle];
  if (Optimisation_DOMrendering) replaceChildrenWithFragment(crumbs, crumbNodes);
  else crumbs.replaceChildren(...crumbNodes);
}


/** Return the element whose scroll position should be preserved for the middle pane. */
function middleScroller() {
  return $("table-scroll");
}

/** Capture the current middle-pane scroll position. */
function getMiddleScrollPosition() {
  const scroller = middleScroller();
  return scroller ? { top: scroller.scrollTop, left: scroller.scrollLeft } : { top: 0, left: 0 };
}

/** Restore a saved middle-pane scroll position. */
function setMiddleScrollPosition(position) {
  const scroller = middleScroller();
  if (!scroller) return;
  scroller.scrollTop = Math.max(0, position?.top || 0);
  scroller.scrollLeft = Math.max(0, position?.left || 0);
}

/** Restore scrolling after DOM replacement, then clear the saved position. */
function restoreMiddleScrollPosition(position) {
  setMiddleScrollPosition(position);
  requestAnimationFrame(() => setMiddleScrollPosition(position));
}

/** Render the middle bookmark/folder/separator list for the active folder. */
function renderList() {
  const scrollPosition = state.resetMiddleScrollOnNextRender ? { top: 0, left: 0 } : getMiddleScrollPosition();
  state.resetMiddleScrollOnNextRender = false;

  const cutIds = Optimisation_DOMrendering ? clipboardCutIdSet() : null;
  const rows = visibleItems().map((item) => {
    const row = document.createElement("div");
    row.className = "item";
    row.dataset.id = item.id;
    row.tabIndex = 0;
    const isCut = Optimisation_DOMrendering
      ? cutIds?.has(item.id)
      : state.clipboard?.mode === "cut" && clipboardItems().some((entry) => entry.id === item.id);
    if (isCut) row.classList.add("clipboard-cut");
    const listSelected = isMultiSelectActive("list") ? state.multiSelect.ids.has(item.id) : item.id === state.selectedId;
    applySelectionState(row, listSelected, state.activePane === "list");

    if (canDragListItem(item)) {
      row.draggable = true;
      row.title = t("dragItemTitle");
      row.ondragstart = (e) => {
        const multi = isMultiSelectActive("list") && state.multiSelect.ids.has(item.id);
        state.drag = multi ? { ids: [...state.multiSelect.ids], source: "list", multi: true } : { id: item.id, source: "list" };
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.id);
        row.classList.add("dragging");
      };
      row.ondragend = () => {
        state.drag = null;
        clearDropIndicators();
      };

    }

    attachDropTarget(row, item, "list");

    if (isSeparator(item)) {
      row.classList.add("separator-item");
      row.title = t("separator");
      const line = document.createElement("hr");
      line.className = "separator-line";
      line.setAttribute("aria-hidden", "true");
      row.append(line);
    } else {
      row.append(...visibleMidFcColumns().map((column) => cellForColumn(item, column.id)));
    }
    row.onclick = (e) => { handlePaneClick(e, "list", item); };
    row.onauxclick = (e) => { handleListAuxClick(e, item); };
    row.ondblclick = () => openOrNavigate(item);
    return row;
  });
  const list = $("list");
  list.classList.toggle("reorder-disabled", !canReorderList());
  if (Optimisation_DOMrendering) replaceChildrenWithFragment(list, rows);
  else list.replaceChildren(...rows);
  restoreMiddleScrollPosition(scrollPosition);
}

/** Refresh active/inactive selection styling without rebuilding the full panes. */
function updateSelectionHighlights() {
  $("roots").querySelectorAll(".tree-row").forEach((row) => {
    const selected = isMultiSelectActive("tree") ? state.multiSelect.ids.has(row.dataset.id) : row.dataset.id === (state.treeSelectedId || state.folderId);
    row.setAttribute("aria-selected", String(selected));
    applySelectionState(row, selected, state.activePane === "tree");
  });

  $("list").querySelectorAll(".item").forEach((row) => {
    const selected = isMultiSelectActive("list") ? state.multiSelect.ids.has(row.dataset.id) : row.dataset.id === state.selectedId;
    applySelectionState(row, selected, state.activePane === "list");
  });
}


/** Return a safe display value for optional bookmark metadata fields. */
function availableFieldValue(value) {
  return value === undefined || value === null || value === "" ? t("notAvailable") : String(value);
}

/** Format Chromium timestamp values for Details display. */
function formatBookmarkDate(value) {
  if (!value) return t("notAvailable");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("notAvailable");
  return date.toLocaleString();
}

/** Collect advanced Details values from the selected node for dirty tracking. */
function advancedDetailsSnapshot(selected = nodes.get(state.selectedId)) {
  if (!selected) return null;
  return {
    id: selected.id || "",
    guid: selected.guid || selected.uuid || "",
    dateAdded: selected.dateAdded || "",
    dateLastUsed: selected.dateLastUsed || selected.lastVisited || "",
    index: Number.isInteger(selected.index) ? String(selected.index) : ""
  };
}

/** Populate read-only/editable advanced Details controls from a node. */
function setAdvancedDetailsFields(snapshot) {
  const advanced = snapshot || advancedDetailsSnapshot();
  if (!advanced) return;
  $("advanced-id").value = availableFieldValue(advanced.id);
  $("advanced-guid").value = availableFieldValue(advanced.guid);
  $("advanced-date-added").value = formatBookmarkDate(advanced.dateAdded);
  $("advanced-date-last-used").value = formatBookmarkDate(advanced.dateLastUsed);
  $("advanced-index").value = advanced.index;
}

/** Show, hide, and disable advanced Details controls according to settings and node type. */
function syncAdvancedDetailsControls(selected = nodes.get(state.selectedId)) {
  $("advanced-details").hidden = !EnableAdvancedDetailsViewing;

  // Chromium exposes these metadata fields as read-only through the bookmarks
  // API.  The debug editing toggle currently enables only the supported
  // advanced write path: changing a node's index via chrome.bookmarks.move().
  for (const id of ["advanced-id", "advanced-guid", "advanced-date-added", "advanced-date-last-used"]) {
    $(id).readOnly = true;
  }
  $("advanced-index").readOnly = !(EnableAdvancedDetailsViewing && EnableAdvancedDetailsEditing && isMutable(selected));
}

/** Return the current advanced index field value. */
function advancedIndexValue() {
  return $("advanced-index").value.trim();
}

/** Create one parent-folder option for the Details parent selector. */
function makeParentOption(folder) {
  const opt = document.createElement("option");
  opt.value = folder.id;
  opt.textContent = folderPath(folder);
  return opt;
}

/** Create the disabled placeholder option used when the current parent is unavailable. */
function makeParentPlaceholderOption(desiredValue) {
  const placeholder = document.createElement("option");
  placeholder.value = desiredValue;
  const parentNode = nodes.get(desiredValue);
  placeholder.textContent = parentNode ? folderPath(parentNode) : t("browserRoot");
  placeholder.disabled = true;
  return placeholder;
}

/** Render valid parent-folder choices for moving the selected item. */
function renderParents(selectedValue = null) {
  const selected = nodes.get(state.selectedId);
  const parentSelect = $("parent");
  const desiredValue = selectedValue ?? parentSelect.value ?? selected?.parentId ?? "";
  const options = [...nodes.values()].filter((n) =>
    canContainChildren(n) &&
    n.id !== selected?.id &&
    !(selected && isFolder(selected) && isDescendantOf(n, selected)));

  if (Optimisation_DOMrendering) {
    const optionNodes = [];
    let hasDesiredValue = false;
    for (const folder of options) {
      const opt = makeParentOption(folder);
      if (opt.value === desiredValue) hasDesiredValue = true;
      optionNodes.push(opt);
    }

    if (desiredValue && !hasDesiredValue) {
      // Chromium root-level folders such as Bookmarks bar / Other bookmarks
      // report parentId "0".  The synthetic browser root is not a valid move
      // target, so keep a disabled placeholder option to preserve the saved
      // parent value and avoid false dirty-state / unsaved-change prompts.
      optionNodes.unshift(makeParentPlaceholderOption(desiredValue));
      hasDesiredValue = true;
    }

    replaceChildrenWithFragment(parentSelect, optionNodes);
    if (hasDesiredValue) parentSelect.value = desiredValue;
    return;
  }

  parentSelect.replaceChildren(...options.map(makeParentOption));

  if (desiredValue && ![...parentSelect.options].some((opt) => opt.value === desiredValue)) {
    // Chromium root-level folders such as Bookmarks bar / Other bookmarks
    // report parentId "0".  The synthetic browser root is not a valid move
    // target, so keep a disabled placeholder option to preserve the saved
    // parent value and avoid false dirty-state / unsaved-change prompts.
    parentSelect.prepend(makeParentPlaceholderOption(desiredValue));
  }

  if ([...parentSelect.options].some((opt) => opt.value === desiredValue)) {
    parentSelect.value = desiredValue;
  }
}


/** Render the Details pane or the Details Multiselect summary. */
function renderDetails() {
  applyDetailsPanePosition();
  $("layout").classList.toggle("details-hidden", !state.detailsVisible);
  $("details-pane").hidden = !state.detailsVisible;
  if (!state.detailsVisible) return;

  const multiActive = isMultiSelectActive(state.activePane);
  const form = $("details-form");
  const multiDetails = $("details-multiselect");
  const selected = nodes.get(state.selectedId);

  if (multiActive) {
    const stats = multiSelectionStats();
    form.hidden = true;
    $("empty-details").hidden = true;
    multiDetails.hidden = false;
    $("multi-total").textContent = String(stats.total);
    $("multi-folders").textContent = String(stats.folders);
    $("multi-bookmarks").textContent = String(stats.bookmarks);
    $("multi-separators").textContent = String(stats.separators);
    state.detailsOriginal = null;
    updateDetailsOpenBookmarkButton(null);
    return;
  }

  multiDetails.hidden = true;
  form.hidden = !selected;
  $("empty-details").hidden = !!selected;
  if (!selected) {
    state.detailsOriginal = null;
    updateDetailsOpenBookmarkButton(null);
    return;
  }

  const isSameDetailsItem = state.detailsOriginal?.id === selected.id;
  const preserveUnsavedEdits = isSameDetailsItem && hasUnsavedDetails();
  const desiredParentValue = preserveUnsavedEdits
    ? ($("parent").value || state.detailsOriginal?.parentId || selected.parentId || "")
    : (selected.parentId || "");

  $("url-label").hidden = isFolder(selected);
  $("url").hidden = isFolder(selected);
  $("url").disabled = isFolder(selected);
  $("delete").textContent = isFolder(selected) ? t("deleteFolder") : t("deleteBookmark");
  $("delete").disabled = !isMutable(selected);
  $("save").disabled = !isMutable(selected);
  $("discard").disabled = !isMutable(selected);
  renderParents(desiredParentValue);
  syncAdvancedDetailsControls(selected);

  if (!preserveUnsavedEdits) {
    state.detailsOriginal = selectedDetailsSnapshot(selected);
    $("title").value = state.detailsOriginal.title;
    $("url").value = state.detailsOriginal.url;
    $("parent").value = state.detailsOriginal.parentId;
    setAdvancedDetailsFields(state.detailsOriginal.advanced);
    updateUrlWarning();
  }

  updateUrlWarning();
  updateDetailsDirtyIndicators();
  updateDetailsOpenBookmarkButton(selected);
}

/** Return a human-readable folder path for a bookmark-tree node. */
function folderPath(folder) {
  const path = [];
  for (let n = folder; n && n.id !== "0"; n = n.parentNode) path.unshift(n.title || t("rootFallback"));
  return path.join(" / ");
}

/** Build the Details dirty-check snapshot for the current selection. */
function selectedDetailsSnapshot(selected = nodes.get(state.selectedId)) {
  if (!selected) return null;
  return {
    id: selected.id,
    isFolder: isFolder(selected),
    title: selected.title || "",
    url: selected.url || "",
    parentId: selected.parentId || "",
    advanced: advancedDetailsSnapshot(selected),
    advancedIndex: advancedDetailsSnapshot(selected)?.index || ""
  };
}

/** Store the selected item's current Details values as the clean baseline. */
function setDetailsCleanBaseline(selected = nodes.get(state.selectedId)) {
  if (!selected) {
    state.detailsOriginal = null;
    updateDetailsDirtyIndicators();
    return;
  }

  state.detailsOriginal = selectedDetailsSnapshot(selected);
  $("title").value = state.detailsOriginal.title;
  $("url").value = state.detailsOriginal.url;
  updateUrlWarning();
  renderParents(state.detailsOriginal.parentId);
  $("parent").value = state.detailsOriginal.parentId;
  setAdvancedDetailsFields(state.detailsOriginal.advanced);
  syncAdvancedDetailsControls(selected);
  updateDetailsDirtyIndicators();
  updateDetailsOpenBookmarkButton(selected);
}

/** Collect current Details form values for dirty-check comparison. */
function currentDetailsValues() {
  const selected = nodes.get(state.selectedId);
  if (!selected || !state.detailsOriginal || state.detailsOriginal.id !== selected.id) return null;
  const values = {
    id: selected.id,
    isFolder: isFolder(selected),
    title: $("title").value.trim(),
    url: isFolder(selected) ? "" : $("url").value.trim(),
    parentId: $("parent").value || ""
  };
  if (EnableAdvancedDetailsEditing) {
    values.advancedIndex = advancedIndexValue();
  }
  return values;
}

/** Return whether one Details field differs from the clean baseline. */
function detailFieldChanged(field) {
  const current = currentDetailsValues();
  const original = state.detailsOriginal;
  if (!current || !original) return false;
  return current[field] !== original[field];
}

/** Return whether the Details pane has unsaved editable changes. */
function hasUnsavedDetails() {
  const selected = nodes.get(state.selectedId);
  if (!selected || !state.detailsOriginal || state.detailsOriginal.id !== selected.id) return false;
  if (detailFieldChanged("title")) return true;
  if (!isFolder(selected) && detailFieldChanged("url")) return true;
  if (detailFieldChanged("parentId")) return true;
  if (EnableAdvancedDetailsEditing && detailFieldChanged("advancedIndex")) return true;
  return false;
}

/** Return whether the Details open button should be enabled for the selected bookmark. */
function isDetailsOpenBookmarkAllowed(selected = nodes.get(state.selectedId)) {
  return !!selected && !isFolder(selected) && !isSeparator(selected) && !!selected.url && !hasUnsavedDetails();
}

/** Synchronize the Details open button disabled state and tooltip. */
function updateDetailsOpenBookmarkButton(selected = nodes.get(state.selectedId)) {
  const button = $("open-bookmark-details");
  if (!button) return;
  const show = !!selected && !isFolder(selected) && !isSeparator(selected) && !!selected.url;
  button.hidden = !show;
  button.disabled = !show || !isDetailsOpenBookmarkAllowed(selected);
}

/** Open the selected bookmark from the Details pane after URL protection checks. */
async function openDetailsBookmark() {
  const selected = nodes.get(state.selectedId);
  if (!isDetailsOpenBookmarkAllowed(selected)) return;
  const safeUrl = safeBookmarkOpenUrl(selected.url);
  if (!safeUrl) {
    console.warn("[SBM] Blocked bookmark URL from Details open action.", { url: selected.url });
    alert(t("couldNotOpenBookmark", { error: bookmarkOpenBlockedMessage([selected.url]) }));
    return;
  }
  try {
    await api.tabs.create({ url: safeUrl });
  } catch (err) {
    console.error(err);
    alert(t("couldNotOpenBookmark", { error: err.message || err }));
  }
}

/** Mark Details fields and buttons according to unsaved-change state. */
function updateDetailsDirtyIndicators() {
  const selected = nodes.get(state.selectedId);
  const titleDirty = detailFieldChanged("title");
  const urlDirty = !isFolder(selected) && detailFieldChanged("url");
  const parentDirty = detailFieldChanged("parentId");
  const advancedIndexDirty = EnableAdvancedDetailsEditing && detailFieldChanged("advancedIndex");
  $("title-label").classList.toggle("dirty", titleDirty);
  $("url-label").classList.toggle("dirty", urlDirty);
  $("parent-label").classList.toggle("dirty", parentDirty);
  $("advanced-index-label").classList.toggle("dirty", advancedIndexDirty);
  for (const id of ["advanced-id-label", "advanced-guid-label", "advanced-date-added-label", "advanced-date-last-used-label"]) {
    $(id).classList.remove("dirty");
  }
  updateDetailsOpenBookmarkButton(selected);
}

/** Reset Details form values back to the clean selected-node baseline. */
function discardDetailsChanges() {
  const selected = nodes.get(state.selectedId);
  if (!selected || !state.detailsOriginal || state.detailsOriginal.id !== selected.id) return;
  $("title").value = state.detailsOriginal.title;
  $("url").value = state.detailsOriginal.url;
  updateUrlWarning();
  renderParents(state.detailsOriginal.parentId);
  $("parent").value = state.detailsOriginal.parentId;
  setAdvancedDetailsFields(state.detailsOriginal.advanced);
  syncAdvancedDetailsControls(selected);
  updateDetailsDirtyIndicators();
}

/** Show the modal prompt used when navigation would discard Details changes. */
function showUnsavedChangesPrompt() {
  return new Promise((resolve) => {
    hideContextMenu();

    const backdrop = document.createElement("div");
    backdrop.className = "unsaved-modal-backdrop";
    backdrop.setAttribute("role", "presentation");

    const modal = document.createElement("section");
    modal.className = "unsaved-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "unsaved-title");

    const heading = document.createElement("h3");
    heading.id = "unsaved-title";
    heading.textContent = t("unsavedChanges");

    const message = document.createElement("p");
    message.textContent = t("unsavedChangesMessage");

    const actions = document.createElement("div");
    actions.className = "unsaved-modal-actions";

    const finish = (choice) => {
      backdrop.remove();
      resolve(choice);
    };

    const keep = document.createElement("button");
    keep.type = "button";
    keep.textContent = t("keepEditing");
    keep.onclick = () => finish("keep");

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = t("save");
    save.onclick = () => finish("save");

    const discard = document.createElement("button");
    discard.type = "button";
    discard.textContent = t("discard");
    discard.onclick = () => finish("discard");

    actions.append(keep, save, discard);
    modal.append(heading, message, actions);
    backdrop.append(modal);
    document.body.append(backdrop);
    keep.focus();
  });
}

/** Ask the user what to do with dirty Details fields before selection or navigation changes. */
async function confirmUnsavedDetailsBeforeNavigation() {
  if (!hasUnsavedDetails()) return true;
  if (state.unsavedPromptActive) return false;

  state.unsavedPromptActive = true;
  try {
    const choice = await showUnsavedChangesPrompt();
    if (choice === "keep") return false;
    if (choice === "discard") {
      discardDetailsChanges();
      state.detailsOriginal = selectedDetailsSnapshot();
      return true;
    }
    if (choice === "save") {
      try {
        await saveDetailsForSelected();
        return true;
      } catch (err) {
        console.error(err);
        alert(t("couldNotSaveChanges", { error: err.message || err }));
        return false;
      }
    }
    return false;
  } finally {
    state.unsavedPromptActive = false;
  }
}

/** Return localized tooltip text for the current sort key and direction. */
function sortTooltip(key, direction = state.sortDirection) {
  if (key === "index") {
    return t("sortDefaultTooltip");
  }
  const ascending = direction === "asc";
  if (key === "title") return ascending ? t("sortNameAscTooltip") : t("sortNameDescTooltip");
  if (key === "url") return ascending ? t("sortUrlAscTooltip") : t("sortUrlDescTooltip");
  if (key === "dateAdded") return ascending ? t("sortDateAscTooltip") : t("sortDateDescTooltip");
  if (key === "id") return ascending ? t("sortIdAscTooltip") : t("sortIdDescTooltip");
  return t("sortBookmarks");
}

/** Render sortable and resizable column headers for the Folder Contents pane. */
function renderColumnHeaders() {
  const columns = document.querySelector(".columns");
  if (!columns) return;

  const headerNodes = visibleMidFcColumns().map((column) => {
    const key = column.sortKey;
    const active = state.sort === key;

    const header = document.createElement("div");
    header.className = "column-header";
    header.dataset.column = column.id;

    const button = document.createElement("button");
    button.type = "button";
    button.dataset.sortKey = key;
    button.setAttribute("aria-pressed", String(active));
    button.title = sortTooltip(key, active ? state.sortDirection : defaultSortDirection(key));
    const label = localizedColumnLabel(key);
    const arrow = active && key !== "index" ? (state.sortDirection === "asc" ? " ▲" : " ▼") : "";
    button.textContent = `${label}${arrow}`;

    const resizer = document.createElement("span");
    resizer.className = "column-resizer";
    resizer.dataset.column = column.id;
    resizer.dataset.settingKey = column.settingKey;
    resizer.setAttribute("role", "separator");
    resizer.setAttribute("aria-orientation", "vertical");
    resizer.title = t("resizeColumn");

    header.append(button, resizer);
    return header;
  });

  if (Optimisation_DOMrendering) replaceChildrenWithFragment(columns, headerNodes);
  else columns.replaceChildren(...headerNodes);
}

/** Create one Folder Contents cell for the requested visible column. */
function cellForColumn(item, columnId) {
  if (columnId === "Name") return makeTitleCell(item);
  const cell = document.createElement("span");
  cell.className = columnId === "URL" ? "url" : "muted";
  if (columnId === "URL") cell.textContent = item.url || "";
  else if (columnId === "DateAdded") cell.textContent = item.dateAdded ? new Date(item.dateAdded).toLocaleDateString() : "";
  else if (columnId === "ID") cell.textContent = item.id;
  else if (columnId === "Order") cell.textContent = Number.isInteger(item.index) ? String(item.index) : "";
  return cell;
}

/** Enable or disable Back/Forward navigation buttons. */
function renderNavButtons() {
  $("back").disabled = state.back.length === 0;
  $("forward").disabled = state.forward.length === 0;
}

/** Toggle Details visibility and re-render dependent layout and controls. */
function toggleDetailsPane() {
  state.detailsVisible = !state.detailsVisible;
  renderCrumbs();
  renderDetails();
}

/** Render all major panes. */
function render() {
  renderRoots();
  renderCrumbs();
  renderList();
  renderColumnHeaders();
  renderDetails();
  renderNavButtons();
}

// ---------------------------------------------------------------------------
// Navigation, keyboard handling, and initialization
// ---------------------------------------------------------------------------

/** Update active folder state without asynchronous unsaved-change checks. */
function performNavigate(folderId, pushHistory = true, activePane = "tree") {
  if (pushHistory && state.folderId) {
    state.back.unshift(state.folderId);
    state.forward = [];
  }
  clearMultiSelect();
  state.folderId = folderId;
  state.treeSelectedId = folderId;
  state.selectedId = folderId;
  state.activePane = activePane;
  resetFolderViewState();
  render();
}

/** Navigate to a folder after protecting unsaved Details edits. */
async function navigate(folderId, pushHistory = true, activePane = "tree") {
  if (folderId === state.folderId) {
    state.activePane = activePane;
    render();
    return;
  }
  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
  performNavigate(folderId, pushHistory, activePane);
}

/** Change selection immediately without asynchronous unsaved-change checks. */
function performSelect(id, activePane = "list") {
  clearMultiSelect();
  if (activePane === "tree") {
    state.treeSelectedId = id;
    state.selectedId = id;
  } else state.selectedId = id;
  state.activePane = activePane;
  render();
}

/** Select an item after protecting unsaved Details edits. */
async function select(id, activePane = "list") {
  if (id === paneSelectionId(activePane) && state.activePane === activePane && !isMultiSelectActive(activePane)) return;
  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
  performSelect(id, activePane);
}

/** Return row IDs that a middle-click should open from the middle pane. */
function middleClickBookmarkOpenIds(item) {
  if (!item?.id) return [];
  if (state.multiSelect.pane === "list" && state.multiSelect.ids.has(item.id)) {
    return orderedIdsForPane([...state.multiSelect.ids], "list");
  }
  return [item.id];
}

/**
 * Open direct bookmark URLs on middle-click in the middle pane.  Folders and
 * separators are ignored so the gesture matches normal bookmark-list behavior.
 */
function handleListAuxClick(e, item) {
  if (e.button !== 1) return;
  e.preventDefault();
  e.stopPropagation();

  if (!item || isFolder(item) || isSeparator(item) || !item.url) return;
  const urls = directBookmarkUrlsForIds(middleClickBookmarkOpenIds(item));
  if (urls.length) openUrlsInCurrentWindow(urls);
}

/** Open bookmarks in a new tab or navigate into folders. */
function openOrNavigate(item) {
  if (isFolder(item)) {
    const targetPane = state.activePane === "list" ? "list" : "tree";
    navigate(item.id, true, targetPane);
  } else if (item.url && !isSeparator(item)) {
    const safeUrl = safeBookmarkOpenUrl(item.url);
    if (!safeUrl) {
      console.warn("[SBM] Blocked bookmark URL from row open action.", { id: item.id, url: item.url });
      alert(t("couldNotOpenBookmark", { error: bookmarkOpenBlockedMessage([item.url]) }));
      return;
    }
    api.tabs.create({ url: safeUrl }).catch((err) => {
      console.error(err);
      alert(t("couldNotOpenBookmark", { error: err.message || err }));
    });
  }
}

/** Persist Details pane edits for the selected bookmark/folder. */
async function saveDetailsForSelected() {
  const selected = nodes.get(state.selectedId);
  if (!selected || !isMutable(selected)) return;

  const selectedId = selected.id;
  const title = sanitizeBookmarkTitle($("title").value, selected.title || selected.url || "");
  const url = sanitizeBookmarkUrl($("url").value);
  const parentId = $("parent").value;
  const requestedIndex = EnableAdvancedDetailsEditing ? Number.parseInt(advancedIndexValue(), 10) : NaN;
  const hasRequestedIndex = EnableAdvancedDetailsEditing && Number.isInteger(requestedIndex) && requestedIndex >= 0;

  const changes = isFolder(selected) ? { title } : { title, url };
  if (!isFolder(selected) && !isValidBookmarkUrl(url)) {
    showUrlValidationError(url);
    return;
  }

  // Prevent intermediate bookmark events from re-rendering the Details pane
  // between the update and optional move.  The clean baseline is rebuilt once
  // from Chromium's refreshed bookmark tree after all save work finishes.
  state.suppressBookmarkEvents = true;
  try {
    const freshBeforeSave = await getFreshBookmarkNode(selectedId);
    if (!freshBeforeSave) {
      await loadTree();
      return;
    }

    const saved = await tryBookmarkMutation(t("mutationSaveDetailsUpdate"), "update", selectedId, changes);
    if (!saved) {
      await loadTree();
      return;
    }
    let moveDetails = {};
    const destinationParentId = validFolderId(parentId) ? parentId : selected.parentId;
    if (destinationParentId && destinationParentId !== selected.parentId) moveDetails.parentId = destinationParentId;
    if (hasRequestedIndex) {
      const normalizedIndex = normalizeMoveIndex(destinationParentId, requestedIndex);
      if (Number.isInteger(normalizedIndex) && String(normalizedIndex) !== String(selected.index ?? "")) {
        moveDetails.index = normalizedIndex;
      }
    }
    if (Object.keys(moveDetails).length) {
      moveDetails = { ...(safeMoveDetails(destinationParentId, moveDetails.index) || {}), ...moveDetails };
      if (moveDetails.parentId || Number.isInteger(moveDetails.index)) {
        const moved = await tryBookmarkMutation(t("mutationSaveDetailsMove"), "move", selectedId, moveDetails);
        if (!moved) {
          await loadTree();
          return;
        }
      }
    }
  } finally {
    state.suppressBookmarkEvents = false;
  }

  state.selectedId = selectedId;
  state.detailsOriginal = null;
  await loadTree();

  const freshSelected = nodes.get(selectedId);
  if (freshSelected) {
    state.selectedId = selectedId;
    setDetailsCleanBaseline(freshSelected);
    renderDetails();
  }
}

/** Handle the Details form submit action and surface save failures. */
async function saveSelected(e) {
  e.preventDefault();
  try {
    await saveDetailsForSelected();
  } catch (err) {
    console.error(err);
    alert(t("couldNotSaveChanges", { error: err.message || err }));
  }
}

/** Delete the currently selected node from the active pane context. */
async function removeSelected() {
  await deleteNode(nodes.get(state.selectedId), state.activePane === "details" ? "details" : state.activePane);
}

/** Toolbar wrapper for creating a folder at the active target. */
async function createFolder() {
  await createFolderAtTarget();
}

/** Toolbar wrapper for creating a bookmark at the active target. */
async function createBookmark() {
  await createBookmarkAtTarget();
}

/** Navigate backward through SBM's folder history after dirty-checking Details. */
async function goBack() {
  const id = state.back[0];
  if (!id) return;
  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
  state.back.shift();
  state.forward.unshift(state.folderId);
  performNavigate(id, false, "tree");
}

/** Navigate forward through SBM's folder history after dirty-checking Details. */
async function goForward() {
  const id = state.forward[0];
  if (!id) return;
  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
  state.forward.shift();
  state.back.unshift(state.folderId);
  performNavigate(id, false, "tree");
}

/** Handle Mouse4/Mouse5 navigation without triggering browser history too. */
function handleMouseHistoryButton(e) {
  // Mouse4/Mouse5 are commonly exposed as button 3/4 in Chromium.
  // Chromium can fire both mousedown and auxclick for the same side-button
  // press. Navigate only once on mousedown, but still cancel auxclick so the
  // browser's built-in history action does not also run.
  if (e.button !== 3 && e.button !== 4) return;

  e.preventDefault();
  e.stopPropagation();

  if (e.type !== "mousedown") return;
  if (e.button === 3) goBack();
  if (e.button === 4) goForward();
}

/** Return whether keyboard shortcuts should defer to an editable text control. */
function isEditingTextField(element) {
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName?.toLowerCase?.();
  return tag === "input" || tag === "textarea" || tag === "select";
}

/** Move focus back to the pane that owns the current keyboard context. */
function focusActivePane() {
  const target = state.activePane === "tree" ? $("roots") : state.activePane === "list" ? $("list") : null;
  target?.focus?.({ preventScroll: true });
}

/** Scroll the focused selection into view after keyboard navigation. */
function scrollActiveSelectionIntoView() {
  const selector = state.activePane === "tree"
    ? `.tree-row[data-id="${CSS.escape(state.folderId || "")}"]`
    : `.item[data-id="${CSS.escape(state.selectedId || "")}"]`;
  const element = document.querySelector(selector);
  element?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}

/** Handle Library tree left/right arrow behavior. */
async function handleTreeHorizontalNavigation(direction) {
  if (state.activePane !== "tree") return false;
  const folder = nodes.get(paneSelectionId("tree"));
  if (!folder) return false;
  const children = childFolders(folder);

  if (direction === "left") {
    if (children.length && state.expandedFolders.has(folder.id)) {
      state.expandedFolders.delete(folder.id);
      renderRoots();
      focusActivePane();
      scrollActiveSelectionIntoView();
      return true;
    }

    if (folder.parentNode && folder.parentNode.id !== "0") {
      await navigate(folder.parentNode.id, true, "tree");
      focusActivePane();
      scrollActiveSelectionIntoView();
      return true;
    }
    return false;
  }

  if (direction === "right") {
    if (!children.length) return false;
    if (!state.expandedFolders.has(folder.id)) {
      state.expandedFolders.add(folder.id);
      renderRoots();
      focusActivePane();
      scrollActiveSelectionIntoView();
      return true;
    }

    await navigate(children[0].id, true, "tree");
    focusActivePane();
    scrollActiveSelectionIntoView();
    return true;
  }

  return false;
}

/** Return visible folders under a root, respecting expanded/collapsed state. */
function visibleTreeFoldersForRoot(rootFolder) {
  const out = [];
  const maps = tempBookmarkTreeMaps();
  const visit = (folder) => {
    out.push(folder);
    if (state.expandedFolders.has(folder.id)) {
      for (const child of childFolders(folder, maps)) visit(child);
    }
  };
  if (rootFolder) visit(rootFolder);
  return out;
}

/** Return the top-level root that owns a folder. */
function rootFolderFor(folder) {
  let current = folder;
  while (current?.parentNode && current.parentNode.id !== "0") current = current.parentNode;
  return current || null;
}

/** Handle Library Home/End behavior inside the current root tree. */
async function moveTreeSelectionToBoundary(position) {
  if (state.activePane !== "tree") return false;

  const roots = rootFolders();
  if (!roots.length) return false;

  const current = nodes.get(paneSelectionId("tree"));
  if (!current) {
    const folders = visibleTreeFolders();
    const next = position === "end" ? folders[folders.length - 1] : folders[0];
    if (!next) return false;
    await navigate(next.id, true, "tree");
    focusActivePane();
    scrollActiveSelectionIntoView();
    return true;
  }

  const currentRoot = rootFolderFor(current);
  const currentRootIndex = roots.findIndex((folder) => folder.id === currentRoot?.id);
  if (currentRootIndex < 0) return false;

  let next = null;
  if (position === "home") {
    if (current.id === currentRoot.id) {
      next = roots[currentRootIndex - 1] || null;
    } else {
      next = currentRoot;
    }
  } else {
    const currentRootVisible = visibleTreeFoldersForRoot(currentRoot);
    const currentRootLast = currentRootVisible[currentRootVisible.length - 1] || null;
    if (currentRootLast && current.id !== currentRootLast.id) {
      next = currentRootLast;
    } else {
      const nextRoot = roots[currentRootIndex + 1] || null;
      const nextRootVisible = visibleTreeFoldersForRoot(nextRoot);
      next = nextRootVisible[nextRootVisible.length - 1] || nextRoot;
    }
  }

  if (!next || next.id === paneSelectionId("tree")) return false;
  await navigate(next.id, true, "tree");
  focusActivePane();
  scrollActiveSelectionIntoView();
  return true;
}

/** Move Folder Contents selection to first/last visible item. */
async function moveListSelectionToBoundary(position) {
  if (state.activePane !== "list") return false;
  const items = visibleItems();
  if (!items.length) return false;
  const next = position === "end" ? items[items.length - 1] : items[0];
  if (!next || (next.id === state.selectedId && state.activePane === "list")) return false;
  await select(next.id, "list");
  focusActivePane();
  scrollActiveSelectionIntoView();
  return true;
}

/** Backspace behavior: move up one folder level when valid. */
async function navigateUpFolderNode() {
  let folder = null;
  let targetPane = state.activePane;

  if (state.activePane === "tree") {
    folder = nodes.get(paneSelectionId("tree"));
    targetPane = "tree";
  } else if (state.activePane === "list") {
    folder = nodes.get(state.folderId);
    targetPane = "list";
  } else {
    return false;
  }

  const parent = folder?.parentNode;
  if (!parent || parent.id === "0") return false;
  await navigate(parent.id, true, targetPane);
  focusActivePane();
  scrollActiveSelectionIntoView();
  return true;
}

/** Focus and select the search box for keyboard access. */
function focusSearchField() {
  const search = $("search");
  search.focus({ preventScroll: true });
  search.select?.();
}

/** Move Library tree selection by one visible folder. */
async function moveTreeSelection(delta) {
  const folders = visibleTreeFolders();
  if (!folders.length) return false;
  let currentIndex = folders.findIndex((folder) => folder.id === paneSelectionId("tree"));
  if (currentIndex < 0) currentIndex = delta > 0 ? -1 : folders.length;
  const nextIndex = Math.max(0, Math.min(folders.length - 1, currentIndex + delta));
  const next = folders[nextIndex];
  if (!next || next.id === paneSelectionId("tree")) return false;
  await navigate(next.id, true, "tree");
  focusActivePane();
  scrollActiveSelectionIntoView();
  return true;
}

/** Move Folder Contents selection by one visible item. */
async function moveListSelection(delta) {
  const items = visibleItems();
  if (!items.length) return false;
  let currentIndex = items.findIndex((item) => item.id === state.selectedId);
  if (currentIndex < 0 || nodes.get(state.selectedId)?.parentId !== state.folderId) {
    currentIndex = delta > 0 ? -1 : items.length;
  }
  const nextIndex = Math.max(0, Math.min(items.length - 1, currentIndex + delta));
  const next = items[nextIndex];
  if (!next || (next.id === state.selectedId && state.activePane === "list")) return false;
  await select(next.id, "list");
  focusActivePane();
  scrollActiveSelectionIntoView();
  return true;
}


/** Open the correct editor for the currently selected folder or bookmark. */
async function editSelectedItemWithKeyboard() {
  const item = state.activePane === "tree" ? nodes.get(paneSelectionId("tree")) : nodes.get(state.selectedId);
  if (!item || !isMutable(item)) return false;
  if (isFolder(item)) {
    await renameFolder(item, state.activePane === "list" ? "list" : "tree");
    return true;
  }
  if (isSeparator(item) || !item.url) return false;
  await editBookmark(item, { initialFocus: "title" });
  return true;
}

/** Open or navigate the current keyboard selection. */
async function openKeyboardSelection() {
  if (state.activePane === "tree") {
    const folder = nodes.get(paneSelectionId("tree"));
    if (!folder) return false;
    await navigate(folder.id, true, "tree");
    focusActivePane();
    return true;
  }
  if (state.activePane === "list") {
    const item = nodes.get(state.selectedId);
    if (!item || item.parentId !== state.folderId) return false;
    openOrNavigate(item);
    return true;
  }
  return false;
}

/** Dispatch keyboard navigation for panes, search focus, and details-safe contexts. */
async function handleKeyboardNavigation(e) {
  if (e.defaultPrevented) return false;

  if (e.ctrlKey && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "f") {
    e.preventDefault();
    e.stopPropagation();
    focusSearchField();
    return true;
  }

  if (isEditingTextField(e.target)) return false;
  if (!["F2", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter", "Backspace"].includes(e.key)) return false;

  if (isMultiSelectActive(state.activePane)) {
    const pane = state.activePane;
    const focusId = state.multiSelect.focusId;
    clearMultiSelect();
    setPaneSelection(pane, focusId, { navigate: false });
  }

  let handled = false;
  if (e.key === "F2") handled = await editSelectedItemWithKeyboard();
  if (e.key === "ArrowLeft") handled = await handleTreeHorizontalNavigation("left");
  if (e.key === "ArrowRight") handled = await handleTreeHorizontalNavigation("right");
  if (e.key === "ArrowUp") handled = state.activePane === "tree" ? await moveTreeSelection(-1) : state.activePane === "list" ? await moveListSelection(-1) : false;
  if (e.key === "ArrowDown") handled = state.activePane === "tree" ? await moveTreeSelection(1) : state.activePane === "list" ? await moveListSelection(1) : false;
  if (e.key === "Home") handled = state.activePane === "tree" ? await moveTreeSelectionToBoundary("home") : state.activePane === "list" ? await moveListSelectionToBoundary("home") : false;
  if (e.key === "End") handled = state.activePane === "tree" ? await moveTreeSelectionToBoundary("end") : state.activePane === "list" ? await moveListSelectionToBoundary("end") : false;
  if (e.key === "Enter") handled = await openKeyboardSelection();
  if (e.key === "Backspace") handled = await navigateUpFolderNode();

  if (handled) {
    e.preventDefault();
    e.stopPropagation();
  }
  return handled;
}

/** Delete key behavior for single or multi-selected rows. */
async function handleKeyboardDelete(e) {
  if (!KeyboardDeleteAllow) return;
  if (e.defaultPrevented || isEditingTextField(e.target)) return;
  if (e.key !== "Delete") return;

  const sourcePane = state.activePane;
  if (isMultiSelectActive(sourcePane)) {
    e.preventDefault();
    e.stopPropagation();
    await deleteSelection({ kind: "multi", pane: sourcePane, ids: [...state.multiSelect.ids] });
    return;
  }

  let selected = null;
  if (sourcePane === "list") {
    selected = nodes.get(state.selectedId);
  } else if (sourcePane === "tree") {
    selected = nodes.get(paneSelectionId("tree"));
  } else {
    return;
  }
  if (!selected || !isMutable(selected)) return;

  e.preventDefault();
  e.stopPropagation();
  await deleteNode(selected, sourcePane);
}

/** Refresh option tooltips for the Folder Contents sort selector. */
function setSortSelectTooltips() {
  const labels = {
    index: sortTooltip("index"),
    title: t("sortSelectTitleTitle"),
    url: t("sortSelectUrlTitle"),
    dateAdded: t("sortSelectDateAddedTitle"),
    id: t("sortSelectIdTitle")
  };

  for (const option of $("sort").options) {
    option.title = labels[option.value] || t("sortBookmarks");
  }
}

$("back").onclick = goBack;
$("forward").onclick = goForward;
$("search").oninput = (e) => {
  state.search = e.target.value;
  renderList();
};

$("search-limit").checked = SearchLimitToFolderAndSub;
$("search-limit").onchange = async (e) => {
  await saveSetting("SearchLimitToFolderAndSub", e.target.checked);
};
$("sort").onchange = (e) => {
  state.sort = e.target.value;
  state.sortDirection = defaultSortDirection(state.sort);
  renderList();
  renderColumnHeaders();
};

/** Apply a column-header sort request to Folder Contents. */
function setFolderContentsSort(key) {
  if (key === "index") {
    // Same behavior as the toolbar's "Default" entry: show Chromium's
    // persisted child order exactly as returned by chrome.bookmarks.
    state.sort = "index";
    state.sortDirection = "asc";
  } else if (state.sort === key) {
    state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
  } else {
    state.sort = key;
    state.sortDirection = defaultSortDirection(key);
  }
  $("sort").value = state.sort;
  renderList();
  renderColumnHeaders();
}

/** Start resizing a Folder Contents column and persist the final width. */
function beginFolderContentsColumnResize(e) {
  const resizer = e.target.closest(".column-resizer");
  if (!resizer) return false;

  e.preventDefault();
  e.stopPropagation();

  const settingKey = resizer.dataset.settingKey;
  const column = resizer.dataset.column;
  const minWidth = MID_FC_COLUMN_MIN_WIDTHS[column] || 48;
  const startX = e.clientX;
  const startWidth = Number(midFcSettingValue(settingKey)) || minWidth;
  let latestWidth = startWidth;

  document.body.classList.add("column-resizing");

  const onMove = (moveEvent) => {
    const nextWidth = Math.max(minWidth, Math.round(startWidth + moveEvent.clientX - startX));
    if (nextWidth === latestWidth) return;
    latestWidth = nextWidth;
    applySettings({ [settingKey]: nextWidth }, { render: false });
  };

  const onUp = async () => {
    document.body.classList.remove("column-resizing");
    window.removeEventListener("mousemove", onMove, true);
    window.removeEventListener("mouseup", onUp, true);
    try {
      await saveSetting(settingKey, latestWidth);
    } catch (err) {
      console.error(err);
      alert(t("actionFailed", { error: err.message || err }));
    }
    renderColumnHeaders();
  };

  window.addEventListener("mousemove", onMove, true);
  window.addEventListener("mouseup", onUp, true);
  return true;
}

$("left-pane-resizer").addEventListener("mousedown", (e) => beginPaneResize(e, "left"));
$("right-pane-resizer").addEventListener("mousedown", (e) => beginPaneResize(e, "right"));
$("left-pane-resizer").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault();
  nudgePaneWidth("left", e.key === "ArrowRight" ? 10 : -10);
});
$("right-pane-resizer").addEventListener("keydown", (e) => {
  const isBottomDetails = DetailsPanePosition === "bottom";
  const growKey = isBottomDetails ? "ArrowUp" : "ArrowLeft";
  const shrinkKey = isBottomDetails ? "ArrowDown" : "ArrowRight";
  if (e.key !== growKey && e.key !== shrinkKey) return;
  e.preventDefault();
  nudgePaneWidth("right", e.key === growKey ? 10 : -10);
});

$("table-scroll").addEventListener("mousedown", (e) => {
  beginFolderContentsColumnResize(e);
});

document.querySelector(".columns").addEventListener("click", (e) => {
  const button = e.target.closest("button[data-sort-key]");
  if (!button) return;
  setFolderContentsSort(button.dataset.sortKey);
});

$("app-menu-button").onclick = (e) => {
  e.stopPropagation();
  toggleAppMenu();
};
$("options-close").onclick = hideOptionsDialog;
$("options-modal").addEventListener("mousedown", (e) => {
  if (e.target === $("options-modal")) hideOptionsDialog();
});
$("info-close").onclick = hideInfoDialog;
$("info-modal").addEventListener("mousedown", (e) => {
  if (e.target === $("info-modal")) hideInfoDialog();
});
$("roots").addEventListener("focusin", () => { state.activePane = "tree"; updateSelectionHighlights(); });
$("list").addEventListener("focusin", () => { state.activePane = "list"; updateSelectionHighlights(); });
$("details-form").addEventListener("focusin", () => { state.activePane = "details"; updateSelectionHighlights(); });
$("details-form").onsubmit = saveSelected;
$("discard").onclick = discardDetailsChanges;
$("delete").onclick = removeSelected;
$("open-bookmark-details").onclick = openDetailsBookmark;
for (const id of ["title", "url", "parent", "advanced-index"]) {
  $(id).addEventListener("input", updateDetailsDirtyIndicators);
  $(id).addEventListener("change", updateDetailsDirtyIndicators);
}
$("url").addEventListener("input", updateUrlWarning);
$("url").addEventListener("change", updateUrlWarning);
$("new-folder").onclick = createFolder;
$("new-bookmark").onclick = createBookmark;
document.addEventListener("dragover", (e) => {
  if (state.drag) e.preventDefault();
});
document.addEventListener("drop", clearDropIndicators);
window.addEventListener("mousedown", handleMouseHistoryButton, { capture: true });
window.addEventListener("auxclick", handleMouseHistoryButton, { capture: true });
window.addEventListener("contextmenu", showContextMenu, { capture: true });
window.addEventListener("click", (e) => {
  if (!e.target.closest?.(".context-menu")) hideContextMenu();
  if (!e.target.closest?.(".app-menu") && !e.target.closest?.("#app-menu-button")) hideAppMenu();
});
window.addEventListener("resize", () => { hideContextMenu(); hideAppMenu(); });
window.addEventListener("pagehide", () => { clearManagerInstanceIfCurrent(); });
window.addEventListener("scroll", () => { hideContextMenu(); hideAppMenu(); }, true);
window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    if (isManagerModalOpen()) {
      hideOptionsDialog();
      hideInfoDialog();
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    hideContextMenu();
    hideAppMenu();
    if (cancelMultiSelectToFocus()) {
      e.preventDefault();
      e.stopPropagation();
    }
    return;
  }
  if (await handleKeyboardNavigation(e)) return;
  handleKeyboardDelete(e);
});

setSortSelectTooltips();

api.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName !== "local") return;
  const updated = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (Object.prototype.hasOwnProperty.call(changes, key)) updated[key] = changes[key].newValue;
  }
  if (!Object.keys(updated).length) return;
  const languageChanged = Object.prototype.hasOwnProperty.call(updated, "UserInterfaceLanguage");
  applySettings(updated, { render: false });
  if (languageChanged) {
    await setI18nLanguage(UserInterfaceLanguage);
    localizeStaticUi();
  }
  render();
});

// Keep the view live, mirroring Firefox Places' model/view update pattern.
for (const eventName of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered"]) {
  api.bookmarks[eventName].addListener(() => { if (!state.suppressBookmarkEvents) loadTree(); });
}

/** Main startup routine. */
async function init() {
  await registerManagerInstance();
  await loadSettings();
  await loadTree({ renderNow: false });
  await applyInitialFolderPreference();
  render();
  await showLaunchHelpIfNeeded();
}

init().catch((err) => {
  console.error(err);
  alert(t("managerFailed", { error: err.message || err }));
});
