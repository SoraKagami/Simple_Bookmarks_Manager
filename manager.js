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
  drag: null
};

const $ = (id) => document.getElementById(id);
const nodes = new Map();

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

function renderFolderTreeNode(folder, depth = 0) {
  const children = childFolders(folder);
  const isExpanded = state.expandedFolders.has(folder.id);
  const container = document.createElement("div");
  container.className = "tree-node";

  const row = document.createElement("div");
  row.className = "tree-row";
  row.style.setProperty("--depth", depth);
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-selected", String(folder.id === state.folderId));
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

  const label = document.createElement("button");
  label.className = "tree-label";
  label.type = "button";
  label.textContent = folder.title || "(root)";
  label.setAttribute("aria-current", String(folder.id === state.folderId));
  label.onclick = () => navigate(folder.id);

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

function renderCrumbs() {
  const path = [];
  for (let n = nodes.get(state.folderId); n && n.id !== "0"; n = n.parentNode) path.unshift(n.title || "(root)");
  $("crumbs").textContent = path.join(" / ") || "Bookmarks";
}

function renderList() {
  const rows = visibleItems().map((item) => {
    const row = document.createElement("div");
    row.className = "item";
    row.dataset.id = item.id;
    row.tabIndex = 0;
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

    const title = document.createElement("span");
    title.textContent = isFolder(item) ? `▸ ${item.title || "(folder)"}` : item.title || item.url || "(bookmark)";

    const url = document.createElement("span");
    url.className = "url";
    url.textContent = item.url || "";

    const date = document.createElement("span");
    date.className = "muted";
    date.textContent = item.dateAdded ? new Date(item.dateAdded).toLocaleDateString() : "";

    const id = document.createElement("span");
    id.className = "muted";
    id.textContent = item.id;

    row.append(title, url, date, id);
    row.onclick = () => select(item.id);
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
  const selected = nodes.get(state.selectedId);
  const form = $("details-form");
  form.hidden = !selected;
  $("empty-details").hidden = !!selected;
  if (!selected) return;

  $("title").value = selected.title || "";
  $("url").value = selected.url || "";
  $("url").disabled = isFolder(selected);
  $("delete").disabled = !isMutable(selected);
  renderParents();
  $("parent").value = selected.parentId || "";
}

function folderPath(folder) {
  const path = [];
  for (let n = folder; n && n.id !== "0"; n = n.parentNode) path.unshift(n.title || "(root)");
  return path.join(" / ");
}

function renderColumnHeaders() {
  for (const button of document.querySelectorAll(".columns [data-sort-key]")) {
    const key = button.dataset.sortKey;
    const active = state.sort === key;
    button.setAttribute("aria-pressed", String(active));
    button.textContent = `${button.dataset.label || button.textContent.replace(/[ ▲▼]$/u, "")}${active ? (state.sortDirection === "asc" ? " ▲" : " ▼") : ""}`;
  }
}

function renderNavButtons() {
  $("back").disabled = state.back.length === 0;
  $("forward").disabled = state.forward.length === 0;
}

function render() {
  renderRoots();
  renderCrumbs();
  renderList();
  renderColumnHeaders();
  renderDetails();
  renderNavButtons();
}

function navigate(folderId, pushHistory = true) {
  if (folderId === state.folderId) return;
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

function select(id) {
  state.selectedId = id;
  render();
}

function openOrNavigate(item) {
  if (isFolder(item)) {
    navigate(item.id);
  } else if (item.url) {
    api.tabs.create({ url: item.url });
  }
}

async function saveSelected(e) {
  e.preventDefault();
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
  select(selected.id);
}

async function removeSelected() {
  const selected = nodes.get(state.selectedId);
  if (!selected || !isMutable(selected)) return;
  if (!confirm(`Delete "${selected.title || selected.url}"?`)) return;
  if (isFolder(selected)) await bookmarks("removeTree", selected.id);
  else await bookmarks("remove", selected.id);
  state.selectedId = state.folderId;
  await loadTree();
}

async function createFolder() {
  const title = prompt("Folder name", "New Folder");
  if (!title) return;
  const node = await bookmarks("create", { parentId: state.folderId, title });
  await loadTree();
  select(node.id);
}

async function createBookmark() {
  const url = prompt("Bookmark URL", "https://");
  if (!url) return;
  const title = prompt("Bookmark name", url) || url;
  const node = await bookmarks("create", { parentId: state.folderId, title, url });
  await loadTree();
  select(node.id);
}

function goBack() {
  const id = state.back.shift();
  if (!id) return;
  state.forward.unshift(state.folderId);
  navigate(id, false);
}

function goForward() {
  const id = state.forward.shift();
  if (!id) return;
  state.back.unshift(state.folderId);
  navigate(id, false);
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
    if (state.sort === key) {
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
$("delete").onclick = removeSelected;
$("new-folder").onclick = createFolder;
$("new-bookmark").onclick = createBookmark;
document.addEventListener("dragover", (e) => {
  if (state.drag) e.preventDefault();
});
document.addEventListener("drop", clearDropIndicators);
window.addEventListener("mousedown", handleMouseHistoryButton, { capture: true });
window.addEventListener("auxclick", handleMouseHistoryButton, { capture: true });

// Keep the view live, mirroring Firefox Places' model/view update pattern.
for (const eventName of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered"]) {
  api.bookmarks[eventName].addListener(() => loadTree());
}

loadTree().catch((err) => {
  console.error(err);
  alert(`Bookmark manager failed: ${err.message || err}`);
});
