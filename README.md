# Simple Bookmarks Manager

Version: 0.2.11

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
- Search scoped to the active folder, recursively.
- Back/forward navigation between selected folders.
- Mouse4/Mouse5 history navigation while the manager page is active.
- Hideable details pane for title, URL, parent folder, and deletion.
- Bookmark favicons and folder icons in the left Library tree and middle bookmark list.
- Live refresh from Chrome bookmark events.

## Chrome/Chromium implementation

- Opens from the extension toolbar action and preserves the built-in Chromium bookmark manager.
- Uses `chrome.bookmarks` to read, create, update, move, move-into folders, reorder, and remove bookmark nodes.
- Uses `chrome.tabs` only to open the manager from the extension action.
- Uses Chromium's extension favicon endpoint for bookmark favicons, plus a bundled folder icon for bookmark folders.

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

- Chrome bookmarks do not expose Firefox Places tags, keywords, history/downloads queries, separators, Places transactions, or JSONLZ4 backups.
- Bookmarklets with `javascript:` URLs are not executed by this manager.
- Drag reordering is disabled while search or non-index sorting is active because visible order no longer matches persisted bookmark order.
- Chromium root/special folders cannot be moved, renamed, or removed.
- Bookmark favicons depend on Chromium's cached favicon data and normal fallback handling.

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
