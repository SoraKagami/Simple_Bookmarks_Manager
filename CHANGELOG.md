## 0.7.8

- Added optional experimental `Optimisation_DOMrendering` setting, enabled by default.
- Added an Advanced Options page toggle for the DOM rendering optimization with a short experimental warning/description.
- Made the v0.7.7 DOM rendering improvements switchable for benchmarking/troubleshooting, including fragment replacement, per-render cut-ID sets, drag/drop indicator churn reduction, and async icon decoding hints.
- Updated `manifest.json` to `0.7.8`.

# Changelog

## 0.7.7

- Performed a focused DOM rendering/performance pass.
- Added shared row-selection and fragment-replacement helpers to reduce duplicated DOM update logic.
- Updated Library tree and middle-list rendering to use `DocumentFragment` replacement paths.
- Reduced repeated clipboard cut-state scans during row rendering by computing a per-render cut-ID set.
- Reduced drag/drop DOM class churn by tracking the active drop indicator instead of scanning all rows on every dragover event.
- Added asynchronous image decoding hints for row icons/favicons.
- Kept behavior unchanged while improving rendering readability and reducing unnecessary UI work.
- Updated `manifest.json` to `0.7.7`.

## 0.7.6

- Added optional experimental `Optimisation_TempBookmarkTreeMaps` setting, enabled by default.
- Added an Advanced Options page toggle for temporary bookmark tree maps with an experimental warning description.
- Implemented short-lived bookmark tree lookup maps for selected render/search/tree-walk paths; maps are rebuilt from the currently loaded bookmark tree and discarded after the operation.
- Kept the optimization optional so it can be disabled for troubleshooting without changing normal bookmark behavior.
- Updated `manifest.json` to `0.7.6`.

## 0.7.5

- Replaced native bookmark create/edit URL prompts with an in-page bookmark editor dialog so invalid URLs keep the dialog open for correction.
- Added inline local-only URL validation feedback to the new bookmark dialog used by toolbar and context-menu creation flows.
- Updated context-menu bookmark editing to use the same validation dialog, preventing silent failure when an invalid URL is entered.
- Kept validation local-only; SBM does not access websites or perform network URL checks.
- Updated `manifest.json` to `0.7.5`.

## 0.7.4

- Fixed invalid bookmark URL creation such as `https://` so Chrome bookmark API errors no longer surface as uncaught promise exceptions.
- Changed bookmark create/save behavior so locally invalid URLs are blocked before mutation instead of being sent to Chrome's bookmark API.
- Prevented malformed `about:` URLs from being treated as bookmark/folder shape changes during save operations.
- Kept URL validation local-only; SBM does not access websites or perform network URL checks.
- Updated `manifest.json` to `0.7.4`.

## 0.7.3

- Performed an input validation and sanitisation pass for bookmark/folder creation, editing, paste, move, and drag/drop paths.
- Added local-only URL warning text in the Details pane; URLs are not checked over the network and nonstandard URLs are still allowed if Chrome accepts them.
- Sanitised hidden control characters from bookmark/folder names and URLs before create/update/copy-paste operations.
- Added defensive parent-folder and move-index validation before bookmark create/move operations.
- Added clipboard snapshot and paste-target validation to reduce stale or malformed payloads reaching Chrome bookmark mutation APIs.
- Added drag/drop move-target validation for safer multi-selection movement.
- Updated `manifest.json` to `0.7.3`.

## 0.7.2

- Moved version history out of `README.md` into this dedicated `CHANGELOG.md` file.
- Moved the v0.7.0 and v0.7.1 maintenance audit notes out of `SOURCE_AUDIT.md` and integrated them into this changelog.
- Kept `SOURCE_AUDIT.md` focused on source/provenance and licensing audit details.
- Updated `manifest.json` to `0.7.2`.

## 0.7.1

