# Firefox-style Bookmark Manager for Chrome

A Manifest V3 Chrome extension that maps Firefox Places Library ideas to Chrome's `chrome.bookmarks` API.

This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0. See `LICENSE`.

## License decision

- **No Mozilla Firefox source files or copied Firefox code are included.**
- The implementation was written from scratch for Chrome/Chromium's extension APIs.
- Firefox ESR 140 was used only as design reference for bookmark-manager concepts: Places-style tree organization, active folder contents, details editing, recursive search, and live refresh.
- Because no Mozilla source code was copied or modified, this project does **not** need to include Mozilla's Firefox source-code notices as third-party notices.
- The project is intentionally licensed under **MPL 2.0**, matching Mozilla's open-source spirit while keeping copyleft file-scoped and compatible with permissive code in larger works.

## Firefox-inspired behavior

- Left-pane folder tree with collapsible subfolders.
- Drag-and-drop reordering for non-root folders in the left-pane tree.
- Right-pane active folder contents with drag-and-drop reordering in natural order.
- Search scoped to the active folder, recursively.
- Back/forward navigation between selected folders.
- Details pane for title, URL, parent folder, and deletion.
- Live refresh from Chrome bookmark events.

## Chrome/Chromium implementation

- Uses `chrome_url_overrides.bookmarks` to replace Chrome's bookmark manager page.
- Uses `chrome.bookmarks` to read, create, update, move, reorder, and remove bookmark nodes.
- Uses `chrome.tabs` only to open the manager from the extension action.

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
5. Open `chrome://bookmarks` or click the extension action.

## Limits

- Chrome bookmarks do not expose Firefox Places tags, keywords, history/downloads queries, separators, Places transactions, or JSONLZ4 backups.
- Bookmarklets with `javascript:` URLs are not executed by this manager; they are opened as URLs only.
- Drag-and-drop reordering is disabled while search is active or while sorted by Name, URL, or Date added; Chrome only persists explicit bookmark indices in natural order.
- Top-level Chromium/Brave root folders such as `Bookmarks` / `Bookmarks Bar` and `Other bookmarks` are intentionally not draggable.

## References

- Firefox ESR 140 source reference: https://github.com/mozilla-firefox/firefox/tree/FIREFOX_ESR_140_10_X_RELBRANCH
- Firefox Places docs: https://firefox-source-docs.mozilla.org/browser/places/index.html
- Firefox Bookmarks API internals docs: https://firefox-source-docs.mozilla.org/browser/places/Bookmarks.html
- Firefox Places architecture docs: https://firefox-source-docs.mozilla.org/browser/places/architecture-overview.html
- Mozilla MPL 2.0: https://www.mozilla.org/MPL/2.0/
- Chrome bookmarks API: https://developer.chrome.com/docs/extensions/reference/api/bookmarks
- Chrome override pages: https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages
- Chromium BSD license reference: https://chromium.googlesource.com/chromium/src/+/HEAD/LICENSE

## Changelog

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
