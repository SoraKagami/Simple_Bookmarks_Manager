/**
 * Simple Bookmarks Manager main page controller.
 *
 * This file owns the bookmark tree state, pane rendering, details editing,
 * custom context menus, keyboard navigation, drag/drop, and bookmark mutation
 * calls.  The code intentionally keeps DOM text assignment on textContent and
 * uses a small i18n helper for all user-facing strings.
 */
import { applyI18n, setI18nLanguage, t } from "./i18n.js";
import { DEFAULT_SETTINGS, fontFamilyCss, normalizeSettingValue } from "./settings.js";

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
let UserInterfaceLanguage = DEFAULT_SETTINGS.UserInterfaceLanguage;
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
let Optimisation_TempBookmarkTreeMaps = DEFAULT_SETTINGS.Optimisation_TempBookmarkTreeMaps;

// ---------------------------------------------------------------------------
// Settings and localization
// ---------------------------------------------------------------------------

function applyUserInterfaceSettings() {
  document.documentElement.style.setProperty("--sbm-ui-font-family", fontFamilyCss(UserInterfaceFontFamily));
  document.documentElement.style.setProperty("--sbm-ui-font-size", `${UserInterfaceFontSize}px`);
  document.documentElement.style.setProperty("--sbm-ui-line-height", String(UserInterfaceLineSpacing));
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
    if (key === "UserInterfaceLanguage") UserInterfaceLanguage = value;
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
    else if (key === "Optimisation_TempBookmarkTreeMaps") Optimisation_TempBookmarkTreeMaps = value;
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

function localizedColumnLabel(key) {
  if (key === "title") return t("sortName");
  if (key === "url") return t("sortUrl");
  if (key === "dateAdded") return t("sortDateAddedHeader");
  if (key === "id") return t("sortId");
  if (key === "index") return t("sortOrder");
  return key;
}

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

function tempBookmarkTreeMaps() {
  return Optimisation_TempBookmarkTreeMaps && state.tree ? buildTempBookmarkTreeMaps(state.tree) : null;
}

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

function stripControlChars(value) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F-\u009F]/gu, " ");
}

function sanitizeBookmarkTitle(value, fallback = "") {
  const cleaned = stripControlChars(value).trim();
  return cleaned || fallback;
}

function sanitizeBookmarkUrl(value) {
  return stripControlChars(value).trim();
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

function isValidBookmarkUrl(rawValue) {
  return !bookmarkUrlBlockingProblem(rawValue);
}

function showUrlValidationError(rawValue) {
  const warning = $("url-warning");
  const message = bookmarkUrlBlockingProblem(rawValue) || bookmarkUrlProblem(rawValue);
  if (warning && message) {
    warning.textContent = message;
    warning.hidden = false;
  }
  return message;
}

function urlValidationMessage(rawValue) {
  return bookmarkUrlProblem(rawValue);
}

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
function showBookmarkEditorDialog({ heading, title = "", url = "https://", submitLabel = t("save") } = {}) {
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

    backdrop.addEventListener("mousedown", (e) => {
      if (e.target === backdrop) finish(null);
    });
    modal.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(null);
      }
    });

    actions.append(cancel, submit);
    form.append(nameLabel, urlLabel, warning, actions);
    modal.append(headingEl, form);
    backdrop.append(modal);
    document.body.append(backdrop);
    updateWarning();
    urlInput.focus();
    urlInput.select();
  });
}

function validNodeId(id) {
  return typeof id === "string" && nodes.has(id);
}

function validMutableNodeId(id) {
  return validNodeId(id) && isMutable(nodes.get(id));
}

function validFolderId(id) {
  return validNodeId(id) && canContainChildren(nodes.get(id));
}

function safeMoveDetails(parentId, index = null) {
  if (!validFolderId(parentId)) return null;
  const details = { parentId };
  const safeIndex = normalizeMoveIndex(parentId, index);
  if (Number.isInteger(safeIndex)) details.index = safeIndex;
  return details;
}

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

