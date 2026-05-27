# Simple Bookmarks Manager

Version: 0.3.11

A Manifest V3 Chrome/Chromium extension that provides a simple local bookmark manager inspired by Firefox Places Library ideas.

This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. See `LICENSE`.

## License decision

- **No Mozilla Firefox source files or copied Firefox code are included.**
- The implementation was written from scratch for Chrome/Chromium's extension APIs.
- Firefox ESR 140 was used only as design reference for bookmark-manager concepts: Places-style tree organization, active folder contents, details editing, recursive search, and live refresh.
- Because no Mozilla source code was copied or modified, this project does **not** need to include Mozilla's Firefox source-code notices as third-party notices.
- The project is intentionally licensed under **MPL 2.0**, matching Mozilla's open-source spirit while keeping copyleft file-scoped and compatible with permissive code in larger works.

## Firefox-inspired behavior

- Left-pane folder tree with collapsible subfolders, including double-click expand/collapse on folders with subfolders.
- Drag-and-drop reordering for non-root folders in the left-pane tree.
- Drag-and-drop moves into folder rows from either the main list or left folder tree.
- Right-pane active folder contents with drag-and-drop reordering in natural order.
- Independent scrolling for the Library tree, middle bookmark table, and Details pane.
- Search scoped to the active folder, recursively.
- Back/forward navigation between selected folders.
- Mouse4/Mouse5 history navigation while the manager page is active.
- Hideable details pane for title, URL, parent folder, deletion, discard, and unsaved-change warnings.
- Bookmark favicons and folder icons in the left Library tree and middle bookmark list.
- Separator support using a Chromium-compatible bookmark convention: title `———` plus URL `about:blank`.
- Advanced Details debug section for bookmark metadata viewing, with a planned editing toggle for supported fields.
- Live refresh from Chrome bookmark events.
- In-page custom right-click menu for folders/bookmarks outside the Details pane.

## Chrome/Chromium implementation

- Opens from the extension toolbar action and preserves the built-in Chromium bookmark manager.
- Uses `chrome.bookmarks` to read, create, update, move, move-into folders, reorder, and remove bookmark nodes.
- Opens pages with `chrome.tabs.create()` without requesting the sensitive `tabs` permission.
- Uses Chromium's extension favicon endpoint for bookmark favicons, plus a bundled folder icon for bookmark folders.
- Refreshes visible bookmark favicon image URLs when switching folders so newly cached icons can appear without keeping an in-memory favicon cache.
- Uses an in-page custom context menu for bookmark/folder actions; the Details pane keeps the normal browser context menu.

## Source audit summary

| Extension part | Firefox source copied? | Firefox-inspired concept |
| --- | ---: | --- |
| `manifest.json` | No | None; Chrome MV3 extension metadata. |
| `service_worker.js` | No | None; opens local manager page from toolbar action. |
| `manager.html` | No | Library-like three-pane layout. |
| `manager.css` | No | General tree/list/details presentation. |
| `manager.js` | No | Bookmark tree model, folder selection, recursive search, details editing, and event-driven refresh. |
| `README.md` / `LICENSE` | No | Licensing and project documentation only. |

See `SOURCE_AUDIT.md` for more detail.

## Install locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this folder.
5. Click the **Simple Bookmarks Manager** extension action.

Note: v0.2.2+ no longer overrides `chrome://bookmarks`, so Chromium/Brave's built-in Bookmark Manager remains available from the browser menu.

## Limits

- Chrome bookmarks do not expose Firefox Places tags, keywords, history/downloads queries, Places transactions, or JSONLZ4 backups.
- Separator support is implemented by convention rather than a native Chromium bookmark type: a bookmark whose title is `———` and URL is `about:blank` is rendered as a separator inside the manager.
- Bookmarklets with `javascript:` URLs are not executed by this manager.
- Drag reordering is disabled while search or non-index sorting is active because visible order no longer matches persisted bookmark order.
- Chromium root/special folders cannot be moved, renamed, or removed.
- Chromium exposes bookmark metadata such as ID/date fields as read-only through the bookmarks API; the temporary advanced editing path can only save fields supported by the API, currently Sort order/index.
- Bookmark favicons depend on Chromium's cached favicon data and normal fallback handling.
- Favicons are refreshed when switching folders; icons already visible in the current folder may still need a folder switch to pick up newly cached site icons.
- Browser-specific Split View features are hidden because Chromium does not expose a stable cross-browser extension API for them.
- Tab Group menu entries are hidden when the browser does not expose `chrome.tabs.group()`.
- Opening private/incognito windows may fail if the browser or extension settings disallow it.

