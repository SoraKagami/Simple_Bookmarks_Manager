const MANAGER_PAGE = "manager.html";
const MANAGER_URL = chrome.runtime.getURL(MANAGER_PAGE);
const MANAGER_TAB_IDS_KEY = "managerTabIds";
const LEGACY_MANAGER_TAB_ID_KEY = "managerTabId";
const SIDE_PANEL_PERMISSION = "sidePanel";

/** Normalize storage values that are expected to be booleans. */
function asBoolean(value, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

/** Filter, deduplicate, and preserve valid tab IDs from session storage. */
function normalizedTabIdList(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Number.isInteger))] : [];
}

/** Activate a tab and focus its window, returning false when the tab is stale. */
async function focusTab(tabId) {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
    return true;
  } catch {
    return false;
  }
}

/** Record a manager tab as the newest known instance for single-instance mode. */
async function rememberManagerTab(tabId) {
  if (!Number.isInteger(tabId)) return;
  const session = await chrome.storage.session.get([MANAGER_TAB_IDS_KEY]);
  const ids = normalizedTabIdList(session[MANAGER_TAB_IDS_KEY]);
  const nextIds = ids.filter((id) => id !== tabId);
  nextIds.push(tabId);
  await chrome.storage.session.set({
    [LEGACY_MANAGER_TAB_ID_KEY]: tabId,
    [MANAGER_TAB_IDS_KEY]: nextIds
  });
}

/** Remove a closed manager tab from session bookkeeping. */
async function forgetManagerTab(tabId) {
  const session = await chrome.storage.session.get([LEGACY_MANAGER_TAB_ID_KEY, MANAGER_TAB_IDS_KEY]);
  const update = {};
  const ids = normalizedTabIdList(session[MANAGER_TAB_IDS_KEY]);
  update[MANAGER_TAB_IDS_KEY] = ids.filter((id) => id !== tabId);
  if (session[LEGACY_MANAGER_TAB_ID_KEY] === tabId) update[LEGACY_MANAGER_TAB_ID_KEY] = null;
  await chrome.storage.session.set(update);
  if (update[LEGACY_MANAGER_TAB_ID_KEY] === null) await chrome.storage.session.remove(LEGACY_MANAGER_TAB_ID_KEY);
}

/** Create a new manager tab and remember it when Chromium reports an ID. */
async function openManagerTab() {
  const tab = await chrome.tabs.create({ url: MANAGER_URL });
  if (tab?.id != null) await rememberManagerTab(tab.id);
}

/** Try known manager tabs newest-first, clearing stale IDs when none can be focused. */
async function focusKnownManagerTab() {
  const session = await chrome.storage.session.get([LEGACY_MANAGER_TAB_ID_KEY, MANAGER_TAB_IDS_KEY]);
  const knownIds = [];
  knownIds.push(...normalizedTabIdList(session[MANAGER_TAB_IDS_KEY]));
  if (Number.isInteger(session[LEGACY_MANAGER_TAB_ID_KEY])) knownIds.push(session[LEGACY_MANAGER_TAB_ID_KEY]);

  const uniqueNewestFirst = normalizedTabIdList(knownIds).reverse();
  const stillValidIds = [];
  for (const tabId of uniqueNewestFirst) {
    if (await focusTab(tabId)) {
      await rememberManagerTab(tabId);
      return true;
    }
    // The tab may have been closed or the browser may have discarded metadata.
    // Do not keep stale IDs, because single-instance mode would otherwise open
    // new tabs even when another known manager tab still exists later in the list.
  }
  await chrome.storage.session.remove([LEGACY_MANAGER_TAB_ID_KEY, MANAGER_TAB_IDS_KEY]);
  if (stillValidIds.length) await chrome.storage.session.set({ [MANAGER_TAB_IDS_KEY]: stillValidIds });
  return false;
}

/** Return whether the optional sidePanel permission is currently granted. */
async function hasSidePanelPermission() {
  return chrome.permissions.contains({ permissions: [SIDE_PANEL_PERMISSION] });
}

/** Apply the persisted Sidebar Mode behavior to Chromium's extension action. */
async function configureSidebarMode(enabled) {
  if (!chrome.sidePanel) return false;

  await chrome.sidePanel.setOptions({
    path: MANAGER_PAGE,
    enabled
  });
  await chrome.sidePanel.setPanelBehavior({
    openPanelOnActionClick: enabled
  });
  return true;
}

/**
 * Reconcile Sidebar Mode with API availability and its optional permission.
 * Missing permission is never requested here because background execution has
 * no user gesture; Options owns the permission prompt.
 */
async function syncSidebarMode() {
  const { SidebarMode = false } = await chrome.storage.local.get({ SidebarMode: false });
  const enabled = asBoolean(SidebarMode, false);

  if (!enabled) {
    if (chrome.sidePanel && await hasSidePanelPermission()) {
      await configureSidebarMode(false);
    }
    return false;
  }

  if (!chrome.sidePanel || !(await hasSidePanelPermission())) {
    await chrome.storage.local.set({ SidebarMode: false });
    return false;
  }

  await configureSidebarMode(true);
  return true;
}

chrome.action.onClicked.addListener(async () => {
  const { SidebarMode = false } = await chrome.storage.local.get({ SidebarMode: false });
  if (asBoolean(SidebarMode, false) && await syncSidebarMode()) {
    // Chromium normally handles this click before dispatching onClicked. If an
    // implementation still dispatches it, do not fall back to opening a tab.
    return;
  }

  const { MultipleInstancesAllowed = false } = await chrome.storage.local.get({ MultipleInstancesAllowed: false });
  if (asBoolean(MultipleInstancesAllowed, false)) {
    await openManagerTab();
    return;
  }

  if (await focusKnownManagerTab()) return;
  await openManagerTab();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await forgetManagerTab(tabId);
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local" || !Object.prototype.hasOwnProperty.call(changes, "SidebarMode")) return;
  syncSidebarMode().catch(() => {
    chrome.storage.local.set({ SidebarMode: false });
  });
});

chrome.permissions.onRemoved.addListener((permissions) => {
  if (!permissions.permissions?.includes(SIDE_PANEL_PERMISSION)) return;
  chrome.storage.local.set({ SidebarMode: false });
});

chrome.runtime.onInstalled.addListener(() => {
  syncSidebarMode().catch(() => {
    chrome.storage.local.set({ SidebarMode: false });
  });
});

chrome.runtime.onStartup.addListener(() => {
  syncSidebarMode().catch(() => {
    chrome.storage.local.set({ SidebarMode: false });
  });
});

// Reapply persisted action behavior whenever this service worker starts.
syncSidebarMode().catch(() => {
  chrome.storage.local.set({ SidebarMode: false });
});
