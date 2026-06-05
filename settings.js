/**
 * Shared settings schema and validators for Simple Bookmarks Manager.
 *
 * Keeping defaults and option normalization in one module prevents the manager
 * page and options page from drifting apart when new settings are added.
 */
import { normalizeLanguageSetting } from "./i18n.js";
import { normalizeThemeMode } from "./theme.js";

export const MID_FC_COLUMN_MIN_WIDTHS = Object.freeze({
  Name: 120,
  URL: 160,
  DateAdded: 105,
  ID: 56,
  Order: 70
});

export const MID_FC_COLUMN_DEFAULT_WIDTHS = Object.freeze({
  Name: 240,
  URL: 360,
  DateAdded: 140,
  ID: 72,
  Order: 72
});

export const FONT_FAMILY_OPTIONS = Object.freeze([
  { value: "system", css: "system-ui, sans-serif" },
  { value: "sans", css: "Arial, Helvetica, sans-serif" },
  { value: "serif", css: "Georgia, 'Times New Roman', serif" },
  { value: "mono", css: "Consolas, 'Cascadia Mono', 'Courier New', monospace" }
]);

export const DEFAULT_SETTINGS = Object.freeze({
  left_Lib_Width: 260,
  right_Details_Width: 320,
  UserInterfaceLanguage: "auto",
  ThemeMode: "system",
  UserInterfaceFontFamily: "system",
  UserInterfaceFontSize: 12.5,
  UserInterfaceLineSpacing: 1.4,
  EnableAdvancedDetailsViewing: false,
  EnableAdvancedDetailsEditing: false,
  SortByNameNatural: true,
  SortShowWarning: true,
  KeyboardDeleteAllow: true,
  DeleteShowWarning: true,
  SearchLimitToFolderAndSub: false,
  MultipleInstancesAllowed: false,
  BlockJavascriptBookmarkOpens: true,
  BlockDataBookmarkOpens: true,
  BlockBlobBookmarkOpens: true,
  Optimisation_TempBookmarkTreeMaps: true,
  Optimisation_DOMrendering: true,
  Show_ErrorsWarnings: false,
  DebugOptions: false,
  mid_FC_Width_Name: 240,
  mid_FC_Width_URL: 360,
  mid_FC_Width_DateAdded: 140,
  mid_FC_Width_ID: 72,
  mid_FC_Width_Order: 72,
  mid_FC_Show_DateAdded: true,
  mid_FC_Show_ID: false,
  mid_FC_Show_Order: true
});

/** Clamp numeric option values loaded from storage or form controls. */
export function clampNumber(value, min, max, fallback) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, numberValue));
}

/** Resolve a configured font-family token to its CSS font-family value. */
export function fontFamilyCss(value) {
  return (FONT_FAMILY_OPTIONS.find((option) => option.value === value) || FONT_FAMILY_OPTIONS[0]).css;
}

/** Validate and normalize values before using or writing settings. */
export function normalizeSettingValue(key, value) {
  if (key === "UserInterfaceLanguage") return normalizeLanguageSetting(value);
  if (key === "ThemeMode") return normalizeThemeMode(value);
  if (key === "UserInterfaceFontFamily") {
    return FONT_FAMILY_OPTIONS.some((option) => option.value === value) ? value : DEFAULT_SETTINGS[key];
  }
  if (key === "UserInterfaceFontSize") return clampNumber(value, 11, 20, DEFAULT_SETTINGS[key]);
  if (key === "UserInterfaceLineSpacing") return clampNumber(value, 1.0, 1.8, DEFAULT_SETTINGS[key]);
  if (key === "left_Lib_Width") return Math.round(clampNumber(value, 180, 800, DEFAULT_SETTINGS[key]));
  if (key === "right_Details_Width") return Math.round(clampNumber(value, 220, 900, DEFAULT_SETTINGS[key]));
  if (key.startsWith("mid_FC_Width_")) {
    const column = key.slice("mid_FC_Width_".length);
    const min = MID_FC_COLUMN_MIN_WIDTHS[column] || 48;
    const fallback = MID_FC_COLUMN_DEFAULT_WIDTHS[column] || DEFAULT_SETTINGS[key] || min;
    return Math.round(clampNumber(value, min, 1200, fallback));
  }
  return typeof value === "boolean" ? value : DEFAULT_SETTINGS[key];
}
