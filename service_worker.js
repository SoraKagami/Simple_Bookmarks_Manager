const MANAGER_PAGE = "manager.html";
const MANAGER_URL = chrome.runtime.getURL(MANAGER_PAGE);

async function focusTab(tabId) {
  try {
    const tab = await chrome.tabs.update(tabId, { active: true });
    if (tab?.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
    return true;
  } catch {
    return false;
  }
}

async function openManagerTab() {
  const tab = await chrome.tabs.create({ url: MANAGER_URL });
  if (tab?.id != null) await chrome.storage.session.set({ managerTabId: tab.id });
}

chrome.action.onClicked.addListener(async () => {
  const { MultipleInstancesAllowed = false } = await chrome.storage.local.get({ MultipleInstancesAllowed: false });
  if (MultipleInstancesAllowed) {
    await openManagerTab();
    return;
  }

  const { managerTabId } = await chrome.storage.session.get("managerTabId");
  if (Number.isInteger(managerTabId) && await focusTab(managerTabId)) return;

  await chrome.storage.session.remove("managerTabId");
  await openManagerTab();
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const { managerTabId } = await chrome.storage.session.get("managerTabId");
  if (managerTabId === tabId) await chrome.storage.session.remove("managerTabId");
});