function extensionIconPath(name) {
  return api.runtime.getURL(`icons/${name}`);
}

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

function makeIcon(src, alt = "") {
  const img = document.createElement("img");
  img.className = "row-icon";
  img.alt = alt;
  img.src = src;
  img.width = 16;
  img.height = 16;
  img.loading = "lazy";
  img.decoding = "async";
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

function replaceChildrenWithFragment(element, children) {
  const fragment = document.createDocumentFragment();
  for (const child of children) fragment.append(child);
  element.replaceChildren(fragment);
}

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

function isRootFolder(node) {
  return !!node && node.parentId === "0";
}

function canContainChildren(node) {
  return isFolder(node) && node.id !== "0" && !node.unmodifiable && node.folderType !== "managed";
}

function isMutable(node) {
  // Chrome forbids modifying the root, special root children, and managed folders.
  return (canContainChildren(node) && !isRootFolder(node)) || (!!node && !isFolder(node) && !node.unmodifiable);
}

function isReorderable(node) {
  return isMutable(node) && !isRootFolder(node);
}

function canDragListItem(node) {
  // Items can always be dragged to a folder. Before/after reordering is
  // separately gated by canReorderList() in validDrop().
  return isReorderable(node);
}

function canDragTreeFolder(node) {
  return isFolder(node) && isReorderable(node);
}

function canReorderList() {
  // Drag order only makes sense in the natural direct-child order.
  return !state.search && state.sort === "index";
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

function rootFolders() {
  const maps = tempBookmarkTreeMaps();
  if (maps) return maps.rootFolders;
  return (state.tree?.children || []).filter(isFolder);
}

function defaultFolderId() {
  return rootFolders()[0]?.id || state.tree?.id || null;
}

function childFolders(folder) {
  return (folder.children || []).filter(isFolder);
}

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

function ensureExpandedPath(folderId) {
  for (let n = nodes.get(folderId)?.parentNode; n && n.id !== "0"; n = n.parentNode) {
    state.expandedFolders.add(n.id);
  }
}

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

function paneSelectionId(pane) {
  return pane === "tree" ? (state.treeSelectedId || state.folderId) : state.selectedId;
}

function isMultiSelectActive(pane = state.activePane) {
  return state.multiSelect.pane === pane && state.multiSelect.ids.size > 1;
}

/** Clear any active multi-selection without changing the normal single selection. */
function clearMultiSelect() {
  state.multiSelect = { pane: null, ids: new Set(), anchorId: null, focusId: null };
}

function selectionIdsForPane(pane) {
  if (isMultiSelectActive(pane)) return [...state.multiSelect.ids].filter((id) => nodes.has(id));
  const id = paneSelectionId(pane);
  return id && nodes.has(id) ? [id] : [];
}

function orderedIdsForPane(ids, pane) {
  const wanted = new Set(ids);
  return paneItems(pane).filter((item) => wanted.has(item.id)).map((item) => item.id);
}

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

function isInDetailsPane(element) {
  return !!element?.closest?.("#details-pane");
}

function folderUrls(folder) {
  const urls = [];
  const visit = (node) => {
    for (const child of node.children || []) {
      if (child.url) {
        if (!isSeparator(child)) urls.push(child.url);
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
  const created = await bookmarks("create", createDetails);
  for (const child of clean.children || []) {
    await createFromSnapshot(child, created.id);
  }
  return created;
}


function selectedContextIds(context = state.contextMenu) {
  if (context?.kind === "multi") return orderedIdsForPane(context.ids || [], context.pane);
  return context?.id ? [context.id] : [];
}

function selectionUrls(ids) {
  const urls = [];
  for (const id of ids) {
    const item = nodes.get(id);
    if (!item) continue;
    if (isFolder(item)) urls.push(...folderUrls(item));
    else if (item.url && !isSeparator(item)) urls.push(item.url);
  }
  return urls;
}

function multiContextUrls(context) {
  return selectionUrls(selectedContextIds(context));
}

function clipboardItems(clipboard = state.clipboard) {
  if (!clipboard) return [];
  if (clipboard.items) return clipboard.items;
  if (clipboard.mode === "cut" && clipboard.id) return [{ id: clipboard.id }];
  if (clipboard.mode === "copy" && clipboard.snapshot) return [{ snapshot: clipboard.snapshot }];
  return [];
}

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


function canPasteForContext(context) {
  const target = pasteTargetForContext(context);
  if (!target || !target.parent || !canPasteInto(target.parent)) return false;
  if (state.clipboard?.mode === "cut" && clipboardItems().some((entry) => entry.id === context?.id)) return false;
  return true;
}

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
        await bookmarks("move", node.id, moveDetails);
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


function naturalNameSortGroup(node) {
  if (isFolder(node)) return 0;
  if (isSeparator(node)) return 1;
  return 2;
}

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
      await bookmarks("move", sorted[i].id, { parentId: folder.id, index: i });
    }
  } finally {
    state.suppressBookmarkEvents = false;
  }
  state.folderId = folder.id;
  state.selectedId = folder.id;
  await loadTree();
}

async function openUrlsInCurrentWindow(urls) {
  for (const [i, url] of urls.entries()) {
    await api.tabs.create({ url, active: i === 0 });
  }
}

async function openUrlsInWindow(urls, incognito = false) {
  try {
    await api.windows.create({ url: urls, incognito });
  } catch (err) {
    alert(t("couldNotOpenWindow", { windowType: incognito ? t("privateWindowType") : t("newWindowType"), error: err.message || err }));
  }
}

async function openUrlsInTabGroup(urls) {
  if (!api.tabs?.group) return;
  try {
    const createdTabs = [];
    for (const [i, url] of urls.entries()) {
      createdTabs.push(await api.tabs.create({ url, active: i === 0 }));
    }
    const tabIds = createdTabs.map((tab) => tab.id).filter(Number.isInteger);
    if (tabIds.length) await api.tabs.group({ tabIds });
  } catch (err) {
    alert(t("couldNotOpenTabGroup", { error: err.message || err }));
  }
}

function isTabGroupSupported() {
  return typeof api.tabs?.group === "function";
}

function isSplitViewSupported() {
  // Chromium does not currently expose a stable cross-browser extension API
  // for browser-specific split-view features, so the menu item stays hidden.
  return false;
}

/** Resolve all bookmark URLs affected by a context-menu open-all action. */
function contextUrls(context) {
  const item = nodes.get(context?.id);
  if (!item) return [];
  if (isFolder(item)) return folderUrls(item);
  if (isSeparator(item)) return [];
  return item.url ? [item.url] : [];
}

async function renameFolder(folder) {
  if (!isMutable(folder)) return;
  const title = prompt(t("newFolderNamePrompt"), folder.title || "");
  if (title === null) return;
  const cleanTitle = sanitizeBookmarkTitle(title, folder.title || t("newFolderDefaultName"));
  await bookmarks("update", folder.id, { title: cleanTitle });
  await loadTree();
  performSelect(folder.id);
}

async function editBookmark(bookmark) {
  if (!bookmark || isFolder(bookmark) || !isMutable(bookmark)) return;
  const edited = await showBookmarkEditorDialog({
    heading: t("editBookmark"),
    title: bookmark.title || bookmark.url || "",
    url: bookmark.url || "https://",
    submitLabel: t("save"),
  });
  if (!edited) return;
  try {
    await bookmarks("update", bookmark.id, edited);
  } catch (err) {
    console.error(err);
    alert(t("couldNotSaveChanges", { error: err.message || err }));
  }
  await loadTree();
  performSelect(bookmark.id, "list");
}

function listSelectionAfterDelete(item) {
  const items = visibleItems();
  const index = items.findIndex((node) => node.id === item?.id);
  return { index: index >= 0 ? index : null };
}

function treeSelectionAfterDelete(item) {
  const parent = nodes.get(item?.parentId);
  const siblings = parent ? childFolders(parent) : rootFolders();
  const index = siblings.findIndex((node) => node.id === item?.id);
  return { parentId: parent?.id || null, index: index >= 0 ? index : null };
}

function chooseListSelectionAfterDelete(snapshot) {
  if (!snapshot || snapshot.index === null) return null;
  const items = visibleItems();
  return items[snapshot.index]?.id || items[snapshot.index - 1]?.id || null;
}

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

  if (isFolder(item)) await bookmarks("removeTree", item.id);
  else await bookmarks("remove", item.id);
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
      if (isFolder(item)) await bookmarks("removeTree", item.id);
      else await bookmarks("remove", item.id);
    }
  } finally {
    state.suppressBookmarkEvents = false;
  }
  clearMultiSelect();
  state.selectedId = null;
  if (pane === "tree") state.treeSelectedId = null;
  await loadTree({ fallbackFolder: pane !== "tree" });
}


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

