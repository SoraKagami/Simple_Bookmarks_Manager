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

const api = chrome;

/** Load normalized settings needed by the standalone About page. */
async function loadAboutSettings() {
  const stored = await api.storage.local.get(DEFAULT_SETTINGS);
  return Object.fromEntries(
    Object.keys(DEFAULT_SETTINGS).map((key) => [key, normalizeSettingValue(key, stored[key])])
  );
}

/** Apply the configured UI font settings so About matches the manager page. */
function applyAboutUiSettings(settings) {
  document.documentElement.style.setProperty("--sbm-ui-font-family", fontFamilyCss(settings.UserInterfaceFontFamily));
  document.documentElement.style.setProperty("--sbm-ui-font-size", `${settings.UserInterfaceFontSize}px`);
  document.documentElement.style.setProperty("--sbm-ui-line-height", String(settings.UserInterfaceLineSpacing));
}

/** Initialize About page localization and visual settings. */
async function initAboutPage() {
  const settings = await loadAboutSettings();
  applyAboutUiSettings(settings);
  await setI18nLanguage(settings.UserInterfaceLanguage);
  applyI18n(document);
}

initAboutPage().catch(() => {
  // Keep the static English fallback text visible if settings or locale loading fails.
});