- Performed a dedicated maintenance code check for dead code, duplicated helper logic, confusing naming, and fragile logic.
- Locale packs outside `_locales/en` were intentionally excluded from this code-analysis pass.
- Removed unused helper functions that were left behind by earlier selection/context-menu refactors.
- Centralized shared settings defaults, font options, and setting normalization into `settings.js` so the manager and Options page cannot silently drift apart.
- Simplified bookmark move-index normalization by removing an unused argument and stale call-site option.
- Identified follow-up candidates for later v0.7.x work: defensive validation around bookmark URLs, move targets, clipboard payloads, drag/drop payloads, cache/index refactoring, and DOM rendering optimization.
- Updated `SOURCE_AUDIT.md` version metadata.
- Updated `manifest.json` to `0.7.1`.

## 0.7.0

- Added documentation comments and section headers to `manager.js`, `options.js`, and `i18n.js` to clarify state management, selection/multi-selection, drag/drop, rendering, settings, and localization responsibilities.
- Performed a low-risk readability and maintenance audit without intended behavior changes.
- Verified during review that user-controlled bookmark titles, URLs, and translated labels are assigned through DOM APIs such as `textContent`, attributes, or form values rather than HTML injection.
- Confirmed bookmark mutations continue to route through Chrome's `chrome.bookmarks` API and reload the bookmark tree after changes to reduce stale local state.
- Identified later hardening/performance candidates: repeated tree traversal, full-pane rendering, URL validation, bookmark move-index bounds, clipboard payload validation, and drag/drop target validation.
- Updated `SOURCE_AUDIT.md` version metadata.
- Updated `manifest.json` to `0.7.0`.

## 0.6.3

- Finished translating remaining English fallback strings in the v0.6.2 language packs for Japanese, Korean, Spanish, French, German, Portuguese (Brazil), Italian, Dutch, Polish, Turkish, Vietnamese, Indonesian, and Hebrew.
- Updated translated strings for Options page descriptions, Details toggle labels, context-menu entries, prompts, confirmation dialogs, alerts, and sort tooltips.
- Kept the Te Reo Māori language pack intentionally mixed with NZ/GB English where a safe/common Māori UI translation is not available.
- Updated `manifest.json` to `0.6.3`.

## 0.6.2

- Added UI language packs for Japanese, Korean, Spanish, French, German, Portuguese (Brazil), Italian, Dutch, Polish, Turkish, Vietnamese, Indonesian, Hebrew, and Te Reo Māori.
- Added Hebrew right-to-left handling when Hebrew is selected.
- Added browser-language matching improvements for Hebrew legacy `iw`, Portuguese variants, and Chinese regional variants.
- Kept Te Reo Māori intentionally mixed with NZ/GB English where a safe/common Māori UI translation does not exist or was not safe to infer.
- Updated `manifest.json` to `0.6.2`.

## 0.6.1

- Added Traditional Chinese (`zh_TW`) and Simplified Chinese (`zh_CN`) UI language files.
- Added a debug/test **N3tsp34k** language pack using a nonstandard internal locale folder so Chromium locale validation is not affected.
- Updated the Options page **User Interface Language** dropdown to include English, 繁體中文, 简体中文, and N3tsp34k.
- Added browser-language matching for Chinese script variants such as `zh-Hant` and `zh-Hans`.
- Changed the default UI font size from `14` to `12.5`, and changed the font-size option step to `0.5`.
- Updated `manifest.json` to `0.6.1`.

## 0.6.0

- Added Chromium-style localization infrastructure using `default_locale`, `_locales/en/messages.json`, and a shared `i18n.js` helper.
- Added persistent **User Interface Language** setting to the Options page, defaulting to **Automatic / Browser Default**.
- Converted the manager and Options page UI to localization keys so later v0.6.x releases can add translated language files without redesigning the UI.
- Localized app/menu labels, toolbar text, Details pane labels, Options page labels, context-menu labels, confirmation dialogs, prompts, alerts, and sort tooltips through the shared helper.
- Kept English as the only packaged language for v0.6.0 to validate the localization plumbing before adding translated language packs.
- Updated `manifest.json` to `0.6.0`.

## 0.5.4

- Fixed the **Font** option so changing the font family reliably updates the bookmark manager UI.
- Applied the configured font family, base font size, and line spacing to the Options page and embedded Options popup.
- Updated the Font dropdown so each font option is displayed using the font it represents.
- Updated version to `0.5.4`.

## 0.5.3