## References

- Mozilla Places docs: https://firefox-source-docs.mozilla.org/browser/places/index.html
- Firefox ESR 140 source tree used for design review only: https://github.com/mozilla-firefox/firefox/tree/FIREFOX_ESR_140_10_X_RELBRANCH
- MPL 2.0: https://www.mozilla.org/en-US/MPL/2.0/
- Chrome bookmarks API: https://developer.chrome.com/docs/extensions/reference/api/bookmarks
- Chrome action API: https://developer.chrome.com/docs/extensions/reference/api/action
- Chrome favicons in extensions: https://developer.chrome.com/docs/extensions/how-to/ui/favicons
- MDN MouseEvent.button: https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
- MDN auxclick: https://developer.mozilla.org/en-US/docs/Web/API/Element/auxclick_event
- Chromium BSD license reference: https://chromium.googlesource.com/chromium/src/+/HEAD/LICENSE

## Changelog

### 0.3.11

- Changed add-item placement for new bookmarks, folders, and separators.
- When a bookmark, folder, or separator row is selected, toolbar add actions now insert the new item immediately below the selected row when that row is a visible child of the current folder.
- Row right-click add actions now insert the new item immediately below the clicked bookmark/folder/separator row when sibling insertion is valid.
- Empty-space right-click add actions use the current selected row for insertion when possible, otherwise they append to the current folder as before.
- Root folder right-click add actions safely fall back to adding inside the root folder because sibling insertion beside Chromium root folders is not valid.
- Updated version to `0.3.11`.

### 0.3.10

- Renamed the visual sort dropdown option from **Unsorted** to **Default**.
- Added a bold **Visual sort:** label to the left of the sort dropdown in the middle-pane path bar.
- Added an Advanced Details section below the Details pane action buttons.
- Added read-only metadata fields for ID, GUID / UUID, Date Added, Date Last Used, and Sort order.
- Added temporary debug toggles for `EnableAdvancedDetailsViewing` and `EnableAdvancedDetailsEditing`.
- Added advanced dirty-state support that only checks editable advanced fields when `EnableAdvancedDetailsEditing` is enabled.
- Added save/discard support for the editable advanced Sort order field through Chromium's bookmark move/index behavior.
- Documented that Chromium exposes most bookmark metadata fields as read-only through the bookmarks API, so only supported fields are editable.
- Updated version to `0.3.10`.

### 0.3.9

- Reordered the bookmark right-click menu for consistency with the folder menu.
- Moved **Add New Bookmark**, **Add New Folder**, and **Add Separator** to immediately below **Paste**, separated by a single menu divider.
- Removed the divider between **Edit** and **Delete** in the bookmark right-click menu.
- Updated version to `0.3.9`.

### 0.3.8

- Fixed Details pane dirty-state handling after saving changes so navigating away no longer incorrectly triggers the **Unsaved changes** prompt.
- Suppressed intermediate bookmark-change refreshes while saving Details pane edits, then rebuilt the clean Details baseline from the refreshed Chromium bookmark tree.
- Ensured **Discard Changes** restores the saved baseline and refreshes the parent-folder dropdown without leaving stale dirty-state indicators.
- Ensured deleting the selected bookmark/folder clears the old Details baseline before selecting the current folder.
- Updated version to `0.3.8`.

### 0.3.7

- Moved the sort dropdown out of the top toolbar and into the middle-pane path bar.
- Positioned the sort dropdown immediately to the left of the **Click to Hide Details / Click to Show Details** button.
- Moved the displayed extension name **Simple Bookmarks Manager** to the right of the search field in the top toolbar.
- Updated version to `0.3.7`.

### 0.3.6