async function createFolderIn(parentId, index = null) {
  const target = safeMoveDetails(parentId, index);
  if (!target) return;
  const title = prompt(t("folderNamePrompt"), t("newFolderDefaultName"));
  if (title === null) return;
  const details = { ...target, title: sanitizeBookmarkTitle(title, t("newFolderDefaultName")) };
  const node = await bookmarks("create", details);
  await loadTree();
  performSelect(node.id);
}

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
    const node = await bookmarks("create", details);
    await loadTree();
    performSelect(node.id);
  } catch (err) {
    console.error(err);
    alert(t("couldNotSaveChanges", { error: err.message || err }));
  }
}

async function createSeparatorIn(parentId, index = null) {
  const target = safeMoveDetails(parentId, index);
  if (!target) return;
  const details = { ...target, title: SEPARATOR_TITLE, url: SEPARATOR_URL };
  const node = await bookmarks("create", details);
  await loadTree();
  performSelect(node.id);
}

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

async function createFolderAtTarget(context = null) {
  if (await blockAddIfUnsavedDetails()) return;
  const target = insertionTargetForContext(context);
  if (!target || !canContainChildren(nodes.get(target.parentId))) return;
  await createFolderIn(target.parentId, target.index);
}

async function createBookmarkAtTarget(context = null) {
  if (await blockAddIfUnsavedDetails()) return;
  const target = insertionTargetForContext(context);
  if (!target || !canContainChildren(nodes.get(target.parentId))) return;
  await createBookmarkIn(target.parentId, target.index);
}