- Added a **User Interface** group to the Options page above the Search group.
- Added persistent controls for the bookmark manager font family, base font size, and line spacing.
- Updated manager styling so section headers and smaller UI labels scale relative to the configured base font size instead of using unrelated fixed text sizes.
- Updated version to `0.5.3`.

## 0.5.2

- Changed the default for **Limit Search to Current Folder & Subfolders** to on/true.
- Updated permanent **Sort by Name** and **Sort by Date** warning dialogs to name the folder being sorted.
- Updated version to `0.5.2`.

## 0.5.1

- Changed the default for **Enable advanced details viewing** to off/false.
- Updated the app menu **Options** entry to open a centered in-page options dialog instead of opening a separate tab.
- Reused the existing `options.html`, `options.css`, and `options.js` inside the manager via an iframe so Chromium's normal Extension options page remains available separately.
- The in-page options dialog is created only when opened and removed when closed to avoid keeping the Options page loaded unnecessarily.
- Updated version to `0.5.1`.

## 0.5.0

- Added a standard Chromium Options page using `options_ui` with `open_in_tab`.
- Added `options.html`, `options.css`, and `options.js` for persistent extension settings.
- Added the `storage` permission and moved configurable settings to `chrome.storage.local`.
- The existing top-toolbar **Limit Search to / Current Folder & Subfolders** checkbox now persists through the shared settings system.
- Added Options page controls for search scope, delete warning, permanent sort warning, Delete-key deletion, natural sort order, and advanced details viewing/editing.
- Enabled the app menu **Options** entry so it opens the new Options page.
- Removed the temporary Details-pane debug toggles now that the settings live in the Options page.
- Updated version to `0.5.0`.

## 0.4.5

- Added folder context-menu commands for Expand All and Collapse All at the bottom of the folder menu.
- Expand All expands the selected Library folder and all nested subfolders in the tree view.
- Collapse All collapses the selected Library folder and all nested subfolders, safely moving selection to the collapsed folder if the active selection was inside that subtree.
- Updated version to `0.4.5`.

## 0.4.4

- Updated Library tree drag/drop targeting so folder rows use the same above / into / below drop zones as the middle bookmark list.
- Multi-selected middle-pane items can now be dropped above or below a target Library folder, in addition to being dropped into it.
- The above/below Library drop path preserves the dragged selection's relative order and avoids invalid drops into selected folders or descendants.
- Updated version to `0.4.4`.

## 0.4.3

- Fixed Library tree collapse behavior when collapsing an ancestor of the active/selected folder.
- Collapsing an expanded parent folder now changes the Library selection/current folder to that parent before collapsing, instead of being ignored by automatic path expansion.
- Updated version to `0.4.3`.

## 0.4.2

- Fixed Library tree multi-select drag/drop so all selected folders are moved together instead of only the first dragged folder.
- Library tree multi-folder drag/drop now preserves the selected folders' relative order when moving above, into, or below a valid target folder.
- Fixed middle-pane multi-select drops onto Library tree folders so the active drag selection is used consistently and all selected items are moved into the target folder.
- Updated version to `0.4.2`.

## 0.4.1

- Updated middle-pane multi-select drag/drop so folder rows support three drop outcomes: above the folder, into the folder, or below the folder.
- Multi-selected middle-pane items can now be dragged into a target folder when that folder is not part of the current selection and is not a descendant of a selected folder.
- Added support for dragging multi-selected middle-pane items into folders in the Library tree.
- Updated version to `0.4.1`.

## 0.4.0

- Added isolated multi-select support for the Library tree and middle bookmark list.
- Added Ctrl-click toggling and Shift-click range selection modeled after Windows File Explorer selection behavior.
- Multi-select is isolated per pane; selections are not shared across the Library tree and middle bookmark list.
- Added Details Multiselect mode showing total selected items, folders, bookmarks, and separators.
- Added multi-select context menu actions for Delete, Cut, Copy, Paste, and Open All variants.
- Multi-select Delete, Cut, Copy, Paste, and folder-aware Open All operations now operate on the selected group where valid.
- Library multi-select ignores root folders and collapses parent/child folder conflicts to a single higher-level folder selection for safer folder operations.
- Added middle-pane drag-and-drop support for multi-selected items while preserving their relative order.
- Escape now cancels an active multi-selection.
- Updated version to `0.4.0`.