- Replaced the extension icon set with the newly supplied icon.
- Fixed Details pane form saving so pressing **Enter** in the **Name** or **URL** field saves changes without resetting the **Parent folder** dropdown.
- Fixed clicking **Save** in the Details pane so the **Parent folder** dropdown no longer resets unexpectedly.
- Fixed Details pane dirty-state handling after save so modified labels revert from dark blue bold styling back to the normal unmodified state.
- Improved Details pane parent-folder option rendering so the current dropdown selection is preserved correctly across safe re-renders.
- Updated version to `0.3.6`.

### 0.3.5

- Fixed middle-pane single-click selection causing the bookmark list to jump back to the top.
- Fixed drag/drop rearranging or moving bookmark items causing the middle pane to jump back to the top after refresh.
- Preserved middle-pane vertical and horizontal scroll position during same-folder re-renders.
- Reset the middle-pane scroll only when intentionally navigating to a different folder.
- Converted the main panes into independent scroll regions so the left Library pane, middle bookmark table, and right Details pane scroll separately.
- Kept the top toolbar/search bar visible while the Library, middle, or Details panes scroll.
- Updated version to `0.3.5`.

### 0.3.4

- Replaced the extension icon set with the newly supplied book-and-bookmark icon.
- Added separator support using a Chromium-compatible bookmark convention: any bookmark whose title is `———` and URL is `about:blank` is treated as a separator in the manager UI.
- Rendered separator bookmarks in the middle pane as a horizontal rule spanning the table width.
- Prevented separator bookmarks from opening on double-click while keeping them selectable, editable, draggable, and reorderable like normal bookmark entries.
- Added **Add Separator** to the folder, bookmark, and empty-space context menus.
- Renamed folder context-menu entries **Add Bookmark** / **Add Folder** to **Add New Bookmark** / **Add New Folder** for consistency.
- Excluded separator bookmarks from **Open All** context-menu actions so they do not open blank tabs or windows.
- Updated version to `0.3.4`.

### 0.3.3

- Fixed Details pane unsaved-change detection so edited fields are preserved across incidental re-renders.
- Selection changes now check for unsaved Details pane edits before selecting a different bookmark or folder.
- Folder navigation now stays blocked until the user chooses **Keep Editing**, **Save**, or **Discard**.
- Prevented overlapping unsaved-change prompts from causing delayed or random prompts after later navigation.
- Updated version to `0.3.3`.

### 0.3.2

- Added an unsaved-changes prompt when navigating to another folder with edited Details pane fields.
- The prompt offers **Keep Editing**, **Save**, or **Discard**.
- Added a **Discard Changes** button between **Save** and the delete button in the Details pane.
- Changed the Details pane delete button text dynamically to **Delete Bookmark** or **Delete Folder**.
- Hidden the URL label/input when a folder is selected, and restored it for bookmarks.
- Changed modified Details pane field labels to dark blue bold text until saved or discarded.
- Updated version to `0.3.2`.

### 0.3.1

- Added a conditional **Paste** entry to the empty-area right-click menu outside the Details pane.
- The empty-area **Paste** entry appears only when the manager has a valid cut/copied bookmark or folder that can be pasted into the current folder.
- Updated version to `0.3.1`.

### 0.3.0

- Added a custom in-page right-click menu for bookmark and folder rows outside the Details pane.
- Folder menu actions include rename, delete, cut/copy/paste, sort by name/date, add bookmark/folder, and open-all variants.
- Bookmark menu actions include edit, delete, cut/copy/paste, open variants, and add bookmark/folder.
- Empty-area right-click outside the Details pane offers add bookmark/folder actions.
- Cut items remain visible and are dimmed until pasted elsewhere.
- Copy/paste supports bookmark nodes and recursive folder copies inside the manager session.
- Split View menu entries are hidden because no stable Chromium extension API is available.
- Tab Group entries are shown only if the browser supports `chrome.tabs.group()`.
- Updated version to `0.3.0`.

### 0.2.12

- Removed the unnecessary `tabs` permission from `manifest.json`.
- Kept tab-opening behavior via `chrome.tabs.create()` for the toolbar action and bookmark opening.
- Added an efficient favicon refresh token that updates when switching folders.
- The refresh only affects visible bookmark row image URLs and does not store favicons in memory, avoiding long-lived favicon cache growth inside the extension page.

### 0.2.11

