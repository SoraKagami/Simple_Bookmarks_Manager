/**
 * Shared theme helpers for Simple Bookmarks Manager.
 *
 * Theme settings are intentionally limited to known enum values at this stage.
 * That keeps storage values from becoming arbitrary CSS while leaving the CSS
 * custom-property structure ready for future custom theme support.
 */

const SYSTEM_DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export const THEME_MODE_OPTIONS = Object.freeze(["system", "light", "dark", "softBlue"]);

/** Normalize a stored or form-provided theme choice to a supported theme mode. */
export function normalizeThemeMode(value) {
  return THEME_MODE_OPTIONS.includes(value) ? value : "system";
}

/** Resolve System mode to the concrete theme currently shown. */
export function resolveEffectiveTheme(themeMode) {
  const normalized = normalizeThemeMode(themeMode);
  if (normalized !== "system") return normalized;
  return typeof matchMedia === "function" && matchMedia(SYSTEM_DARK_MEDIA_QUERY).matches ? "dark" : "light";
}

/** Return the browser color-scheme hint that best matches a resolved SBM theme. */
function colorSchemeForTheme(effectiveTheme) {
  return effectiveTheme === "dark" ? "dark" : "light";
}

/**
 * Apply the active theme to a document root using attributes consumed by CSS.
 *
 * Only normalized enum values are written to the DOM.  No user-provided colors
 * are accepted here, which keeps this safe to call with values read from
 * chrome.storage.local.
 */
export function applyThemePreference(themeMode, root = document.documentElement) {
  const normalized = normalizeThemeMode(themeMode);
  const effectiveTheme = resolveEffectiveTheme(normalized);
  const colorScheme = colorSchemeForTheme(effectiveTheme);
  root.dataset.sbmThemeMode = normalized;
  root.dataset.sbmTheme = effectiveTheme;
  root.style.colorScheme = colorScheme;
  return { mode: normalized, effectiveTheme, colorScheme };
}

/**
 * Re-apply System mode when the browser/OS color-scheme preference changes.
 *
 * The getter is used instead of capturing a value so callers can keep one
 * listener installed while storage changes update their local theme variable.
 */
export function installThemePreferenceListener(themeModeGetter, root = document.documentElement) {
  if (typeof matchMedia !== "function") return () => {};
  const mediaQuery = matchMedia(SYSTEM_DARK_MEDIA_QUERY);
  const currentMode = () => normalizeThemeMode(
    typeof themeModeGetter === "function" ? themeModeGetter() : themeModeGetter
  );
  const reapplyIfSystem = () => {
    if (currentMode() === "system") applyThemePreference("system", root);
  };

  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", reapplyIfSystem);
    return () => mediaQuery.removeEventListener("change", reapplyIfSystem);
  }

  // Older Chromium-derived browsers may still expose the legacy listener API.
  if (typeof mediaQuery.addListener === "function") {
    mediaQuery.addListener(reapplyIfSystem);
    return () => mediaQuery.removeListener(reapplyIfSystem);
  }

  return () => {};
}