async function createSeparatorAtTarget(context = null) {
  if (await blockAddIfUnsavedDetails()) return;
  const target = insertionTargetForContext(context);
  if (!target || !canContainChildren(nodes.get(target.parentId))) return;
  await createSeparatorIn(target.parentId, target.index);
}

function cutNode(item) {
  if (!item || !isMutable(item)) return;
  state.clipboard = { mode: "cut", items: [{ id: item.id }] };
  render();
}

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

function dropClass(intent) {
  return intent === "into" ? "drop-into" : intent === "before" ? "drop-before" : "drop-after";
}

function clearDropRow(row) {
  row?.classList?.remove("drop-before", "drop-after", "drop-into");
}

function clearDropIndicators() {
  clearDropRow(state.dropIndicator?.row);
  state.dropIndicator = null;
  document.querySelectorAll(".drop-before,.drop-after,.drop-into,.dragging").forEach((el) => {
    el.classList.remove("drop-before", "drop-after", "drop-into", "dragging");
  });
}

/** Update the visible drop target with minimal DOM class churn during dragover. */
function setDropIndicator(row, intent) {
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

function childCount(parentId) {
  return (nodes.get(parentId)?.children || []).length;
}

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
    await bookmarks("move", dragged.id, moveDetails);

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
  await bookmarks("move", dragged.id, moveDetails);
  state.selectedId = dragged.id;
  if (isFolder(dragged)) ensureExpandedPath(dragged.id);
  await loadTree();
}

