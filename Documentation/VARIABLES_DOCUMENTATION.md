# Simple Bookmarks Manager — Settings & UI Variable Reference

Last Updated: `2026-08-09`, SBM `v0.9.15`

# Index

- [1. Options settings reference](#1-options-settings-reference)
  - [1.1 User Interface](#11-user-interface)
  - [1.2 Search](#12-search)
  - [1.3 Safety](#13-safety)
  - [1.4 Sorting](#14-sorting)
  - [1.5 Advanced — top-level controls](#15-advanced--top-level-controls)
  - [1.6 Advanced → Startup behavior](#16-advanced--startup-behavior)
  - [1.7 Advanced → Bookmark URL protections](#17-advanced--bookmark-url-protections)
  - [1.8 Advanced → Pane widths](#18-advanced--pane-widths)
  - [1.9 Advanced → Folder Contents view](#19-advanced--folder-contents-view)
  - [1.10 Advanced → Advanced Details](#110-advanced--advanced-details)
  - [1.11 Advanced → Optimisations](#111-advanced--optimisations)
  - [1.12 Advanced → Debug Settings](#112-advanced--debug-settings)
- [2. Options controls that are not persisted settings](#2-options-controls-that-are-not-persisted-settings)
- [3. Main manager UI reference (`manager.html`)](#3-main-manager-ui-reference-managerhtml)
  - [3.1 Toolbar](#31-toolbar)
  - [3.2 Main layout → Library pane](#32-main-layout--library-pane)
  - [3.3 Main layout → Folder Contents pane](#33-main-layout--folder-contents-pane)
  - [3.4 Main layout → Details pane](#34-main-layout--details-pane)
    - [3.4.1 Pane and standard fields](#341-pane-and-standard-fields)
    - [3.4.2 Advanced Details](#342-advanced-details)
    - [3.4.3 Multi-selection / empty Details states](#343-multi-selection--empty-details-states)
  - [3.5 Dialogs → Options](#35-dialogs--options)
  - [3.6 Dialogs → Info](#36-dialogs--info)
- [4. Important runtime-generated manager controls](#4-important-runtime-generated-manager-controls)
- [5. Central `manager.js` UI state (not persisted settings)](#5-central-managerjs-ui-state-not-persisted-settings)
  - [5.1 Navigation and selection](#51-navigation-and-selection)
  - [5.2 Search and visual sorting](#52-search-and-visual-sorting)
  - [5.3 Library state](#53-library-state)
  - [5.4 Details state](#54-details-state)
  - [5.5 Drag/drop](#55-dragdrop)
  - [5.6 Clipboard, context menus, rendering guards](#56-clipboard-context-menus-rendering-guards)
- [6. Fast lookup: setting → visible UI area](#6-fast-lookup-setting--visible-ui-area)
- [7. Source files to check when maintaining this reference](#7-source-files-to-check-when-maintaining-this-reference)
- [8. Short mental model](#8-short-mental-model)

---

# 1. Options settings reference

## 1.1 User Interface

**Options path:** `User Interface`

| Setting / control ID | Type / allowed values | Default | What it controls |
|---|---|---:|---|
| `UserInterfaceLanguage` | string: `auto` or a language token populated by the i18n code | `"auto"` | Language used by the manager and Options UI. `auto` follows the browser UI language. |
| `ThemeMode` | `system`, `light`, `dark`, `softBlue`, `softPink`, `softPurple`, `softGold`, `softOrange`, `softGreen` | `"softBlue"` | SBM theme. |
| `DetailsPanePosition` | `right`, `bottom` | `"right"` | Places the Details pane to the right of Folder Contents or below it. |
| `UserInterfaceFontFamily` | `system`, `sans`, `serif`, `mono` | `"system"` | Main UI font family. |
| `UserInterfaceFontSize` | number, 11–20; Options step `0.5` | `12.5` | Base UI font size in pixels. |
| `UserInterfaceLineSpacing` | number, 1.0–1.8; Options step `0.05` | `1.4` | Main UI line-height multiplier. |
| `SidebarMode` | boolean | `false` | Enables SBM's Sidebar-oriented behavior. In `manager.js`, the compact Library-full-view layout is activated when this is enabled and the manager viewport is at most 900 px wide. |
| `SidebarMode_AutoShowOnExpand` | boolean | `true` | In Sidebar/Library-full-view mode, expanding a Library folder automatically enables display of its direct bookmark rows. Disabling it stops future auto-show behavior without immediately hiding bookmarks already shown. |

---

## 1.2 Search

**Options path:** `Search`

| Setting / control ID | Type | Default | What it controls |
|---|---|---:|---|
| `SearchLimitToFolderAndSub` | boolean | `false` | `false`: search across the full bookmark tree. `true`: search only the current folder and its descendants. Also synchronized with the `#search-limit` checkbox in the manager toolbar. |

---

## 1.3 Safety

**Options path:** `Safety`

| Setting / control ID | Type | Default | What it controls |
|---|---|---:|---|
| `DeleteShowWarning` | boolean | `true` | Shows a confirmation before deleting bookmark entries/folders. |
| `SortShowWarning` | boolean | `true` | Shows a confirmation before context-menu sorts that permanently reorder a bookmark folder. |
| `KeyboardDeleteAllow` | boolean | `true` | Allows the keyboard `Delete` key to delete the current selection. |

---

## 1.4 Sorting

**Options path:** `Sorting`

| Setting / control ID | Type | Default | What it controls |
|---|---|---:|---|
| `SortByNameNatural` | boolean | `true` | Controls the permanent **Sort by Name** ordering policy. With natural ordering enabled, folders are placed first, separators next, then bookmarks. |

> Do not confuse this with `state.sort` in `manager.js`. `state.sort` is the current **visual** Folder Contents sort and is not a persisted user setting.

---

## 1.5 Advanced — top-level controls

**Options path:** `Advanced`

These controls are visually top-level inside Advanced. The “Purpose” labels below are logical groupings for this reference, not extra headings currently present in `options.html`.

| Purpose | Setting / control ID | Type | Default | What it controls |
|---|---|---|---:|---|
| Instance handling | `MultipleInstancesAllowed` | boolean | `false` | When disabled, SBM uses single-instance behavior for normal tab launches; the extension button can focus an existing manager tab rather than opening another. |
| Folder interaction | `Folder_SingleClickInteract` | boolean | `false` | `true`: single-click folder interaction. `false`: expansion/navigation actions that use this preference require double-click. |
| Drag/drop | `Folder_AutoExpandOnDrag` | boolean | `false` | Allows a destination folder to auto-expand/open while dragged items hover over it. |
| Drag/drop | `Folder_AutoExpandAfterWait` | number, 0.1–3.0; Options step `0.1` | `1.2` | Delay in seconds before drag-hover folder auto-expand/open. The Options control is disabled when `Folder_AutoExpandOnDrag` is off. |
| Debug gate | `DebugOptions` | boolean | `false` | Reveals debug-only settings/test controls in Options. |

---

## 1.6 Advanced → Startup behavior

| Setting / control ID | Type | Default | What it controls |
|---|---|---:|---|
| `StartAtConfiguredBookmarkFolder` | boolean | `false` | If enabled, SBM starts in the folder selected by `StartupBookmarkFolderId`. |
| `StartupBookmarkFolderId` | string | `""` | Chromium bookmark-folder ID used as the startup folder. If the stored folder becomes invalid/missing, `manager.js` clears both startup settings and falls back to the normal startup folder. |

---

## 1.7 Advanced → Bookmark URL protections

These settings affect **opening** a bookmark through SBM. They do not prevent saving the URL.

| Setting / control ID | Type | Default | Blocked scheme |
|---|---|---:|---|
| `BlockJavascriptBookmarkOpens` | boolean | `true` | `javascript:` |
| `BlockDataBookmarkOpens` | boolean | `true` | `data:` |
| `BlockBlobBookmarkOpens` | boolean | `true` | `blob:` |

---

## 1.8 Advanced → Pane widths

These values can be changed in Options and are also updated when the user drags the matching pane resizer in the manager.

| Setting / control ID | Type / normalized range | Default | Manager UI target |
|---|---|---:|---|
| `left_Lib_Width` | integer, 180–800 px | `260` | Library pane width; `#left-pane-resizer`. |
| `right_Details_Width` | integer, 220–900 px | `320` | Details pane width when `DetailsPanePosition === "right"`; `#right-pane-resizer`. |
| `bottom_Details_Height` | integer, 160–800 px | `260` | Details pane height when `DetailsPanePosition === "bottom"`; `#right-pane-resizer` becomes a horizontal separator. |

---

## 1.9 Advanced → Folder Contents view

`manager.js` maps the five Folder Contents columns as follows:

| UI column | Sort key | Width setting | Visibility setting |
|---|---|---|---|
| Name | `title` | `mid_FC_Width_Name` | always shown |
| URL | `url` | `mid_FC_Width_URL` | always shown |
| Date Added | `dateAdded` | `mid_FC_Width_DateAdded` | `mid_FC_Show_DateAdded` |
| ID | `id` | `mid_FC_Width_ID` | `mid_FC_Show_ID` |
| Order | `index` | `mid_FC_Width_Order` | `mid_FC_Show_Order` |

Exact settings:

| Setting / control ID | Type / normalized range | Default | Effect |
|---|---|---:|---|
| `mid_FC_Width_Name` | integer, 120–1200 px | `240` | Name column width. |
| `mid_FC_Width_URL` | integer, 160–1200 px | `360` | URL column width. |
| `mid_FC_Width_DateAdded` | integer, 82–1200 px | `110` | Date Added column width. |
| `mid_FC_Show_DateAdded` | boolean | `true` | Shows/hides Date Added. |
| `mid_FC_Width_ID` | integer, 56–1200 px | `72` | ID column width. |
| `mid_FC_Show_ID` | boolean | `false` | Shows/hides ID. |
| `mid_FC_Width_Order` | integer, 48–1200 px | `58` | Order/index column width. |
| `mid_FC_Show_Order` | boolean | `true` | Shows/hides Order. |

Column widths may also be updated by the runtime-generated `.column-resizer` controls in the Folder Contents header.

---

## 1.10 Advanced → Advanced Details

| Setting / control ID | Type | Default | What it controls |
|---|---|---:|---|
| `EnableAdvancedDetailsViewing` | boolean | `false` | Shows `#advanced-details` in the Details pane. |
| `EnableAdvancedDetailsEditing` | boolean | `false` | Enables supported advanced edits. Currently, the supported editable advanced field is the bookmark index/order. ID, GUID, Date Added, and Date Last Used remain read-only. |

Dependency: when advanced viewing is disabled, the runtime editing flag is also forced off. Options handling also keeps editing subordinate to viewing.

---

## 1.11 Advanced → Optimisations

| Setting / control ID | Type | Default | What it controls |
|---|---|---:|---|
| `Optimisation_DOMrendering` | boolean | `true` | Enables reduced-DOM-churn rendering paths in selected tree/list/header/drag UI operations. Intended for performance comparison/troubleshooting. |
| `Optimisation_TempBookmarkTreeMaps` | boolean | `true` | Enables short-lived lookup maps during selected bookmark-tree/search/render operations instead of relying only on repeated tree traversal. |

---

## 1.12 Advanced → Debug Settings

This subsection is only visible when `DebugOptions === true`.

| Setting / control ID | Type | Default | What it controls |
|---|---|---:|---|
| `ShowHelpOnLaunch` | boolean | `true` | Shows Help on the next manager launch, then `manager.js` immediately resets the setting to `false`. It can also be toggled from the Help dialog footer. |
| `Show_ErrorsWarnings` | boolean | `false` | Shows the current-session warnings/errors log when debug options are enabled. The **setting** persists; the individual log entries do **not**. |

---

# 2. Options controls that are not persisted settings

These IDs exist in `options.html`, but they are not keys in `DEFAULT_SETTINGS`.

| ID | Purpose | Persistence |
|---|---|---|
| `status` | Short-lived save/reset status text. | none |
| `Folder_AutoExpandAfterWait-value` | `<output>` showing the drag auto-expand slider value. | derived from `Folder_AutoExpandAfterWait` |
| `folder-auto-expand-wait-row` | Wrapper used to enable/disable the delay control. | none |
| `startup-bookmark-folder-row` | Wrapper for startup-folder selection state. | none |
| `debug-settings-group` | Debug subsection wrapper. | none |
| `show-errors-warnings-option-row` | Wrapper for log visibility control. | none |
| `reset` | Resets persisted settings to `DEFAULT_SETTINGS`. | action only |
| `debug-failed-bookmark-operation` | Debug test action. | action only |
| `warnings-errors-log-section` | Current-session diagnostics section. | none |
| `warnings-errors-log` | Current-session log text area. | session/transient records only |
| `clear-warnings-errors-log` | Clears transient diagnostics. | action only |

---

# 3. Main manager UI reference (`manager.html`)

This section documents the static UI IDs/selectors by visible area.

## 3.1 Toolbar

**UI path:** `Manager → Toolbar`

| ID / selector | Element | Purpose / related state or setting |
|---|---|---|
| `#back` | button | Navigate backward through folder history; driven by `state.back`. |
| `#forward` | button | Navigate forward through folder history; driven by `state.forward`. |
| `#new-folder` | button | Create a folder at the current target/location. |
| `#new-bookmark` | button | Create a bookmark at the current target/location. |
| `#search` | search input | Search text; mirrored by transient `state.search`. |
| `#search-limit` | checkbox | Toolbar copy of persisted `SearchLimitToFolderAndSub`. |
| `.app-title` | text | Application title. No element ID. |
| `#app-menu-button` | button | Opens the runtime-generated SBM app menu. |

The app menu itself is generated by `manager.js`, not declared statically in `manager.html`. Current menu actions include the browser bookmark manager, Options, Help, About, and Changelog.

---

## 3.2 Main layout → Library pane

**UI path:** `Manager → Main layout → Library`

| ID / selector | Element | Purpose / related setting/state |
|---|---|---|
| `#layout` | `<main>` | Root pane layout. `DetailsPanePosition` changes its layout class. |
| `.left` | `<nav>` | Library pane container. |
| `#roots` | tree container | Render target for the Library tree. Selection/expansion uses `state.treeSelectedId`, `state.expandedFolders`, and `state.showTreeBookmarks`. |
| `#left-pane-resizer` | separator | Resizes Library pane and persists `left_Lib_Width`. |

Relevant persisted settings:

- `left_Lib_Width`
- `SidebarMode`
- `SidebarMode_AutoShowOnExpand`
- `Folder_SingleClickInteract`
- `Folder_AutoExpandOnDrag`
- `Folder_AutoExpandAfterWait`
- `SearchLimitToFolderAndSub` when searching

Relevant transient/derived state:

- `state.treeSelectedId`
- `state.expandedFolders`
- `state.showTreeBookmarks`
- `LibraryFullView` — derived runtime flag; **not persisted**

---

## 3.3 Main layout → Folder Contents pane

**UI path:** `Manager → Main layout → Folder Contents`

| ID / selector | Element | Purpose / related state or setting |
|---|---|---|
| `#crumbs` | header/bar | Render target for current folder path, visual-sort control, and runtime Details toggle. |
| `#sort` | select | Visual-only sort mode; writes `state.sort` / `state.sortDirection`, not `chrome.storage.local`. |
| `#table-scroll` | scroll container | Scroll area for Folder Contents. |
| `.columns` | header container | Runtime-rendered column headers/resizers. |
| `[data-sort-key="title"]` | header button | Visual sort by Name. |
| `[data-sort-key="url"]` | header button | Visual sort by URL. |
| `[data-sort-key="dateAdded"]` | header button | Visual sort by Date Added. |
| `[data-sort-key="id"]` | header button | Visual sort by bookmark ID. |
| `[data-sort-key="index"]` | header button | Return/use Chromium folder order (“Order”/default index). |
| `#list` | list container | Render target for items in the active folder or search results. |

Persisted settings directly affecting this pane:

- all `mid_FC_Width_*` settings;
- `mid_FC_Show_DateAdded`;
- `mid_FC_Show_ID`;
- `mid_FC_Show_Order`;
- `Folder_SingleClickInteract`;
- `SearchLimitToFolderAndSub`;
- the sorting safety/natural-order settings when permanent context-menu sorts are used.

Transient state directly affecting this pane:

- `state.folderId`
- `state.search`
- `state.sort`
- `state.sortDirection`
- `state.selectedId`
- `state.multiSelect`

---

## 3.4 Main layout → Details pane

**UI path:** `Manager → Main layout → Details`

### 3.4.1 Pane and standard fields

| ID | Element | Purpose / related setting/state |
|---|---|---|
| `#right-pane-resizer` | separator | Resizes Details. Persists `right_Details_Width` in right mode or `bottom_Details_Height` in bottom mode. Orientation changes with `DetailsPanePosition`. |
| `#details-pane` | `<aside>` | Details-pane container. |
| `#open-bookmark-details` | button | Opens the selected bookmark; URL-scheme protection settings apply. |
| `#details-form` | form | Single-selection details editor. |
| `#title-label` | label | Name field wrapper. |
| `#title` | input | Bookmark/folder title. |
| `#url-label` | label | URL field wrapper. |
| `#url` | input | Bookmark URL. |
| `#url-warning` | status text | Inline URL warning/error area. |
| `#parent-label` | label | Parent-folder selector wrapper. |
| `#parent` | select | Parent folder. |
| `#save` | submit button | Save details changes. |
| `#discard` | button | Discard unsaved details changes. |
| `#delete` | button | Delete selected item; `DeleteShowWarning` applies. |

### 3.4.2 Advanced Details

| ID | Purpose | Editable? |
|---|---|---|
| `#advanced-details` | Advanced metadata section; visibility controlled by `EnableAdvancedDetailsViewing`. | section |
| `#advanced-id-label` / `#advanced-id` | Chromium bookmark ID. | read-only |
| `#advanced-guid-label` / `#advanced-guid` | GUID / UUID when available. | read-only |
| `#advanced-date-added-label` / `#advanced-date-added` | Date Added metadata. | read-only |
| `#advanced-date-last-used-label` / `#advanced-date-last-used` | Date Last Used metadata. | read-only |
| `#advanced-index-label` / `#advanced-index` | Bookmark order/index. | editable only when advanced viewing + editing are enabled and the selected node is mutable |

### 3.4.3 Multi-selection / empty Details states

| ID | Purpose |
|---|---|
| `#details-multiselect` | Replaces the normal details form for a multi-selection summary. |
| `#multi-total` | Count of all selected nodes. |
| `#multi-folders` | Count of selected folders. |
| `#multi-bookmarks` | Count of selected bookmarks. |
| `#multi-separators` | Count of selected separators. |
| `#empty-details` | Empty/no-applicable-selection message. |

Persisted settings most directly affecting Details:

- `DetailsPanePosition`
- `right_Details_Width`
- `bottom_Details_Height`
- `EnableAdvancedDetailsViewing`
- `EnableAdvancedDetailsEditing`
- `DeleteShowWarning`
- `BlockJavascriptBookmarkOpens`
- `BlockDataBookmarkOpens`
- `BlockBlobBookmarkOpens`

---

## 3.5 Dialogs → Options

**UI path:** `Manager → Modal dialogs → Options`

| ID | Purpose |
|---|---|
| `#options-modal` | Options modal overlay. |
| `#options-modal-title` | Modal heading. |
| `#options-close` | Close button. |
| `#options-frame-host` | Host for the embedded Options page/frame. |

`options.js` supports both the normal Options page and the embedded in-manager form.

---

## 3.6 Dialogs → Info

**UI path:** `Manager → Modal dialogs → Info`

| ID | Purpose |
|---|---|
| `#info-modal` | Reusable information modal. |
| `#info-modal-title` | Runtime dialog title. |
| `#info-close` | Close button. |
| `#info-content-host` | Runtime content host. |
| `#info-footer` | Optional footer. Used, for example, by Help's “show at launch” toggle. |

`manager.js` reuses this dialog for content such as Help, About, and Changelog.

---

# 4. Important runtime-generated manager controls

These are useful when searching `manager.js`, but they are **not static elements in `manager.html`**.

| Selector / ID | Where it appears | Purpose |
|---|---|---|
| `#toggle-details` | Folder Contents breadcrumb/header area | Runtime-created show/hide Details-pane button; driven by `state.detailsVisible`. |
| `.column-resizer` | Folder Contents column headers | Runtime-created width handles; each stores `data-setting-key` for its `mid_FC_Width_*` setting. |
| `.show-treebookmarks` | Library folders in `LibraryFullView` | Runtime-created per-folder bookmark-visibility (“eye”) toggle. |
| `.app-menu` | near `#app-menu-button` | Runtime-created application menu. |
| `.context-menu` | right-click target | Runtime-created bookmark/folder context menu. |

---

# 5. Central `manager.js` UI state (not persisted settings)

The `state` object is the main transient UI state. None of these fields are entries in `DEFAULT_SETTINGS`.

## 5.1 Navigation and selection

| State field | Meaning |
|---|---|
| `state.tree` | Current loaded bookmark tree. |
| `state.folderId` | Folder currently displayed in Folder Contents. |
| `state.selectedId` | Current single selected node used by the Details UI. |
| `state.treeSelectedId` | Current selected node in the Library pane. |
| `state.activePane` | Keyboard/selection focus domain; initialized to `"tree"` and otherwise used for Library/list routing. |
| `state.back` | Back-navigation folder history. |
| `state.forward` | Forward-navigation folder history. |
| `state.multiSelect` | Multi-selection object: `{ pane, ids, anchorId, focusId }`. |

## 5.2 Search and visual sorting

| State field | Meaning |
|---|---|
| `state.search` | Current search query. |
| `state.sort` | Current visual Folder Contents sort key; default `"index"`. |
| `state.sortDirection` | Current visual sort direction; default `"asc"`. |

These are session/UI state, not the same as the persisted safety/natural-sort settings.

## 5.3 Library state

| State field | Meaning |
|---|---|
| `state.expandedFolders` | Set of expanded Library folder IDs. |
| `state.showTreeBookmarks` | Set of Library folder IDs whose direct bookmarks are shown in Sidebar/Library-full-view mode. |

Related derived global:

| Variable | Meaning |
|---|---|
| `LibraryFullView` | Derived from `SidebarMode` plus the narrow-layout media query (`max-width: 900px`). It is not stored as a setting. |

## 5.4 Details state

| State field | Meaning |
|---|---|
| `state.detailsVisible` | Whether the Details pane is currently shown. |
| `state.detailsOriginal` | Baseline copy used to detect/discard unsaved Details edits. |
| `state.unsavedPromptActive` | Guard against overlapping unsaved-change prompts. |

## 5.5 Drag/drop

| State field | Meaning |
|---|---|
| `state.drag` | Current drag source/selection. |
| `state.dropIndicator` | Current drop-indicator state. |
| `state.dragAutoExpandTimer` | Pending hover auto-expand timer. |
| `state.dragAutoExpandKey` | Identity/key for the pending auto-expand target. |
| `state.dragAutoExpandRow` | Row associated with the pending auto-expand. |
| `state.dragAutoNavigatedFolder` | Tracks whether drag-hover navigation changed the active folder. |

## 5.6 Clipboard, context menus, rendering guards

| State field | Meaning |
|---|---|
| `state.clipboard` | SBM cut/copy state. |
| `state.contextMenu` | Current context-menu target/context. |
| `state.suppressBookmarkEvents` | Guard used while SBM performs mutations that would otherwise trigger redundant event handling. |
| `state.resetMiddleScrollOnNextRender` | Requests a Folder Contents scroll reset on the next render. |
| `state.faviconRefreshToken` | Runtime token used to refresh/bust favicon rendering as needed. |

---

# 6. Fast lookup: setting → visible UI area

| Setting prefix / key | Main visible area |
|---|---|
| `UserInterface*` | Whole manager + Options page |
| `ThemeMode` | Whole manager + Options page |
| `DetailsPanePosition` | Main layout / Details |
| `SidebarMode*` | Library / Sidebar layout |
| `SearchLimitToFolderAndSub` | Toolbar Search + search results |
| `DeleteShowWarning` | Delete actions / Details / context menus |
| `SortShowWarning` | Permanent context-menu sorting |
| `KeyboardDeleteAllow` | Keyboard handling in Library / Folder Contents |
| `SortByNameNatural` | Permanent Sort by Name |
| `Folder_*` | Library + Folder Contents folder interaction / drag-drop |
| `StartAtConfiguredBookmarkFolder` | Manager startup |
| `StartupBookmarkFolderId` | Manager startup |
| `Block*BookmarkOpens` | Bookmark-opening actions, including Details “Open Bookmark” |
| `left_Lib_Width` | Library pane |
| `right_Details_Width` | Right-side Details pane |
| `bottom_Details_Height` | Bottom Details pane |
| `mid_FC_*` | Folder Contents columns |
| `EnableAdvancedDetails*` | Details → Advanced Details |
| `Optimisation_*` | Rendering/search/tree implementation; mostly no direct visual control outside Options |
| `DebugOptions` | Options → Debug visibility |
| `ShowHelpOnLaunch` | Help dialog / startup |
| `Show_ErrorsWarnings` | Options → transient diagnostics log |
| `MultipleInstancesAllowed` | Extension launch / manager instance handling |

---

# 7. Source files to check when maintaining this reference

| File | Role |
|---|---|
| `settings.js` | Canonical defaults and normalization/validation. |
| `options.html` | User-facing setting controls and Options category/subcategory layout. |
| `options.js` | Settings load/save, dependency UI, reset behavior, embedded Options behavior. |
| `manager.html` | Static manager layout and DOM IDs. |
| `manager.js` | Runtime settings copies, transient UI state, rendering, interactions, persistence from pane/column resizing. |
| `theme.js` | Theme normalization/application. |
| `i18n.js` | Language normalization and language selector population. |
| `session_log.js` | Transient warnings/errors log; log records are not normal persisted settings. |

---

# 8. Short mental model

When looking up a preference:

```text
What does the user see?
    → find its category in options.html
What is the exact persisted name?
    → use the control id / DEFAULT_SETTINGS key
What values are valid?
    → settings.js normalizeSettingValue()
What does it change in the manager?
    → manager.js applySettings() + render/interaction code
Where is that UI?
    → manager.html ID/region tables in this document
```

When looking up manager-only UI state:

```text
DOM target / visible region
    → manager.html

Current non-persistent state
    → manager.js state

User preference / persisted behavior
    → settings.js DEFAULT_SETTINGS
```
