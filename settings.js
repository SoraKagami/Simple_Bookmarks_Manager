/**
 * Shared settings schema and validators for Simple Bookmarks Manager.
 *
 * Keeping defaults and option normalization in one module prevents the manager
 * page and options page from drifting apart when new settings are added.
 */
import { normalizeLanguageSetting } from "./i18n.js";

export const FONT_FAMILY_OPTIONS = Object.freeze([
  { value: "system", css: "system-ui, sans-serif" },
  { value: "sans", css: "Arial, Helvetica, sans-serif" },
  { value: "serif", css: "Georgia, 'Times New Roman', serif" },
  { value: "mono", css: "Consolas, 'Cascadia Mono', 'Courier New', monospace" }
]);

export const DEFAULT_SETTINGS = Object.freeze({
  UserInterfaceLanguage: "auto",
  UserInterfaceFontFamily: "system",
  UserInterfaceFontSize: 12.5,
  UserInterfaceLineSpacing: 1.4,
  EnableAdvancedDetailsViewing: false,
  EnableAdvancedDetailsEditing: false,
  SortByNameNatural: true,
  SortShowWarning: true,
  KeyboardDeleteAllow: true,
  DeleteShowWarning: true,
  SearchLimitToFolderAndSub: true,
  Optimisation_TempBookmarkTreeMaps: true,
  Optimisation_DOMrendering: true
});

/** Clamp numeric option values loaded from storage or form controls. */
export function clampNumber(value, min, max, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}

export function fontFamilyCss(value) {
  return (FONT_FAMILY_OPTIONS.find((option) => option.value === value) || FONT_FAMILY_OPTIONS[0]).css;
}

/** Validate and normalize values before using or writing settings. */
export function normalizeSettingValue(key, value) {
  if (key === "UserInterfaceLanguage") return normalizeLanguageSetting(value);
  if (key === "UserInterfaceFontFamily") {
    return FONT_FAMILY_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_SETTINGS[key];
  }
  if (key === "UserInterfaceFontSize") return clampNumber(value, 11, 20, DEFAULT_SETTINGS[key]);
  if (key === "UserInterfaceLineSpacing") return clampNumber(value, 1.0, 1.8, DEFAULT_SETTINGS[key]);
  return typeof value === "boolean" ? value : DEFAULT_SETTINGS[key];
}