function listDropIntent(event, element, target) {
  // Multi-drag in the middle pane needs three folder zones: above, into, below.
  // Non-folder targets keep the simpler before/after behavior.
  return dropIntent(event, element, target);
}

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
        await bookmarks("move", item.id, moveDetails);
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
      if (moveDetails) await bookmarks("move", finalOrder[i].id, moveDetails);
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
        await bookmarks("move", item.id, moveDetails);
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
        await bookmarks("move", item.id, moveDetails);
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

function currentDragIntent(event, row, target, context) {
  const source = state.drag?.source;
  if (state.drag?.multi && source === "list" && context === "list") return listDropIntent(event, row, target);
  return dropIntent(event, row, target);
}

function canMoveCurrentDragToTarget(target, intent, context) {
  if (!(state.drag?.multi)) return false;
  if (state.drag.source === "list") return canMoveSelectedListItemsToTarget(target, intent, context, state.drag.ids || []);
  if (state.drag.source === "tree") return canMoveSelectedTreeFoldersToTarget(target, intent, context, state.drag.ids || []);
  return false;
}

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

function makeSeparator() {
  const sep = document.createElement("div");
  sep.className = "context-menu-separator";
  sep.setAttribute("role", "separator");
  return sep;
}

function hideAppMenu() {
  document.querySelector(".app-menu")?.remove();
  $("app-menu-button")?.setAttribute("aria-expanded", "false");
}

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

function makeAppMenuSeparator() {
  const sep = document.createElement("div");
  sep.className = "app-menu-separator";
  sep.setAttribute("role", "separator");
  return sep;
}

async function openDefaultBookmarksManager() {
  await api.tabs.create({ url: "chrome://bookmarks/" });
}

function isOptionsDialogOpen() {
  return !$('options-modal').hidden;
}

function showOptionsDialog() {
  hideContextMenu();
  hideAppMenu();
  const modal = $('options-modal');
  const host = $('options-frame-host');
  if (!host.querySelector('iframe')) {
    const frame = document.createElement('iframe');
    frame.className = 'options-frame';
    frame.title = t("optionsTitle");
    frame.src = api.runtime.getURL('options.html?embedded=1');
    host.append(frame);
  }
  modal.hidden = false;
  $('options-close').focus();
}

function hideOptionsDialog() {
  const modal = $('options-modal');
  if (modal.hidden) return;
  modal.hidden = true;
  $('options-frame-host').replaceChildren();
  $('app-menu-button')?.focus();
}

function openOptionsPage() {
  showOptionsDialog();
}

function buildAppMenu() {
  return [
    makeAppMenuItem(t("openDefaultBookmarksManager"), openDefaultBookmarksManager),
    makeAppMenuSeparator(),
    makeAppMenuItem(t("options"), openOptionsPage),
    makeAppMenuItem(t("help"), () => {}, { disabled: true }),
    makeAppMenuItem(t("about"), () => {}, { disabled: true })
  ];
}

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

function contextParentId(context) {
  const item = nodes.get(context?.id);
  if (context?.kind === "folder") return item?.id || state.folderId;
  if (context?.kind === "bookmark") return item?.parentId || state.folderId;
  return state.folderId;
}

function canCreateAtContext(context = null) {
  const target = insertionTargetForContext(context);
  return !!target && canContainChildren(nodes.get(target.parentId));
}