## 0.3.30

- Fixed Library pane **End** key behavior so it targets the lowest visible folder within the current root tree first, instead of jumping directly to another root tree.
- Library pane **End** now only moves to the next root tree when the current selection is already on the lowest visible folder in the current root tree.
- Fixed Library pane **Home** key behavior so it targets the root of the current tree first, and only moves to the previous root when the current selection is already a root folder.
- Updated version to `0.3.30`.

## 0.3.29

- Added `SearchLimitToFolderAndSub`, defaulted to `false`.
- Added a top-toolbar checkbox labelled **Limit Search to / Current Folder & Subfolders** between the search box and the app title.
- When the checkbox is enabled, bookmark search is limited to the currently viewed folder and its subfolders.
- When the checkbox is disabled, bookmark search searches across all bookmark folders.
- Updated version to `0.3.29`.

## 0.3.28

- Added **Home** / **End** keyboard navigation.
  - Library pane: **Home** selects the first visible root folder; **End** selects the last visible folder in the currently expanded tree without expanding more branches.
  - Middle pane: **Home** selects the first visible item; **End** selects the last visible item.
- Changed **Backspace** from delete behavior to folder-up navigation.
  - Library pane: selects the valid parent folder.
  - Middle pane: navigates to the parent of the current visible folder while keeping middle-pane focus behavior.
- Keyboard deletion now uses **Delete** only; **Backspace** no longer deletes bookmark entries.
- Added **Ctrl+F** handling inside Simple Bookmarks Manager to focus/select the Search bookmarks field.
- Updated version to `0.3.28`.

## 0.3.27

- Corrected Library tree **Arrow Left** behavior:
  - no selected folder: no action
  - expanded folder with child folders: collapse it
  - collapsed folder with child folders: select its valid parent folder
  - folder without child folders: select its valid parent folder
- Fixed middle-pane folder navigation so opening a subfolder from the middle pane keeps keyboard focus/active-pane behavior in the middle pane instead of switching to the Library tree.
- Updated version to `0.3.27`.

## 0.3.26

- Fixed broken mouse selection/open behavior in the Library tree and middle bookmark list after the v0.3.25 keyboard-navigation update.
- Changed pane focus handling so focus changes update selection highlighting without rebuilding the pane DOM during mouse clicks.
- Changed **Arrow Left / Arrow Right** behavior:
  - Middle pane: no action.
  - Library tree: **Left** collapses an expanded folder with subfolders, or moves to the parent only when the selected folder has no subfolders.
  - Library tree: **Right** expands a collapsed folder with subfolders, or navigates into the first child folder when already expanded.
- Kept **Arrow Up / Arrow Down** and **Enter** keyboard navigation behavior from v0.3.25.
- Updated version to `0.3.26`.

## 0.3.25

- Added keyboard navigation for the Library tree and middle bookmark list.
- **Arrow Left / Arrow Right** now switches active keyboard focus between the Library tree and middle bookmark list.
- **Arrow Up / Arrow Down** now moves selection within the active pane.
- If no middle-list item is selected, **Arrow Down** selects the first visible entry and **Arrow Up** selects the last visible entry.
- **Enter** opens the active selection: folders navigate into that folder, bookmarks open in a new tab, and separators do nothing.
- Keyboard navigation ignores editable fields so Details pane text input remains normal.
- Updated version to `0.3.25`.

## 0.3.24

- Fixed middle-pane add behavior so new bookmarks, folders, and separators are always created in the current visible folder.
- When a folder row is selected or right-clicked in the middle pane, new items now insert below that folder row instead of inside that folder.
- Kept existing placement behavior where middle-pane add actions insert below the selected/clicked row when possible, or append to the current folder when there is no valid row target.
- Library tree folder context-menu add actions still create new items inside the clicked Library folder.
- Updated version to `0.3.24`.

## 0.3.23

- Fixed Library tree deletion fallback selection.
- After deleting a folder from the Library tree, the manager now selects only a same-parent sibling at the same depth: next sibling first, then previous sibling.
- If no same-parent sibling exists, the Library selection is cleared instead of selecting the parent, root, or another branch.
- Prevented repeated Delete/Backspace from climbing the tree and deleting unrelated folders when delete warnings are disabled.
- Updated version to `0.3.23`.

