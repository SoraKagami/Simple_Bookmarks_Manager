const api = chrome;

const state = {
  tree: null,
  folderId: null,
  selectedId: null,
  search: "",
  sort: "index",
  back: [],
  forward: [],
  expandedFolders: new Set()
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

function isMutable(node) {
  // Chrome forbids modifying root and special managed folders.
  return !!node && node.id !== "0" && !node.unmodifiable && node.folderType !== "managed";
}

function flattenBookmarks(folder) {
  const out = [];
  for (const child of folder.children || []) {
    out.push(child);
    if (child.children) out.push(...flattenBookmarks(child));
  }
  return out;
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
    items = [...items].sort((a, b) => {
      const av = state.sort === "dateAdded" ? (a.dateAdded || 0) : (a[state.sort] || "");
      const bv = state.sort === "dateAdded" ? (b.dateAdded || 0) : (b[state.sort] || "");
      return typeof av === "number" ? bv - av : String(av).localeCompare(String(bv));
    });
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
    state.folderId = root.children?.[0]?.id || root.id;
  }
  ensureExpandedPath(state.folderId);
  render();
}

function rootFolders() {
  return (state.tree?.children || []).filter(isFolder);
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

    const title = document.createElement("span");
    title.textContent = isFolder(item) ? `▸ ${item.title || "(folder)"}` : item.title || item.url || "(bookmark)";

    const url = document.createElement("span");
    url.className = "url";
    url.textContent = item.url || "";

    const date = document.createElement("span");
    date.className = "muted";
    date.textContent = item.dateAdded ? new Date(item.dateAdded).toLocaleDateString() : "";

    row.append(title, url, date);
    row.onclick = () => select(item.id);
    row.ondblclick = () => openOrNavigate(item);
    row.onkeydown = (e) => {
      if (e.key === "Enter") openOrNavigate(item);
      if (e.key === "Delete") removeSelected();
    };
    return row;
  });
  $("list").replaceChildren(...rows);
}

function renderParents() {
  const selected = nodes.get(state.selectedId);
  const options = [...nodes.values()].filter((n) => isFolder(n) && isMutable(n) && n.id !== selected?.id);
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

function renderNavButtons() {
  $("back").disabled = state.back.length === 0;
  $("forward").disabled = state.forward.length === 0;
}

function render() {
  renderRoots();
  renderCrumbs();
  renderList();
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

$("back").onclick = () => {
  const id = state.back.shift();
  if (!id) return;
  state.forward.unshift(state.folderId);
  navigate(id, false);
};
$("forward").onclick = () => {
  const id = state.forward.shift();
  if (!id) return;
  state.back.unshift(state.folderId);
  navigate(id, false);
};
$("search").oninput = (e) => {
  state.search = e.target.value;
  renderList();
};
$("sort").onchange = (e) => {
  state.sort = e.target.value;
  renderList();
};
$("details-form").onsubmit = saveSelected;
$("delete").onclick = removeSelected;
$("new-folder").onclick = createFolder;
$("new-bookmark").onclick = createBookmark;

// Keep the view live, mirroring Firefox Places' model/view update pattern.
for (const eventName of ["onCreated", "onRemoved", "onChanged", "onMoved", "onChildrenReordered"]) {
  api.bookmarks[eventName].addListener(() => loadTree());
}

loadTree().catch((err) => {
  console.error(err);
  alert(`Bookmark manager failed: ${err.message || err}`);
});