function buildFolderMenu(context) {
  const folder = nodes.get(context.id);
  const urls = contextUrls(context);
  const pasteDisabled = !canPasteForContext(context);
  const mutable = isMutable(folder);
  const copyAllowed = !!folder && folder.id !== "0" && !isRootFolder(folder);

  return [
    makeMenuItem(t("renameFolder"), () => renameFolder(folder), { disabled: !mutable }),
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

function buildBookmarkMenu(context) {
  const bookmark = nodes.get(context.id);
  const urls = contextUrls(context);
  const pasteDisabled = !canPasteForContext(context);
  const parentId = contextParentId(context);
  const canAddToParent = canCreateAtContext(context);

  return [
    makeMenuItem(t("edit"), () => editBookmark(bookmark), { disabled: !isMutable(bookmark) }),
    makeMenuItem(t("delete"), (context) => deleteNode(bookmark, context?.pane || "list"), { disabled: !isMutable(bookmark) }),
    makeSeparator(),
    makeMenuItem(t("cut"), () => cutNode(bookmark), { disabled: !isMutable(bookmark) }),
    makeMenuItem(t("copy"), () => copyNode(bookmark), { disabled: !bookmark }),
    makeMenuItem(t("paste"), () => pasteClipboard(context), { disabled: pasteDisabled }),
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
function renderFolderTreeNode(folder, depth = 0, cutIds = clipboardCutIdSet()) {
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
  if (cutIds.has(folder.id)) row.classList.add("clipboard-cut");
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
    replaceChildrenWithFragment(group, children.map((child) => renderFolderTreeNode(child, depth + 1, cutIds)));
    container.append(group);
  }

  return container;
}

/** Render root folders in the left Library pane. */
function renderRoots() {
  ensureExpandedPath(state.folderId);
  const roots = $("roots");
  const cutIds = clipboardCutIdSet();
  roots.setAttribute("role", "tree");
  roots.tabIndex = 0;
  replaceChildrenWithFragment(roots, rootFolders().map((folder) => renderFolderTreeNode(folder, 0, cutIds)));
}

function detailsToggleTooltip() {
  return state.detailsVisible ? t("hideDetailsPaneTooltip") : t("showDetailsPaneTooltip");
}

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

  $("crumbs").replaceChildren(pathText, sortLabel, sortSelect, detailsToggle);
}


function middleScroller() {
  return $("table-scroll");
}

function getMiddleScrollPosition() {
  const scroller = middleScroller();
  return scroller ? { top: scroller.scrollTop, left: scroller.scrollLeft } : { top: 0, left: 0 };
}

function setMiddleScrollPosition(position) {
  const scroller = middleScroller();
  if (!scroller) return;
  scroller.scrollTop = Math.max(0, position?.top || 0);
  scroller.scrollLeft = Math.max(0, position?.left || 0);
}

function restoreMiddleScrollPosition(position) {
  setMiddleScrollPosition(position);
  requestAnimationFrame(() => setMiddleScrollPosition(position));
}

/** Render the middle bookmark/folder/separator list for the active folder. */
function renderList() {
  const scrollPosition = state.resetMiddleScrollOnNextRender ? { top: 0, left: 0 } : getMiddleScrollPosition();
  state.resetMiddleScrollOnNextRender = false;

  const cutIds = clipboardCutIdSet();
  const rows = visibleItems().map((item) => {
    const row = document.createElement("div");
    row.className = "item";
    row.dataset.id = item.id;
    row.tabIndex = 0;
    if (cutIds.has(item.id)) row.classList.add("clipboard-cut");
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
      const title = makeTitleCell(item);

      const url = document.createElement("span");
      url.className = "url";
      url.textContent = item.url || "";

      const date = document.createElement("span");
      date.className = "muted";
      date.textContent = item.dateAdded ? new Date(item.dateAdded).toLocaleDateString() : "";

      const id = document.createElement("span");
      id.className = "muted";
      id.textContent = item.id;

      const order = document.createElement("span");
      order.className = "muted";
      order.textContent = Number.isInteger(item.index) ? String(item.index) : "";

      row.append(title, url, date, id, order);
    }
    row.onclick = (e) => { handlePaneClick(e, "list", item); };
    row.ondblclick = () => openOrNavigate(item);
    return row;
  });
  const list = $("list");
  list.classList.toggle("reorder-disabled", !canReorderList());
  replaceChildrenWithFragment(list, rows);
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


function availableFieldValue(value) {
  return value === undefined || value === null || value === "" ? t("notAvailable") : String(value);
}

function formatBookmarkDate(value) {
  if (!value) return t("notAvailable");
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t("notAvailable");
  return date.toLocaleString();
}

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

function setAdvancedDetailsFields(snapshot) {
  const advanced = snapshot || advancedDetailsSnapshot();
  if (!advanced) return;
  $("advanced-id").value = availableFieldValue(advanced.id);
  $("advanced-guid").value = availableFieldValue(advanced.guid);
  $("advanced-date-added").value = formatBookmarkDate(advanced.dateAdded);
  $("advanced-date-last-used").value = formatBookmarkDate(advanced.dateLastUsed);
  $("advanced-index").value = advanced.index;
}

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

function advancedIndexValue() {
  return $("advanced-index").value.trim();
}

function renderParents(selectedValue = null) {
  const selected = nodes.get(state.selectedId);
  const parentSelect = $("parent");
  const desiredValue = selectedValue ?? parentSelect.value ?? selected?.parentId ?? "";
  const options = [...nodes.values()].filter((n) =>
    canContainChildren(n) &&
    n.id !== selected?.id &&
    !(selected && isFolder(selected) && isDescendantOf(n, selected)));

  parentSelect.replaceChildren(...options.map((folder) => {
    const opt = document.createElement("option");
    opt.value = folder.id;
    opt.textContent = folderPath(folder);
    return opt;
  }));

  if (desiredValue && ![...parentSelect.options].some((opt) => opt.value === desiredValue)) {
    // Chromium root-level folders such as Bookmarks bar / Other bookmarks
    // report parentId "0".  The synthetic browser root is not a valid move
    // target, so keep a disabled placeholder option to preserve the saved
    // parent value and avoid false dirty-state / unsaved-change prompts.
    const placeholder = document.createElement("option");
    placeholder.value = desiredValue;
    const parentNode = nodes.get(desiredValue);
    placeholder.textContent = parentNode ? folderPath(parentNode) : t("browserRoot");
    placeholder.disabled = true;
    parentSelect.prepend(placeholder);
  }

  if ([...parentSelect.options].some((opt) => opt.value === desiredValue)) {
    parentSelect.value = desiredValue;
  }
}

/** Render the Details pane or the Details Multiselect summary. */
function renderDetails() {
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
    return;
  }

  multiDetails.hidden = true;
  form.hidden = !selected;
  $("empty-details").hidden = !!selected;
  if (!selected) {
    state.detailsOriginal = null;
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
}

function folderPath(folder) {
  const path = [];
  for (let n = folder; n && n.id !== "0"; n = n.parentNode) path.unshift(n.title || t("rootFallback"));
  return path.join(" / ");
}

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
}

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

function detailFieldChanged(field) {
  const current = currentDetailsValues();
  const original = state.detailsOriginal;
  if (!current || !original) return false;
  return current[field] !== original[field];
}

function hasUnsavedDetails() {
  const selected = nodes.get(state.selectedId);
  if (!selected || !state.detailsOriginal || state.detailsOriginal.id !== selected.id) return false;
  if (detailFieldChanged("title")) return true;
  if (!isFolder(selected) && detailFieldChanged("url")) return true;
  if (detailFieldChanged("parentId")) return true;
  if (EnableAdvancedDetailsEditing && detailFieldChanged("advancedIndex")) return true;
  return false;
}

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
}

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