## 0.3.22

- Added active-pane selection tracking so only the currently focused pane uses the strong selected highlight.
- Changed inactive selections in other panes to a washed-out highlight while keeping the current folder visible in the Library tree.
- Keyboard Delete / Backspace now only acts on the active middle-list or Library-tree selection, not a stale selection in another pane.
- After deleting a middle-pane item, selection moves to the next visible item at the same position, then the previous item, then nothing if neither exists.
- After deleting a Library folder, selection stays within the Library tree when possible instead of jumping to another pane.
- Updated version to `0.3.22`.

## 0.3.21

- Added `KeyboardDeleteAllow`, defaulted to `true`.
- Added keyboard delete handling for **Delete** and **Backspace** when a bookmark, folder, or separator is selected outside editable text fields.
- Keyboard deletion now calls the same delete flow used by the Details pane and context menu.
- Added `DeleteShowWarning`, defaulted to `true`.
- Delete confirmation prompts now respect `DeleteShowWarning`; disabling it deletes without the confirmation popup.
- Added a temporary Details-pane debug toggle for `DeleteShowWarning` below `SortShowWarning`.
- Updated version to `0.3.21`.

## 0.3.20

- Visual sort now resets to **Default** whenever the user navigates to a different folder, including Back/Forward navigation.
- Added `SortShowWarning`, defaulted to `true`, to warn before applying permanent folder sorts from the right-click menu.
- Added a temporary Details-pane debug toggle for `SortShowWarning` below `SortByNameNatural`.
- The warning clarifies that right-click **Sort by Name** and **Sort by Date** permanently change Chromium's saved bookmark order, unlike the temporary **Visual sort** dropdown.
- Updated version to `0.3.20`.

## 0.3.19

- Replaced the separate **Import Bookmarks** and **Export Bookmarks** application-menu entries with a single **Open Default Bookmarks Manager** entry.
- The new entry opens `chrome://bookmarks/`, allowing Chromium/Brave or any active browser-level override to handle the default bookmark manager workflow.
- Kept **Options**, **Help**, and **About** disabled for later implementation.
- Updated version to `0.3.19`.

## 0.3.18

- Added a hamburger application menu button to the right of the **Simple Bookmarks Manager** title in the top toolbar.
- Added application menu entries in this order: **Import Bookmarks**, **Export Bookmarks**, separator, **Options**, **Help**, **About**.
- Kept **Options**, **Help**, and **About** disabled as placeholders for later implementation.
- Added placeholder alerts for **Import Bookmarks** and **Export Bookmarks** explaining that Chromium's native Bookmark Manager import/export code path is not exposed through a supported extension API.
- Updated version to `0.3.18`.

## 0.3.17

- Fixed Mouse4/Mouse5 navigation triggering two folder-history steps per click.
- Side-button navigation now runs only once per physical button press while still suppressing Chromium's built-in page-history action inside the manager tab.
- Updated version to `0.3.17`.

## 0.3.16

- Added unsaved-change protection before creating new bookmarks, folders, or separators.
- If the Details pane has unsaved edits, add actions now show the existing **Unsaved changes** prompt and stop the add operation for that click.
- Prevented new-item creation from automatically discarding modified Details pane data.
- Applies to toolbar add buttons and all right-click menu add actions.
- Updated version to `0.3.16`.

## 0.3.15

- Fixed a false Details pane dirty-state condition when selecting Chromium root-level folders such as **Bookmarks bar** or **Other bookmarks**.
- Preserved root-level folders' saved parent value with a disabled **Browser root** placeholder in the Parent folder dropdown, instead of allowing the dropdown to become blank.
- Prevented the false **Unsaved changes** popup that appeared after switching from a non-root folder to a root-level folder.
- Updated version to `0.3.15`.

## 0.3.14

- Changed folder context-menu **Sort by Name** behavior when `SortByNameNatural` is enabled.
- Natural name sorting now places folders first sorted by name, then separators as a group, then bookmarks sorted by name.
- Added the debug toggle `SortByNameNatural` below the existing Advanced Details debug toggles.
- `SortByNameNatural = false` preserves the previous behavior where every child item is sorted together by name.
- Updated version to `0.3.14`.

