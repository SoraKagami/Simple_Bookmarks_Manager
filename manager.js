const api = chrome;

const state = {
  tree: null,
  folderId: null,
  selectedId: null,
  search: "",
  sort: "index",
  sortDirection: "asc",
  back: [],
  forward: [],
  expandedFolders: new Set(),
  detailsVisible: true,
  detailsOriginal: null,
  drag: null,
  clipboard: null,
  contextMenu: null,
  suppressBookmarkEvents: false,
  unsavedPromptActive: false,
  faviconRefreshToken: String(Date.now())
};

const $ = (id) => document.getElementById(id);
const nodes = new Map();
const SEPARATOR_TITLE = "———";
const SEPARATOR_URL = "about:blank";

async function bookmarks(method, ...args) {
  return await api.bookmarks[method](...args);
}

function indexTree(root, parent = null, out = []) {
  const node = { ...root, parentNode: parent };
  nodes.set(node.id, node);
  out.push(node);
  for (const child of root.children || []) indexTree(child, node, out);
  return out;
}

function isFolder(node) {
  return !!node && !node.url;
}

function isSeparator(node) {
  return !!node && !isFolder(node) && (node.title || "") === SEPARATOR_TITLE && (node.url || "") === SEPARATOR_URL;
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
  return img;
}

