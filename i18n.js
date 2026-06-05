/**
 * Shared localization helper for Simple Bookmarks Manager.
 *
 * Chromium's _locales files are used where possible, with additional internal
 * locale packs for debug/custom languages that are not valid Chrome locale
 * identifiers.  Runtime language switching is handled here rather than relying
 * solely on chrome.i18n.getMessage(), which follows the browser locale only.
 */
const api = chrome;

// Language labels are intentionally written in each language so the dropdown is
// usable even before the current UI language changes.
export const LANGUAGE_OPTIONS = Object.freeze([
  { value: "auto", labelKey: "languageAuto" },
  { value: "en", label: "English" },
  { value: "zh_TW", label: "繁體中文" },
  { value: "zh_CN", label: "简体中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
  { value: "pt_BR", label: "Português (Brasil)" },
  { value: "it", label: "Italiano" },
  { value: "nl", label: "Nederlands" },
  { value: "pl", label: "Polski" },
  { value: "tr", label: "Türkçe" },
  { value: "vi", label: "Tiếng Việt" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "he", label: "עברית" },
  { value: "uk", label: "Українська" },
  { value: "ru", label: "Русский" },
  { value: "mi", label: "Te Reo Māori", path: "sbm_locales/mi/messages.json" },
  { value: "en_Netspeak", label: "N3tsp34k", path: "sbm_locales/en_Netspeak/messages.json" }
]);

let currentLanguage = "en";
let messages = Object.create(null);
let fallbackMessages = Object.create(null);

/** Normalize stored/browser locale tags to SBM's underscore-separated IDs. */
function normalizeLocaleTag(value) {
  return String(value || "").trim().replace(/-/g, "_");
}

/** Return the configured language option for a supported SBM language ID. */
function languageOption(value) {
  return LANGUAGE_OPTIONS.find((option) => option.value === value) || null;
}

/** Normalize browser locale variants to supported SBM language IDs. */
function normalizeBrowserLanguage(value) {
  const language = normalizeLocaleTag(value);
  if (language === "zh_Hant" || language.startsWith("zh_Hant_") || language === "zh_HK" || language === "zh_MO") return "zh_TW";
  if (language === "zh_Hans" || language.startsWith("zh_Hans_") || language === "zh") return "zh_CN";
  if (language === "iw") return "he";
  if (language === "pt" || language.startsWith("pt_")) return "pt_BR";
  return language;
}

/** Return the list of language IDs that can be selected in SBM settings. */
export function supportedLanguageValues() {
  return LANGUAGE_OPTIONS.map((option) => option.value);
}

/** Normalize a persisted language setting, falling back to automatic detection. */
export function normalizeLanguageSetting(value) {
  return supportedLanguageValues().includes(value) ? value : "auto";
}

/** Resolve auto/manual language choice to a packaged language ID. */
export function resolveEffectiveLanguage(requested = "auto") {
  const normalized = normalizeLanguageSetting(requested);
  if (normalized !== "auto") return normalized;

  const browserLanguage = normalizeBrowserLanguage(api.i18n?.getUILanguage?.() || "en");
  if (supportedLanguageValues().includes(browserLanguage)) return browserLanguage;

  const baseLanguage = browserLanguage.split("_")[0];
  if (baseLanguage === "zh") return "zh_CN";
  if (baseLanguage === "pt") return "pt_BR";
  if (supportedLanguageValues().includes(baseLanguage)) return baseLanguage;

  return "en";
}

/** Load and flatten a messages.json file into key -> string form. */
async function fetchMessages(language) {
  const option = languageOption(language);
  const messagePath = option?.path || `_locales/${language}/messages.json`;
  const response = await fetch(api.runtime.getURL(messagePath));
  if (!response.ok) throw new Error(`Unable to load language ${language}`);
  const raw = await response.json();
  const flat = Object.create(null);
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value.message === "string") flat[key] = value.message;
  }
  return flat;
}

/** Load the effective language and update document language/direction. */
export async function setI18nLanguage(requested = "auto") {
  const language = resolveEffectiveLanguage(requested);
  if (!Object.keys(fallbackMessages).length) fallbackMessages = await fetchMessages("en");
  messages = language === "en" ? fallbackMessages : await fetchMessages(language).catch(() => fallbackMessages);
  currentLanguage = language;
  document.documentElement.lang = language.replace("_", "-");
  document.documentElement.dir = language === "he" ? "rtl" : "ltr";
  return currentLanguage;
}

/** Return the currently loaded effective language ID. */
export function getCurrentLanguage() {
  return currentLanguage;
}

/** Translate a key and replace simple {name} / $name$ placeholders. */
export function t(key, replacements = {}) {
  let message = messages[key] || fallbackMessages[key] || key;
  for (const [name, value] of Object.entries(replacements)) {
    message = message.replaceAll(`{${name}}`, String(value));
    message = message.replaceAll(`$${name}$`, String(value));
  }
  return message;
}

/** Apply data-i18n attributes to a document or subtree. */
export function applyI18n(root = document) {
  for (const element of root.querySelectorAll("[data-i18n]")) {
    element.textContent = t(element.dataset.i18n);
  }
  for (const element of root.querySelectorAll("[data-i18n-title]")) {
    element.title = t(element.dataset.i18nTitle);
  }
  for (const element of root.querySelectorAll("[data-i18n-placeholder]")) {
    element.placeholder = t(element.dataset.i18nPlaceholder);
  }
  for (const element of root.querySelectorAll("[data-i18n-aria-label]")) {
    element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel));
  }
}

/** Populate the UI language dropdown. */
export function populateLanguageSelect(select, selectedValue = "auto") {
  select.replaceChildren(...LANGUAGE_OPTIONS.map((language) => {
    const option = document.createElement("option");
    option.value = language.value;
    option.textContent = language.labelKey ? t(language.labelKey) : language.label;
    option.lang = language.value === "auto" ? currentLanguage.replace("_", "-") : language.value.replace("_", "-");
    return option;
  }));
  select.value = normalizeLanguageSetting(selectedValue);
}