## 0.3.13

- Fixed same-folder downward drag/drop ordering so moving an item below a later row no longer lands one position too high.
- Fixed Advanced Details **Sort order** changes for same-folder downward moves so Chromium's own index handling is not double-adjusted.
- Kept upward moves and moves around separators working with the computed Chromium child order.
- Updated version to `0.3.13`.

## 0.3.12

- Changed add-item placement so when a folder is selected, new bookmarks, folders, and separators are added inside the selected folder instead of below it.
- Changed folder right-click add actions to add inside the clicked folder.
- Fixed bookmark tree indexing by computing each child node's order from Chromium's returned child array, including separator bookmarks.
- Fixed drag/drop before/after moves around separators by normalizing destination indexes against the full child list.
- Fixed Advanced Details **Sort order** moves around separators by using the same normalized move-index logic.
- Updated version to `0.3.12`.

## 0.3.11

- Changed add-item placement for new bookmarks, folders, and separators.
- When a bookmark, folder, or separator row is selected, toolbar add actions now insert the new item immediately below the selected row when that row is a visible child of the current folder.
- Row right-click add actions now insert the new item immediately below the clicked bookmark/folder/separator row when sibling insertion is valid.
- Empty-space right-click add actions use the current selected row for insertion when possible, otherwise they append to the current folder as before.
- Root folder right-click add actions safely fall back to adding inside the root folder because sibling insertion beside Chromium root folders is not valid.
- Updated version to `0.3.11`.

## 0.3.10

- Renamed the visual sort dropdown option from **Unsorted** to **Default**.
- Added a bold **Visual sort:** label to the left of the sort dropdown in the middle-pane path bar.
- Added an Advanced Details section below the Details pane action buttons.
- Added read-only metadata fields for ID, GUID / UUID, Date Added, Date Last Used, and Sort order.
- Added temporary debug toggles for `EnableAdvancedDetailsViewing` and `EnableAdvancedDetailsEditing`.
- Added advanced dirty-state support that only checks editable advanced fields when `EnableAdvancedDetailsEditing` is enabled.
- Added save/discard support for the editable advanced Sort order field through Chromium's bookmark move/index behavior.
- Documented that Chromium exposes most bookmark metadata fields as read-only through the bookmarks API, so only supported fields are editable.
- Updated version to `0.3.10`.

## 0.3.9

- Reordered the bookmark right-click menu for consistency with the folder menu.
- Moved **Add New Bookmark**, **Add New Folder**, and **Add Separator** to immediately below **Paste**, separated by a single menu divider.
- Removed the divider between **Edit** and **Delete** in the bookmark right-click menu.
- Updated version to `0.3.9`.

## 0.3.8

- Fixed Details pane dirty-state handling after saving changes so navigating away no longer incorrectly triggers the **Unsaved changes** prompt.
- Suppressed intermediate bookmark-change refreshes while saving Details pane edits, then rebuilt the clean Details baseline from the refreshed Chromium bookmark tree.
- Ensured **Discard Changes** restores the saved baseline and refreshes the parent-folder dropdown without leaving stale dirty-state indicators.
- Ensured deleting the selected bookmark/folder clears the old Details baseline before selecting the current folder.
- Updated version to `0.3.8`.

## 0.3.7

- Moved the sort dropdown out of the top toolbar and into the middle-pane path bar.
- Positioned the sort dropdown immediately to the left of the **Click to Hide Details / Click to Show Details** button.
- Moved the displayed extension name **Simple Bookmarks Manager** to the right of the search field in the top toolbar.
- Updated version to `0.3.7`.

## 0.3.6

- Replaced the extension icon set with the newly supplied icon.
- Fixed Details pane form saving so pressing **Enter** in the **Name** or **URL** field saves changes without resetting the **Parent folder** dropdown.
- Fixed clicking **Save** in the Details pane so the **Parent folder** dropdown no longer resets unexpectedly.
- Fixed Details pane dirty-state handling after save so modified labels revert from dark blue bold styling back to the normal unmodified state.
- Improved Details pane parent-folder option rendering so the current dropdown selection is preserved correctly across safe re-renders.
- Updated version to `0.3.6`.