function makeTitleCell(item) {
  const cell = document.createElement("span");
  cell.className = "title-cell";

  const icon = isFolder(item)
    ? makeIcon(extensionIconPath("folder-16.png"), "Folder")
    : makeIcon(bookmarkFaviconUrl(item.url, 16), "Bookmark");

  const text = document.createElement("span");
  text.className = "title-text";
  text.textContent = item.title || item.url || (isFolder(item) ? "(folder)" : "(bookmark)");

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

function visibleItems() {
  const folder = nodes.get(state.folderId);
  if (!folder) return [];
  let items = state.search ? flattenBookmarks(folder) : (folder.children || []);
  const needle = state.search.toLocaleLowerCase();
  if (needle) {
    items = items.filter((n) =>
      [n.title, n.url].some((v) => (v || "").toLocaleLowerCase().includes(needle)));
  }
  if (state.sort !== "index") {
    const direction = state.sortDirection === "desc" ? -1 : 1;
    items = [...items].sort((a, b) => compareNodes(a, b, state.sort) * direction);
  }
  return items;
}

async function loadTree() {
  nodes.clear();
  const [root] = await bookmarks("getTree");
  state.tree = root;
  indexTree(root);
  if (state.expandedFolders.size === 0) {
    for (const folder of rootFolders()) state.expandedFolders.add(folder.id);
  }
  if (!state.folderId || !nodes.has(state.folderId)) {
    // Chrome root's first children are normally Bookmarks Bar / Other / Mobile.
    state.folderId = defaultFolderId();
  }
  ensureExpandedPath(state.folderId);
  render();
}

function rootFolders() {
  return (state.tree?.children || []).filter(isFolder);
}

function defaultFolderId() {
  return rootFolders()[0]?.id || state.tree?.id || null;
}

function childFolders(folder) {
  return (folder.children || []).filter(isFolder);
}

function ensureExpandedPath(folderId) {
  for (let n = nodes.get(folderId)?.parentNode; n && n.id !== "0"; n = n.parentNode) {
    state.expandedFolders.add(n.id);
  }
}

function toggleFolder(folderId) {
  if (state.expandedFolders.has(folderId)) {
    state.expandedFolders.delete(folderId);
  } else {
    state.expandedFolders.add(folderId);
  }
  renderRoots();
}

function isDescendantOf(node, possibleAncestor) {
  for (let n = node?.parentNode; n; n = n.parentNode) {
    if (n.id === possibleAncestor?.id) return true;
  }
  return false;
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

function cloneBookmarkNode(node) {
  const copy = { title: node.title || "" };
  if (node.url) copy.url = node.url;
  if (node.children) copy.children = node.children.map(cloneBookmarkNode);
  return copy;
}

async function createFromSnapshot(snapshot, parentId, index = null) {
  const createDetails = { parentId, title: snapshot.title || "" };
  if (snapshot.url) createDetails.url = snapshot.url;
  if (Number.isInteger(index)) createDetails.index = index;
  const created = await bookmarks("create", createDetails);
  for (const child of snapshot.children || []) {
    await createFromSnapshot(child, created.id);
  }
  return created;
}

function canPasteInto(parentFolder, clipboard = state.clipboard) {
  if (!clipboard || !canContainChildren(parentFolder)) return false;
  if (clipboard.mode === "cut") {
    const cutNode = nodes.get(clipboard.id);
    if (!cutNode || !isMutable(cutNode)) return false;
    if (cutNode.id === parentFolder.id) return false;
    if (isFolder(cutNode) && isDescendantOf(parentFolder, cutNode)) return false;
  }
  return true;
}


function canPasteForContext(context) {
  const target = pasteTargetForContext(context);
  if (!target || !canPasteInto(target.parent)) return false;
  if (state.clipboard?.mode === "cut" && state.clipboard.id === context?.id) return false;
  return true;
}

function pasteTargetForContext(context) {
  if (!context) return null;
  const item = nodes.get(context.id);
  if (context.kind === "folder") {
    return { parent: item, index: null };
  }
  if (context.kind === "bookmark") {
    const parent = nodes.get(item?.parentId);
    const index = Number.isInteger(item?.index) ? item.index + 1 : null;
    return { parent, index };
  }
  return { parent: nodes.get(state.folderId), index: null };
}

async function pasteClipboard(context = state.contextMenu) {
  if (!canPasteForContext(context)) return;
  const target = pasteTargetForContext(context);

  if (state.clipboard.mode === "cut") {
    const moveDetails = { parentId: target.parent.id };
    if (Number.isInteger(target.index)) moveDetails.index = target.index;
    await bookmarks("move", state.clipboard.id, moveDetails);
    state.selectedId = state.clipboard.id;
    state.clipboard = null;
  } else {
    const created = await createFromSnapshot(state.clipboard.snapshot, target.parent.id, target.index);
    state.selectedId = created.id;
  }

  await loadTree();
}

async function sortFolderChildren(folder, key) {
  if (!canContainChildren(folder)) return;
  const children = [...(folder.children || [])];
  if (children.length < 2) return;
  const sorted = children.sort((a, b) => compareNodes(a, b, key));
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
    alert(`Could not open ${incognito ? "private" : "new"} window: ${err.message || err}`);
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
    alert(`Could not open tab group: ${err.message || err}`);
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

function contextUrls(context) {
  const item = nodes.get(context?.id);
  if (!item) return [];
  if (isFolder(item)) return folderUrls(item);
  if (isSeparator(item)) return [];
  return item.url ? [item.url] : [];
}

async function renameFolder(folder) {
  if (!isMutable(folder)) return;
  const title = prompt("New folder name", folder.title || "");
  if (!title) return;
  await bookmarks("update", folder.id, { title: title.trim() });
  await loadTree();
  performSelect(folder.id);
}

async function editBookmark(bookmark) {
  if (!bookmark || isFolder(bookmark) || !isMutable(bookmark)) return;
  const title = prompt("Bookmark name", bookmark.title || bookmark.url || "");
  if (title === null) return;
  const url = prompt("Bookmark URL", bookmark.url || "https://");
  if (url === null || !url.trim()) return;
  await bookmarks("update", bookmark.id, { title: title.trim() || url.trim(), url: url.trim() });
  await loadTree();
  performSelect(bookmark.id);
}

async function deleteNode(item) {
  if (!item || !isMutable(item)) return;
  const label = item.title || item.url || "this item";
  if (!confirm(`Delete "${label}"?`)) return;
  if (isFolder(item)) await bookmarks("removeTree", item.id);
  else await bookmarks("remove", item.id);
  if (state.clipboard?.mode === "cut" && state.clipboard.id === item.id) state.clipboard = null;
  state.selectedId = state.folderId;
  await loadTree();
}

async function createFolderIn(parentId) {
  const title = prompt("Folder name", "New Folder");
  if (!title) return;
  const node = await bookmarks("create", { parentId, title });
  await loadTree();
  performSelect(node.id);
}

async function createBookmarkIn(parentId) {
  const url = prompt("Bookmark URL", "https://");
  if (!url) return;
  const title = prompt("Bookmark name", url) || url;
  const node = await bookmarks("create", { parentId, title, url });
  await loadTree();
  performSelect(node.id);
}

async function createSeparatorIn(parentId) {
  const node = await bookmarks("create", { parentId, title: SEPARATOR_TITLE, url: SEPARATOR_URL });
  await loadTree();
  performSelect(node.id);
}

function cutNode(item) {
  if (!item || !isMutable(item)) return;
  state.clipboard = { mode: "cut", id: item.id };
  render();
}

function copyNode(item) {
  if (!item || item.id === "0") return;
  state.clipboard = { mode: "copy", snapshot: cloneBookmarkNode(item) };
  render();
}

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

function clearDropIndicators() {
  document.querySelectorAll(".drop-before,.drop-after,.drop-into,.dragging").forEach((el) => {
    el.classList.remove("drop-before", "drop-after", "drop-into", "dragging");
  });
}

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

async function moveWithIntent(draggedId, targetId, intent) {
  const dragged = nodes.get(draggedId);
  const target = nodes.get(targetId);
  if (!validDrop(dragged, target, intent, "any")) return;

  if (intent === "into") {
    const previousFolderId = state.folderId && nodes.has(state.folderId) ? state.folderId : null;
    await bookmarks("move", dragged.id, { parentId: target.id });

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

  let index = target.index + (intent === "after" ? 1 : 0);
  if (dragged.parentId === target.parentId && dragged.index < target.index) {
    index -= 1;
  }

  await bookmarks("move", dragged.id, {
    parentId: target.parentId,
    index: Math.max(0, index)
  });
  state.selectedId = dragged.id;
  if (isFolder(dragged)) ensureExpandedPath(dragged.id);
  await loadTree();
}

function attachDropTarget(row, target, context) {
  row.ondragover = (e) => {
    const dragged = nodes.get(state.drag?.id || e.dataTransfer.getData("text/plain"));
    const intent = dropIntent(e, row, target);
    if (!validDrop(dragged, target, intent, context)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    clearDropIndicators();
    row.classList.add(dropClass(intent));
  };

  row.ondragleave = () => row.classList.remove("drop-before", "drop-after", "drop-into");

  row.ondrop = async (e) => {
    const draggedId = state.drag?.id || e.dataTransfer.getData("text/plain");
    const intent = dropIntent(e, row, target);
    const dragged = nodes.get(draggedId);
    if (!validDrop(dragged, target, intent, context)) return;

    e.preventDefault();
    clearDropIndicators();
    state.drag = null;
    try {
      await moveWithIntent(draggedId, target.id, intent);
    } catch (err) {
      console.error(err);
      alert(`Could not move bookmark item: ${err.message || err}`);
      await loadTree();
    }
  };
}


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
      alert(`Action failed: ${err.message || err}`);
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

function contextParentId(context) {
  const item = nodes.get(context?.id);
  if (context?.kind === "folder") return item?.id || state.folderId;
  if (context?.kind === "bookmark") return item?.parentId || state.folderId;
  return state.folderId;
}

function buildFolderMenu(context) {
  const folder = nodes.get(context.id);
  const urls = contextUrls(context);
  const pasteDisabled = !canPasteForContext(context);
  const mutable = isMutable(folder);
  const copyAllowed = !!folder && folder.id !== "0" && !isRootFolder(folder);

  return [
    makeMenuItem("Rename Folder", () => renameFolder(folder), { disabled: !mutable }),
    makeMenuItem("Delete Folder", () => deleteNode(folder), { disabled: !mutable }),
    makeSeparator(),
    makeMenuItem("Cut", () => cutNode(folder), { disabled: !mutable }),
    makeMenuItem("Copy", () => copyNode(folder), { disabled: !copyAllowed }),
    makeMenuItem("Paste", () => pasteClipboard(context), { disabled: pasteDisabled }),
    makeSeparator(),
    makeMenuItem("Sort by Name", () => sortFolderChildren(folder, "title"), { disabled: !canContainChildren(folder) || (folder.children || []).length < 2 }),
    makeMenuItem("Sort by Date", () => sortFolderChildren(folder, "dateAdded"), { disabled: !canContainChildren(folder) || (folder.children || []).length < 2 }),
    makeSeparator(),
    makeMenuItem("Add New Bookmark", () => createBookmarkIn(folder.id), { disabled: !canContainChildren(folder) }),
    makeMenuItem("Add New Folder", () => createFolderIn(folder.id), { disabled: !canContainChildren(folder) }),
    makeMenuItem("Add Separator", () => createSeparatorIn(folder.id), { disabled: !canContainChildren(folder) }),
    makeSeparator(),
    makeMenuItem("Open All Bookmarks", () => openUrlsInCurrentWindow(urls), { disabled: urls.length === 0 }),
    makeMenuItem("Open All in New Window", () => openUrlsInWindow(urls, false), { disabled: urls.length === 0 }),
    makeMenuItem("Open All in Private Window", () => openUrlsInWindow(urls, true), { disabled: urls.length === 0 }),
    makeMenuItem("Open All in New Tab Group", () => openUrlsInTabGroup(urls), { disabled: urls.length === 0, hidden: !isTabGroupSupported() }),
    makeMenuItem("Open All in Split View", () => {}, { hidden: !isSplitViewSupported() })
  ];
}

function buildBookmarkMenu(context) {
  const bookmark = nodes.get(context.id);
  const urls = contextUrls(context);
  const pasteDisabled = !canPasteForContext(context);
  const parentId = contextParentId(context);

  return [
    makeMenuItem("Edit", () => editBookmark(bookmark), { disabled: !isMutable(bookmark) }),
    makeSeparator(),
    makeMenuItem("Delete", () => deleteNode(bookmark), { disabled: !isMutable(bookmark) }),
    makeSeparator(),
    makeMenuItem("Cut", () => cutNode(bookmark), { disabled: !isMutable(bookmark) }),
    makeMenuItem("Copy", () => copyNode(bookmark), { disabled: !bookmark }),
    makeMenuItem("Paste", () => pasteClipboard(context), { disabled: pasteDisabled }),
    makeSeparator(),
    makeMenuItem("Open in New Tab", () => openUrlsInCurrentWindow(urls), { disabled: urls.length === 0 }),
    makeMenuItem("Open in New Window", () => openUrlsInWindow(urls, false), { disabled: urls.length === 0 }),
    makeMenuItem("Open in Private Window", () => openUrlsInWindow(urls, true), { disabled: urls.length === 0 }),
    makeMenuItem("Open in New Tab Group", () => openUrlsInTabGroup(urls), { disabled: urls.length === 0, hidden: !isTabGroupSupported() }),
    makeMenuItem("Open in Split View", () => {}, { hidden: !isSplitViewSupported() }),
    makeSeparator(),
    makeMenuItem("Add New Bookmark", () => createBookmarkIn(parentId), { disabled: !canContainChildren(nodes.get(parentId)) }),
    makeMenuItem("Add New Folder", () => createFolderIn(parentId), { disabled: !canContainChildren(nodes.get(parentId)) }),
    makeMenuItem("Add Separator", () => createSeparatorIn(parentId), { disabled: !canContainChildren(nodes.get(parentId)) })
  ];
}

function buildEmptyMenu(context) {
  const parentId = contextParentId(context);
  const parent = nodes.get(parentId);
  const canPaste = canPasteForContext(context);
  const items = [
    makeMenuItem("Add New Bookmark", () => createBookmarkIn(parentId), { disabled: !canContainChildren(parent) }),
    makeMenuItem("Add New Folder", () => createFolderIn(parentId), { disabled: !canContainChildren(parent) }),
    makeMenuItem("Add Separator", () => createSeparatorIn(parentId), { disabled: !canContainChildren(parent) })
  ];

  if (canPaste) {
    items.push(makeSeparator());
    items.push(makeMenuItem("Paste", () => pasteClipboard(context)));
  }

  return items;
}

function contextFromEvent(e) {
  const row = e.target.closest?.(".item,.tree-row");
  if (row?.dataset?.id) {
    const item = nodes.get(row.dataset.id);
    if (isFolder(item)) return { kind: "folder", id: item.id };
    if (item) return { kind: "bookmark", id: item.id };
  }
  return { kind: "empty", id: state.folderId };
}

function showContextMenu(e) {
  if (isInDetailsPane(e.target)) return;
  e.preventDefault();
  e.stopPropagation();
  hideContextMenu();

  const context = contextFromEvent(e);
  state.contextMenu = context;
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.setAttribute("role", "menu");

  const items = context.kind === "folder"
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

function renderFolderTreeNode(folder, depth = 0) {
  const children = childFolders(folder);
  const isExpanded = state.expandedFolders.has(folder.id);
  const container = document.createElement("div");
  container.className = "tree-node";

  const row = document.createElement("div");
  row.className = "tree-row";
  row.dataset.id = folder.id;
  row.style.setProperty("--depth", depth);
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-selected", String(folder.id === state.folderId));
  if (state.clipboard?.mode === "cut" && state.clipboard.id === folder.id) row.classList.add("clipboard-cut");
  if (children.length) row.setAttribute("aria-expanded", String(isExpanded));

  if (canDragTreeFolder(folder)) {
    row.draggable = true;
    row.title = "Drag to reorder this folder";
    row.ondragstart = (e) => {
      state.drag = { id: folder.id, source: "tree" };
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
  twisty.title = isExpanded ? "Collapse folder" : "Expand folder";
  twisty.onclick = (e) => {
    e.stopPropagation();
    toggleFolder(folder.id);
  };

  const toggleFolderOnDoubleClick = (e) => {
    if (!children.length) return;
    e.preventDefault();
    e.stopPropagation();
    toggleFolder(folder.id);
  };

  const label = document.createElement("button");
  label.className = "tree-label";
  label.type = "button";
  label.setAttribute("aria-current", String(folder.id === state.folderId));
  label.title = children.length ? "Double-click to expand or collapse this folder" : "";
  label.onclick = () => navigate(folder.id);
  label.ondblclick = toggleFolderOnDoubleClick;
  row.ondblclick = toggleFolderOnDoubleClick;

  const labelContent = document.createElement("span");
  labelContent.className = "tree-label-content";
  const labelText = document.createElement("span");
  labelText.className = "tree-label-text";
  labelText.textContent = folder.title || "(root)";
  labelContent.append(makeIcon(extensionIconPath("folder-16.png"), "Folder"), labelText);
  label.append(labelContent);

  row.append(twisty, label);
  container.append(row);

  if (children.length && isExpanded) {
    const group = document.createElement("div");
    group.className = "tree-children";
    group.setAttribute("role", "group");
    group.append(...children.map((child) => renderFolderTreeNode(child, depth + 1)));
    container.append(group);
  }

  return container;
}

function renderRoots() {
  ensureExpandedPath(state.folderId);
  $("roots").setAttribute("role", "tree");
  $("roots").replaceChildren(...rootFolders().map((folder) => renderFolderTreeNode(folder)));
}

function detailsToggleTooltip() {
  return state.detailsVisible ? "Hide the Details pane" : "Show the Details pane";
}

function renderCrumbs() {
  const path = [];
  for (let n = nodes.get(state.folderId); n && n.id !== "0"; n = n.parentNode) path.unshift(n.title || "(root)");

  const pathText = document.createElement("span");
  pathText.className = "path-text";
  pathText.textContent = path.join(" / ") || "Bookmarks";

  const detailsToggle = document.createElement("button");
  detailsToggle.id = "toggle-details";
  detailsToggle.className = "details-toggle";
  detailsToggle.type = "button";
  detailsToggle.textContent = state.detailsVisible ? "Click to Hide Details" : "Click to Show Details";
  detailsToggle.title = detailsToggleTooltip();
  detailsToggle.setAttribute("aria-pressed", String(state.detailsVisible));
  detailsToggle.onclick = toggleDetailsPane;

  $("crumbs").replaceChildren(pathText, detailsToggle);
}

function renderList() {
  const rows = visibleItems().map((item) => {
    const row = document.createElement("div");
    row.className = "item";
    row.dataset.id = item.id;
    row.tabIndex = 0;
    if (state.clipboard?.mode === "cut" && state.clipboard.id === item.id) row.classList.add("clipboard-cut");
    if (item.id === state.selectedId) row.classList.add("selected");

    if (canDragListItem(item)) {
      row.draggable = true;
      row.title = "Drag to move or reorder this item";
      row.ondragstart = (e) => {
        state.drag = { id: item.id, source: "list" };
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
      row.title = "Separator";
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
    row.onclick = () => { select(item.id); };
    row.ondblclick = () => openOrNavigate(item);
    row.onkeydown = (e) => {
      if (e.key === "Enter") openOrNavigate(item);
      if (e.key === "Delete") removeSelected();
    };
    return row;
  });
  $("list").classList.toggle("reorder-disabled", !canReorderList());
  $("list").replaceChildren(...rows);
}

function renderParents() {
  const selected = nodes.get(state.selectedId);
  const options = [...nodes.values()].filter((n) =>
    canContainChildren(n) &&
    n.id !== selected?.id &&
    !(selected && isFolder(selected) && isDescendantOf(n, selected)));
  $("parent").replaceChildren(...options.map((folder) => {
    const opt = document.createElement("option");
    opt.value = folder.id;
    opt.textContent = folderPath(folder);
    return opt;
  }));
}

function renderDetails() {
  $("layout").classList.toggle("details-hidden", !state.detailsVisible);
  $("details-pane").hidden = !state.detailsVisible;
  if (!state.detailsVisible) return;

  const selected = nodes.get(state.selectedId);
  const form = $("details-form");
  form.hidden = !selected;
  $("empty-details").hidden = !!selected;
  if (!selected) {
    state.detailsOriginal = null;
    return;
  }

  const isSameDetailsItem = state.detailsOriginal?.id === selected.id;
  const preserveUnsavedEdits = isSameDetailsItem && hasUnsavedDetails();

  $("url-label").hidden = isFolder(selected);
  $("url").hidden = isFolder(selected);
  $("url").disabled = isFolder(selected);
  $("delete").textContent = isFolder(selected) ? "Delete Folder" : "Delete Bookmark";
  $("delete").disabled = !isMutable(selected);
  $("save").disabled = !isMutable(selected);
  $("discard").disabled = !isMutable(selected);
  renderParents();

  if (!preserveUnsavedEdits) {
    state.detailsOriginal = selectedDetailsSnapshot(selected);
    $("title").value = state.detailsOriginal.title;
    $("url").value = state.detailsOriginal.url;
    $("parent").value = state.detailsOriginal.parentId;
  }

  updateDetailsDirtyIndicators();
}

function folderPath(folder) {
  const path = [];
  for (let n = folder; n && n.id !== "0"; n = n.parentNode) path.unshift(n.title || "(root)");
  return path.join(" / ");
}

function selectedDetailsSnapshot(selected = nodes.get(state.selectedId)) {
  if (!selected) return null;
  return {
    id: selected.id,
    isFolder: isFolder(selected),
    title: selected.title || "",
    url: selected.url || "",
    parentId: selected.parentId || ""
  };
}

function currentDetailsValues() {
  const selected = nodes.get(state.selectedId);
  if (!selected || !state.detailsOriginal || state.detailsOriginal.id !== selected.id) return null;
  return {
    id: selected.id,
    isFolder: isFolder(selected),
    title: $("title").value.trim(),
    url: isFolder(selected) ? "" : $("url").value.trim(),
    parentId: $("parent").value || ""
  };
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
  return detailFieldChanged("parentId");
}

function updateDetailsDirtyIndicators() {
  const selected = nodes.get(state.selectedId);
  const titleDirty = detailFieldChanged("title");
  const urlDirty = !isFolder(selected) && detailFieldChanged("url");
  const parentDirty = detailFieldChanged("parentId");
  $("title-label").classList.toggle("dirty", titleDirty);
  $("url-label").classList.toggle("dirty", urlDirty);
  $("parent-label").classList.toggle("dirty", parentDirty);
}

function discardDetailsChanges() {
  const selected = nodes.get(state.selectedId);
  if (!selected || !state.detailsOriginal || state.detailsOriginal.id !== selected.id) return;
  $("title").value = state.detailsOriginal.title;
  $("url").value = state.detailsOriginal.url;
  $("parent").value = state.detailsOriginal.parentId;
  updateDetailsDirtyIndicators();
}

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
    heading.textContent = "Unsaved changes";

    const message = document.createElement("p");
    message.textContent = "The Details pane has unsaved changes. What would you like to do?";

    const actions = document.createElement("div");
    actions.className = "unsaved-modal-actions";

    const finish = (choice) => {
      backdrop.remove();
      resolve(choice);
    };

    const keep = document.createElement("button");
    keep.type = "button";
    keep.textContent = "Keep Editing";
    keep.onclick = () => finish("keep");

    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "Save";
    save.onclick = () => finish("save");

    const discard = document.createElement("button");
    discard.type = "button";
    discard.textContent = "Discard";
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
        alert(`Could not save changes: ${err.message || err}`);
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
    return "Default Chromium folder order. Click to return to Unsorted; this column does not reverse-sort.";
  }
  const ascending = direction === "asc";
  if (key === "title") return ascending ? "Sort by name: A to Z" : "Sort by name: Z to A";
  if (key === "url") return ascending ? "Sort by URL: A to Z" : "Sort by URL: Z to A";
  if (key === "dateAdded") return ascending ? "Sort by date added: oldest first" : "Sort by date added: newest first";
  if (key === "id") return ascending ? "Sort by ID: lowest first" : "Sort by ID: highest first";
  return "Sort bookmarks";
}

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

function render() {
  renderRoots();
  renderCrumbs();
  renderList();
  renderColumnHeaders();
  renderDetails();
  renderNavButtons();
}

function performNavigate(folderId, pushHistory = true) {
  refreshFaviconToken();
  if (pushHistory && state.folderId) {
    state.back.unshift(state.folderId);
    state.forward = [];
  }
  state.folderId = folderId;
  state.selectedId = folderId;
  state.search = "";
  $("search").value = "";
  render();
}

async function navigate(folderId, pushHistory = true) {
  if (folderId === state.folderId) return;
  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
  performNavigate(folderId, pushHistory);
}

function performSelect(id) {
  state.selectedId = id;
  render();
}

async function select(id) {
  if (id === state.selectedId) return;
  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
  performSelect(id);
}

function openOrNavigate(item) {
  if (isFolder(item)) {
    navigate(item.id);
  } else if (item.url && !isSeparator(item)) {
    api.tabs.create({ url: item.url });
  }
}

async function saveDetailsForSelected() {
  const selected = nodes.get(state.selectedId);
  if (!selected || !isMutable(selected)) return;

  const title = $("title").value.trim();
  const url = $("url").value.trim();
  const parentId = $("parent").value;

  const changes = isFolder(selected) ? { title } : { title, url };
  await bookmarks("update", selected.id, changes);
  if (parentId && parentId !== selected.parentId) {
    await bookmarks("move", selected.id, { parentId });
  }
  await loadTree();
  performSelect(selected.id);
}

async function saveSelected(e) {
  e.preventDefault();
  try {
    await saveDetailsForSelected();
  } catch (err) {
    console.error(err);
    alert(`Could not save changes: ${err.message || err}`);
  }
}

async function removeSelected() {
  await deleteNode(nodes.get(state.selectedId));
}

async function createFolder() {
  await createFolderIn(state.folderId);
}

async function createBookmark() {
  await createBookmarkIn(state.folderId);
}

async function goBack() {
  const id = state.back[0];
  if (!id) return;
  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
  state.back.shift();
  state.forward.unshift(state.folderId);
  performNavigate(id, false);
}

async function goForward() {
  const id = state.forward[0];
  if (!id) return;
  if (!(await confirmUnsavedDetailsBeforeNavigation())) return;
  state.forward.shift();
  state.back.unshift(state.folderId);
  performNavigate(id, false);
}

function handleMouseHistoryButton(e) {
  // Mouse4/Mouse5 are commonly exposed as button 3/4 in Chromium.
  // Prevent the browser's default history navigation inside the manager page.
  if (e.button === 3) {
    e.preventDefault();
    e.stopPropagation();
    goBack();
  } else if (e.button === 4) {
    e.preventDefault();
    e.stopPropagation();
    goForward();
  }
}

function setSortSelectTooltips() {
  const labels = {
    index: sortTooltip("index"),
    title: "Name sort. Ascending is A to Z; descending is Z to A.",
    url: "URL sort. Ascending is A to Z; descending is Z to A.",
    dateAdded: "Date added sort. Ascending is oldest first; descending is newest first.",
    id: "ID sort. Ascending is lowest first; descending is highest first."
  };

  for (const option of $("sort").options) {
    option.title = labels[option.value] || "Sort bookmarks";
  }
}

$("back").onclick = goBack;
$("forward").onclick = goForward;
$("search").oninput = (e) => {
  state.search = e.target.value;
  renderList();
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
      // Same behavior as the toolbar's "Unsorted" entry: show Chromium's
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
$("details-form").onsubmit = saveSelected;
$("discard").onclick = discardDetailsChanges;
$("delete").onclick = removeSelected;
for (const id of ["title", "url", "parent"]) {
  $(id).addEventListener("input", updateDetailsDirtyIndicators);
  $(id).addEventListener("change", updateDetailsDirtyIndicators);
}
$("new-folder").onclick = createFolder;
$("new-bookmark").onclick = createBookmark;
document.addEventListener("dragover", (e) => {
  if (state.drag) e.preventDefault();
});
document.addEventListener("drop", clearDropIndicators);
window.addEventListener("mousedown", handleMouseHistoryButton, { capture: true });
window.addEventListener("auxclick", handleMouseHistoryButton, { capture: true });
window.addEventListener("contextmenu", showContextMenu, { capture: true });
window.addEventListener("click", (e) => { if (!e.target.closest?.(".context-menu")) hideContextMenu(); });
window.addEventListener("resize", hideContextMenu);
window.addEventListener("scroll", hideContextMenu, true);
window.addEventListener("keydown", (e) => { if (e.key === "Escape") hideContextMenu(); });

setSortSelectTooltips();

// Keep the view live, mirroring Firefox Places' model/view update pattern.
for (const eventName of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered"]) {
  api.bookmarks[eventName].addListener(() => { if (!state.suppressBookmarkEvents) loadTree(); });
}

loadTree().catch((err) => {
  console.error(err);
  alert(`Bookmark manager failed: ${err.message || err}`);
});