/** Render sortable column headers for the middle pane. */
function renderColumnHeaders() {
  for (const button of document.querySelectorAll(".columns [data-sort-key]")) {
    const key = button.dataset.sortKey;
    const active = state.sort === key;
    button.setAttribute("aria-pressed", String(active));
    button.title = sortTooltip(key, active ? state.sortDirection : defaultSortDirection(key));

    const label = button.dataset.label || button.textContent.replace(/[ ▲▼]$/u, "");
    const arrow = active && key !== "index" ? (state.sortDirection === "asc" ? " ▲" : " ▼") : "";
    button.textContent = `${label}${arrow}`;
  }
}

function renderNavButtons() {
  $("back").disabled = state.back.length === 0;
  $("forward").disabled = state.forward.length === 0;
}

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

function performSelect(id, activePane = "list") {
  clearMultiSelect();
  if (activePane === "tree") {
    state.treeSelectedId = id;
    state.selectedId = id;
  } else state.selectedId = id;
  state.activePane = activePane;
  render();
}

async function select(id, activePane = "list") {
  if (id === paneSelectionId(activePane) && state.activePane === activePane && !isMultiSelectActive(activePane)) return;
  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
  performSelect(id, activePane);
}

/** Open bookmarks in a new tab or navigate into folders. */
function openOrNavigate(item) {
  if (isFolder(item)) {
    const targetPane = state.activePane === "list" ? "list" : "tree";
    navigate(item.id, true, targetPane);
  } else if (item.url && !isSeparator(item)) {
    api.tabs.create({ url: item.url });
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
    await bookmarks("update", selectedId, changes);
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
      if (moveDetails.parentId || Number.isInteger(moveDetails.index)) await bookmarks("move", selectedId, moveDetails);
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

async function saveSelected(e) {
  e.preventDefault();
  try {
    await saveDetailsForSelected();
  } catch (err) {
    console.error(err);
    alert(t("couldNotSaveChanges", { error: err.message || err }));
  }
}

async function removeSelected() {
  await deleteNode(nodes.get(state.selectedId), state.activePane === "details" ? "details" : state.activePane);
}

async function createFolder() {
  await createFolderAtTarget();
}

async function createBookmark() {
  await createBookmarkAtTarget();
}

async function goBack() {
  const id = state.back[0];
  if (!id) return;
  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
  state.back.shift();
  state.forward.unshift(state.folderId);
  performNavigate(id, false, "tree");
}

async function goForward() {
  const id = state.forward[0];
  if (!id) return;
  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
  state.forward.shift();
  state.back.unshift(state.folderId);
  performNavigate(id, false, "tree");
}

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

function isEditingTextField(element) {
  if (!element) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName?.toLowerCase?.();
  return tag === "input" || tag === "textarea" || tag === "select";
}

function focusActivePane() {
  const target = state.activePane === "tree" ? $("roots") : state.activePane === "list" ? $("list") : null;
  target?.focus?.({ preventScroll: true });
}

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

function focusSearchField() {
  const search = $("search");
  search.focus({ preventScroll: true });
  search.select?.();
}

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
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "Enter", "Backspace"].includes(e.key)) return false;

  if (isMultiSelectActive(state.activePane)) {
    const pane = state.activePane;
    const focusId = state.multiSelect.focusId;
    clearMultiSelect();
    setPaneSelection(pane, focusId, { navigate: false });
  }

  let handled = false;
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