## 0.3.5

- Fixed middle-pane single-click selection causing the bookmark list to jump back to the top.
- Fixed drag/drop rearranging or moving bookmark items causing the middle pane to jump back to the top after refresh.
- Preserved middle-pane vertical and horizontal scroll position during same-folder re-renders.
- Reset the middle-pane scroll only when intentionally navigating to a different folder.
- Converted the main panes into independent scroll regions so the left Library pane, middle bookmark table, and right Details pane scroll separately.
- Kept the top toolbar/search bar visible while the Library, middle, or Details panes scroll.
- Updated version to `0.3.5`.

## 0.3.4

- Replaced the extension icon set with the newly supplied book-and-bookmark icon.
- Added separator support using a Chromium-compatible bookmark convention: any bookmark whose title is `———` and URL is `about:blank` is treated as a separator in the manager UI.
- Rendered separator bookmarks in the middle pane as a horizontal rule spanning the table width.
- Prevented separator bookmarks from opening on double-click while keeping them selectable, editable, draggable, and reorderable like normal bookmark entries.
- Added **Add Separator** to the folder, bookmark, and empty-space context menus.
- Renamed folder context-menu entries **Add Bookmark** / **Add Folder** to **Add New Bookmark** / **Add New Folder** for consistency.
- Excluded separator bookmarks from **Open All** context-menu actions so they do not open blank tabs or windows.
- Updated version to `0.3.4`.

## 0.3.3

- Fixed Details pane unsaved-change detection so edited fields are preserved across incidental re-renders.
- Selection changes now check for unsaved Details pane edits before selecting a different bookmark or folder.
- Folder navigation now stays blocked until the user chooses **Keep Editing**, **Save**, or **Discard**.
- Prevented overlapping unsaved-change prompts from causing delayed or random prompts after later navigation.
- Updated version to `0.3.3`.

## 0.3.2

- Added an unsaved-changes prompt when navigating to another folder with edited Details pane fields.
- The prompt offers **Keep Editing**, **Save**, or **Discard**.
- Added a **Discard Changes** button between **Save** and the delete button in the Details pane.
- Changed the Details pane delete button text dynamically to **Delete Bookmark** or **Delete Folder**.
- Hidden the URL label/input when a folder is selected, and restored it for bookmarks.
- Changed modified Details pane field labels to dark blue bold text until saved or discarded.
- Updated version to `0.3.2`.

## 0.3.1

- Added a conditional **Paste** entry to the empty-area right-click menu outside the Details pane.
- The empty-area **Paste** entry appears only when the manager has a valid cut/copied bookmark or folder that can be pasted into the current folder.
- Updated version to `0.3.1`.

## 0.3.0

- Added a custom in-page right-click menu for bookmark and folder rows outside the Details pane.
- Folder menu actions include rename, delete, cut/copy/paste, sort by name/date, add bookmark/folder, and open-all variants.
- Bookmark menu actions include edit, delete, cut/copy/paste, open variants, and add bookmark/folder.
- Empty-area right-click outside the Details pane offers add bookmark/folder actions.
- Cut items remain visible and are dimmed until pasted elsewhere.
- Copy/paste supports bookmark nodes and recursive folder copies inside the manager session.
- Split View menu entries are hidden because no stable Chromium extension API is available.
- Tab Group entries are shown only if the browser supports `chrome.tabs.group()`.
- Updated version to `0.3.0`.

## 0.2.12

- Removed the unnecessary `tabs` permission from `manifest.json`.
- Kept tab-opening behavior via `chrome.tabs.create()` for the toolbar action and bookmark opening.
- Added an efficient favicon refresh token that updates when switching folders.
- The refresh only affects visible bookmark row image URLs and does not store favicons in memory, avoiding long-lived favicon cache growth inside the extension page.

## 0.2.11

