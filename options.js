const api = chrome;

if (new URLSearchParams(location.search).has("embedded")) {
  document.body.classList.add("embedded");
}

const DEFAULT_SETTINGS = Object.freeze({
  SearchLimitToFolderAndSub: false,
  DeleteShowWarning: true,
  SortShowWarning: true,
  KeyboardDeleteAllow: true,
  SortByNameNatural: true,
  EnableAdvancedDetailsViewing: false,
  EnableAdvancedDetailsEditing: false
});

const $ = (id) => document.getElementById(id);
let statusTimer = null;

function showStatus(message) {
  $("status").textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => { $("status").textContent = ""; }, 1600);
}

function normalizeSettingValue(key, value) {
  return typeof value === "boolean" ? value : DEFAULT_SETTINGS[key];
}

function setControlState(settings) {
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    $(key).checked = normalizeSettingValue(key, settings[key]);
  }

  if (!$("EnableAdvancedDetailsViewing").checked) {
    $("EnableAdvancedDetailsEditing").checked = false;
  }
  $("EnableAdvancedDetailsEditing").disabled = !$("EnableAdvancedDetailsViewing").checked;
}

async function loadOptions() {
  const stored = await api.storage.local.get(Object.keys(DEFAULT_SETTINGS));
  setControlState({ ...DEFAULT_SETTINGS, ...stored });
}

async function saveOption(key, value) {
  const update = { [key]: normalizeSettingValue(key, value) };

  if (key === "EnableAdvancedDetailsViewing" && !value) {
    update.EnableAdvancedDetailsEditing = false;
  }

  await api.storage.local.set(update);
  setControlState({ ...DEFAULT_SETTINGS, ...(await api.storage.local.get(Object.keys(DEFAULT_SETTINGS))) });
  showStatus("Saved");
}

for (const key of Object.keys(DEFAULT_SETTINGS)) {
  $(key).addEventListener("change", (event) => {
    saveOption(key, event.target.checked).catch((err) => {
      console.error(err);
      showStatus(`Save failed: ${err.message || err}`);
    });
  });
}

$("reset").addEventListener("click", async () => {
  await api.storage.local.set({ ...DEFAULT_SETTINGS });
  setControlState(DEFAULT_SETTINGS);
  showStatus("Defaults restored");
});

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
  showStatus(`Load failed: ${err.message || err}`);
});
