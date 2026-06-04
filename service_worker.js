const MANAGER_PAGE = "manager.html";
const MANAGER_URL = chrome.runtime.getURL(MANAGER_PAGE);
const MANAGER_TAB_IDS_KEY = "managerTabIds";
const LEGACY_MANAGER_TAB_ID_KEY = "managerTabId";

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

chrome.action.onClicked.addListener(async () => {
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