- Added icons to the left of folder labels in the Library tree.
- Added icons to the left of each folder/bookmark in the middle bookmark list.
- Uses the bundled `SBM FolderIcon.png`-derived folder icon for folders.
- Uses Chromium's extension favicon endpoint for bookmark favicons, allowing cached site icons and Chromium fallback behavior where available.
- Added the `favicon` permission needed for Chromium extension favicon access.

## 0.2.10

- Added double-click expand/collapse behavior in the left Library folder tree.
- Double-clicking a folder row or label with child subfolders now toggles that branch open or closed at that level.
- Single-click selection/navigation behavior remains unchanged.

## 0.2.9

- Renamed the Details pane button text from **Details On / Details Off** to action-oriented labels:
  - **Click to Hide Details** when the pane is visible.
  - **Click to Show Details** when the pane is hidden.
- Kept the existing Details pane show/hide behavior and tooltips unchanged.

## 0.2.8

- Restored middle-pane horizontal scrolling by wrapping headers and rows in one shared table content area.
- Column headers and bookmark/folder rows now scroll horizontally together when the available width is too narrow.
- Kept the header row sticky for vertical scrolling.

## 0.2.7

- Fixed narrow-window horizontal scrolling so the middle-pane column headers and bookmark rows scroll together.
- The header row now stays visible while vertically scrolling the bookmark list.

## 0.2.6

- Added a **Click to Hide Details / Click to Show Details** button at the right side of the folder path bar.
- The Details pane is visible by default.
- Turning the toggle off hides the right Details pane and lets the middle bookmark list use the extra width.
- Button tooltips update between **Hide the Details pane** and **Show the Details pane**.

## 0.2.5

- Added explicit sort tooltips for column headers and the sort selector:
  - Name: A to Z / Z to A.
  - URL: A to Z / Z to A.
  - Date Added: oldest first / newest first.
  - ID: lowest first / highest first.
- Added a narrow **Order** column that shows Chromium's actual per-folder bookmark order/index.
- Made the **Order** column header act like the toolbar **Unsorted** option: it returns the middle pane to Chromium's default folder order and does not reverse-sort.

## 0.2.4

- Removed the disabled `Replace default bookmark manager` UI and related documentation because runtime replacement is not available to extensions.
- Added sortable middle-pane column headers for **Name**, **URL**, **Date Added**, and **ID**.
- Added a narrow **ID** column showing each bookmark/folder node ID.
- Added the same **ID** sort option to the toolbar sort selector.
- Kept drag reordering disabled while sorted/search views are active.

## 0.2.3

- Added Mouse4/Mouse5 support while the manager page is active:
  - Mouse4 calls the same function as **Back**.
  - Mouse5 calls the same function as **Forward**.
- Updated README references and limitations.

## 0.2.2

- Renamed the extension to **Simple Bookmarks Manager**.
- Added extension icons generated from `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, and `icons/icon-128.png`.
- Removed `chrome_url_overrides.bookmarks` so the default Chromium/Brave Bookmark Manager is no longer replaced.
- Kept moved items' drag/drop target behavior, but after moving an item into a folder the view now remains in the current folder when possible.
- Documented that Chrome extensions cannot insert a first-class item directly below Chromium/Brave's built-in Bookmark Manager menu entry.

## 0.2.1

- Added “drop into folder” behavior for folder rows in both the middle list and left tree.
- Enabled dragging bookmarks/folders from the middle pane onto left-pane folders.
- Enabled dragging folders from the left pane into folders shown in the middle pane.
- Preserved before/after row reordering when dropping near the top or bottom of a target row.
- Improved same-parent index calculation for before/after moves.

## 0.2.0

- Added drag-and-drop reordering in the main bookmark list when viewing natural order.
- Added drag-and-drop reordering for non-root folders in the left tree.
- Protected Chromium/Brave root folders from drag moves.
- Added visual drop indicators and guarded drag behavior while search/sort views are active.
- Bumped extension version to `0.2.0`.

## 0.1.2

- Added `LICENSE` using MPL 2.0.
- Added `SOURCE_AUDIT.md` documenting that no Firefox source code was copied.
- Updated README with licensing rationale and source audit summary.
- Bumped extension version to `0.1.2`.

## 0.1.1

- Added a nested, collapsible folder tree in the left pane.
- Current folder ancestors auto-expand so the selected folder remains visible.
