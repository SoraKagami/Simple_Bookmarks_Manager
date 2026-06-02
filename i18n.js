const api = chrome;

export const LANGUAGE_OPTIONS = Object.freeze([
  { value: "auto", label: "Automatic / Browser Default" },
  { value: "en", label: "English" }
]);

let currentLanguage = "en";
let messages = Object.create(null);
let fallbackMessages = Object.create(null);

function normalizeLocaleTag(value) {
  return String(value || "").trim().replace(/-/g, "_");
}

export function supportedLanguageValues() {
  return LANGUAGE_OPTIONS.map((option) => option.value);
}

export function normalizeLanguageSetting(value) {
  return supportedLanguageValues().includes(value) ? value : "auto";
}

export function resolveEffectiveLanguage(requested = "auto") {
  const normalized = normalizeLanguageSetting(requested);
  if (normalized !== "auto") return normalized;

  const browserLanguage = normalizeLocaleTag(api.i18n?.getUILanguage?.() || "en");
  if (supportedLanguageValues().includes(browserLanguage)) return browserLanguage;

  const baseLanguage = browserLanguage.split("_")[0];
  if (supportedLanguageValues().includes(baseLanguage)) return baseLanguage;

  return "en";
}

async function fetchMessages(language) {
  const response = await fetch(api.runtime.getURL(`_locales/${language}/messages.json`));
  if (!response.ok) throw new Error(`Unable to load language ${language}`);
  const raw = await response.json();
  const flat = Object.create(null);
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value.message === "string") flat[key] = value.message;
  }
  return flat;
}

export async function setI18nLanguage(requested = "auto") {
  const language = resolveEffectiveLanguage(requested);
  if (!Object.keys(fallbackMessages).length) fallbackMessages = await fetchMessages("en");
  messages = language === "en" ? fallbackMessages : await fetchMessages(language).catch(() => fallbackMessages);
  currentLanguage = language;
  document.documentElement.lang = language.replace("_", "-");
  return currentLanguage;
}

export function getCurrentLanguage() {
  return currentLanguage;
}

export function t(key, replacements = {}) {
  let message = messages[key] || fallbackMessages[key] || key;
  for (const [name, value] of Object.entries(replacements)) {
    message = message.replaceAll(`{${name}}`, String(value));
    message = message.replaceAll(`$${name}$`, String(value));
  }
  return message;
}

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

export function populateLanguageSelect(select, selectedValue = "auto") {
  select.replaceChildren(...LANGUAGE_OPTIONS.map((language) => {
    const option = document.createElement("option");
    option.value = language.value;
    option.textContent = language.label;
    option.lang = language.value === "auto" ? "en" : language.value.replace("_", "-");
    return option;
  }));
  select.value = normalizeLanguageSetting(selectedValue);
}