for (const button of document.querySelectorAll(".columns [data-sort-key]")) {
  button.dataset.label = button.textContent;
  button.onclick = () => {
    const key = button.dataset.sortKey;
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
  };
}
$("app-menu-button").onclick = (e) => {
  e.stopPropagation();
  toggleAppMenu();
};
$("options-close").onclick = hideOptionsDialog;
$("options-modal").addEventListener("mousedown", (e) => {
  if (e.target === $("options-modal")) hideOptionsDialog();
});
$("roots").addEventListener("focusin", () => { state.activePane = "tree"; updateSelectionHighlights(); });
$("list").addEventListener("focusin", () => { state.activePane = "list"; updateSelectionHighlights(); });
$("details-form").addEventListener("focusin", () => { state.activePane = "details"; updateSelectionHighlights(); });
$("details-form").onsubmit = saveSelected;
$("discard").onclick = discardDetailsChanges;
$("delete").onclick = removeSelected;
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
window.addEventListener("scroll", () => { hideContextMenu(); hideAppMenu(); }, true);
window.addEventListener("keydown", async (e) => {
  if (e.key === "Escape") {
    if (isOptionsDialogOpen()) {
      hideOptionsDialog();
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
  await loadSettings();
  await loadTree();
}

init().catch((err) => {
  console.error(err);
  alert(t("managerFailed", { error: err.message || err }));
});