- Added icons to the left of folder labels in the Library tree.
- Added icons to the left of each folder/bookmark in the middle bookmark list.
- Uses the bundled `SBM FolderIcon.png`-derived folder icon for folders.
- Uses Chromium's extension favicon endpoint for bookmark favicons, allowing cached site icons and Chromium fallback behavior where available.
- Added the `favicon` permission needed for Chromium extension favicon access.

### 0.2.10

- Added double-click expand/collapse behavior in the left Library folder tree.
- Double-clicking a folder row or label with child subfolders now toggles that branch open or closed at that level.
- Single-click selection/navigation behavior remains unchanged.

### 0.2.9

- Renamed the Details pane button text from **Details On / Details Off** to action-oriented labels:
  - **Click to Hide Details** when the pane is visible.
  - **Click to Show Details** when the pane is hidden.
- Kept the existing Details pane show/hide behavior and tooltips unchanged.

### 0.2.8

- Restored middle-pane horizontal scrolling by wrapping headers and rows in one shared table content area.
- Column headers and bookmark/folder rows now scroll horizontally together when the available width is too narrow.
- Kept the header row sticky for vertical scrolling.

### 0.2.7

- Fixed narrow-window horizontal scrolling so the middle-pane column headers and bookmark rows scroll together.
- The header row now stays visible while vertically scrolling the bookmark list.

### 0.2.6

- Added a **Click to Hide Details / Click to Show Details** button at the right side of the folder path bar.
- The Details pane is visible by default.
- Turning the toggle off hides the right Details pane and lets the middle bookmark list use the extra width.
- Button tooltips update between **Hide the Details pane** and **Show the Details pane**.

### 0.2.5

- Added explicit sort tooltips for column headers and the sort selector:
  - Name: A to Z / Z to A.
  - URL: A to Z / Z to A.
  - Date Added: oldest first / newest first.
  - ID: lowest first / highest first.
- Added a narrow **Order** column that shows Chromium's actual per-folder bookmark order/index.
- Made the **Order** column header act like the toolbar **Unsorted** option: it returns the middle pane to Chromium's default folder order and does not reverse-sort.

### 0.2.4

- Removed the disabled `Replace default bookmark manager` UI and related documentation because runtime replacement is not available to extensions.
- Added sortable middle-pane column headers for **Name**, **URL**, **Date Added**, and **ID**.
- Added a narrow **ID** column showing each bookmark/folder node ID.
- Added the same **ID** sort option to the toolbar sort selector.
- Kept drag reordering disabled while sorted/search views are active.

### 0.2.3

- Added Mouse4/Mouse5 support while the manager page is active:
  - Mouse4 calls the same function as **Back**.
  - Mouse5 calls the same function as **Forward**.
- Updated README references and limitations.

### 0.2.2

- Renamed the extension to **Simple Bookmarks Manager**.
- Added extension icons generated from `icons/icon-16.png`, `icons/icon-32.png`, `icons/icon-48.png`, and `icons/icon-128.png`.
- Removed `chrome_url_overrides.bookmarks` so the default Chromium/Brave Bookmark Manager is no longer replaced.
- Kept moved items' drag/drop target behavior, but after moving an item into a folder the view now remains in the current folder when possible.
- Documented that Chrome extensions cannot insert a first-class item directly below Chromium/Brave's built-in Bookmark Manager menu entry.

### 0.2.1

- Added “drop into folder” behavior for folder rows in both the middle list and left tree.
- Enabled dragging bookmarks/folders from the middle pane onto left-pane folders.
- Enabled dragging folders from the left pane into folders shown in the middle pane.
- Preserved before/after row reordering when dropping near the top or bottom of a target row.
- Improved same-parent index calculation for before/after moves.

### 0.2.0

- Added drag-and-drop reordering in the main bookmark list when viewing natural order.
- Added drag-and-drop reordering for non-root folders in the left tree.
- Protected Chromium/Brave root folders from drag moves.
- Added visual drop indicators and guarded drag behavior while search/sort views are active.
- Bumped extension version to `0.2.0`.

### 0.1.2

- Added `LICENSE` using MPL 2.0.
- Added `SOURCE_AUDIT.md` documenting that no Firefox source code was copied.
- Updated README with licensing rationale and source audit summary.
- Bumped extension version to `0.1.2`.

### 0.1.1

- Added a nested, collapsible folder tree in the left pane.
- Current folder ancestors auto-expand so the selected folder remains visible.
