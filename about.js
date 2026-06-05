/**
 * About page controller.
 *
 * The About page is loaded inside the manager iframe, but it is also a normal
 * packaged extension page.  It localizes itself from the same language setting
 * used by the rest of SBM so the page can be translated without rebuilding its
 * HTML structure.
 */
import { applyI18n, setI18nLanguage } from "./i18n.js";
import { DEFAULT_SETTINGS, fontFamilyCss, normalizeSettingValue } from "./settings.js";
import { applyThemePreference, installThemePreferenceListener } from "./theme.js";

const api = chrome;
let currentThemeMode = DEFAULT_SETTINGS.ThemeMode;

installThemePreferenceListener(() => currentThemeMode);

/**
 * Load and normalize the settings needed by the standalone About page.
 *
 * Storage values are treated the same way as the main manager page so malformed
 * or old settings cannot directly become CSS values.
 */
async function loadAboutSettings() {
  const stored = await api.storage.local.get(DEFAULT_SETTINGS);
  return Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS).map((key) => [key, normalizeSettingValue(key, stored[key])])
  );
}

/**
 * Apply configured theme and UI typography.
 *
 * The theme is written as normalized data attributes, and typography uses CSS
 * custom properties constrained by the shared settings validators.
 */
function applyAboutUiSettings(settings) {
  currentThemeMode = normalizeSettingValue("ThemeMode", settings.ThemeMode);
  applyThemePreference(currentThemeMode);
  document.documentElement.style.setProperty("--sbm-ui-font-family", fontFamilyCss(settings.UserInterfaceFontFamily));
  document.documentElement.style.setProperty("--sbm-ui-font-size", `${settings.UserInterfaceFontSize}px`);
  document.documentElement.style.setProperty("--sbm-ui-line-height", String(settings.UserInterfaceLineSpacing));
}

/**
 * Initialize About page localization and visual settings.
 *
 * The HTML keeps English fallback text in place.  If loading settings or locale
 * JSON fails, the catch below leaves that static copy visible instead of
 * partially clearing the page.
 */
async function initAboutPage() {
  const settings = await loadAboutSettings();
  applyAboutUiSettings(settings);
  await setI18nLanguage(settings.UserInterfaceLanguage);
  applyI18n(document);
}

initAboutPage().catch(() => {
  // Keep the static English fallback text visible if settings or locale loading fails.
});
