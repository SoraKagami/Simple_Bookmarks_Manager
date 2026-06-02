# Simple Bookmarks Manager

Version: 0.7.8

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
- Search can run globally or be limited to the current folder and its subfolders.
- Back/forward navigation between selected folders.
- Mouse4/Mouse5 history navigation while the manager page is active.
- Hideable details pane for title, URL, parent folder, deletion, discard, and unsaved-change warnings.
- Bookmark favicons and folder icons in the left Library tree and middle bookmark list.
- Separator support using a Chromium-compatible bookmark convention: title `———` plus URL `about:blank`.
- Advanced Details debug section for bookmark metadata viewing, with a planned editing toggle for supported fields.
- Live refresh from Chrome bookmark events.
- In-page custom right-click menu for folders/bookmarks outside the Details pane.
- Optional natural folder sorting for **Sort by Name** via the Options page.
- Optional permanent-sort warning via the Options page.
- Persistent options are stored in `chrome.storage.local`.
- User-interface language can be set to Automatic / Browser Default or a supported manual language from the Options page.
- User-interface font family, base font size, and line spacing can be adjusted from the Options page.

## Chrome/Chromium implementation

- Opens from the extension toolbar action and preserves the built-in Chromium bookmark manager.
- Uses `chrome.bookmarks` to read, create, update, move, move-into folders, reorder, and remove bookmark nodes.
- Opens pages with `chrome.tabs.create()` without requesting the sensitive `tabs` permission.
- Uses Chromium's extension favicon endpoint for bookmark favicons, plus a bundled folder icon for bookmark folders.
- Uses Chromium extension localization conventions with `_locales/*/messages.json`, `sbm_locales/*/messages.json` for debug-only nonstandard locales, and a small runtime language helper for future in-app language switching.
- Refreshes visible bookmark favicon image URLs when switching folders so newly cached icons can appear without keeping an in-memory favicon cache.
- Uses an in-page custom context menu for bookmark/folder actions; the Details pane keeps the normal browser context menu.
- Provides a top-right application menu with entries to open the default Chromium Bookmark Manager and an in-page Simple Bookmarks Manager Options dialog, plus future Help and About entry points.

## Source audit summary

| Extension part | Firefox source copied? | Firefox-inspired concept |
| --- | ---: | --- |
| `manifest.json` | No | None; Chrome MV3 extension metadata. |
| `service_worker.js` | No | None; opens local manager page from toolbar action. |
| `manager.html` | No | Library-like three-pane layout. |
| `manager.css` | No | General tree/list/details presentation. |
| `manager.js` | No | Bookmark tree model, folder selection, recursive search, details editing, and event-driven refresh. |
| `options.html` / `options.css` / `options.js` | No | Extension options page for persistent preferences. |
| `_locales/*/messages.json` / `sbm_locales/*/messages.json` / `i18n.js` | No | Chromium-standard localization storage, debug locale storage, and runtime UI-language helper. |
| `README.md` / `CHANGELOG.md` / `LICENSE` | No | Licensing and project documentation only. |

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
- Chromium does not expose a supported extension API for invoking the built-in Bookmark Manager import/export flows, so Simple Bookmarks Manager opens the default Bookmark Manager for those workflows instead.
- Bookmark favicons depend on Chromium's cached favicon data and normal fallback handling.
- Favicons are refreshed when switching folders; icons already visible in the current folder may still need a folder switch to pick up newly cached site icons.
- Browser-specific Split View features are hidden because Chromium does not expose a stable cross-browser extension API for them.
- Tab Group menu entries are hidden when the browser does not expose `chrome.tabs.group()`.
- Opening private/incognito windows may fail if the browser or extension settings disallow it.

## Changelog

See `CHANGELOG.md` for version history.

## References

- Mozilla Places docs: https://firefox-source-docs.mozilla.org/browser/places/index.html
- Firefox ESR 140 source tree used for design review only: https://github.com/mozilla-firefox/firefox/tree/FIREFOX_ESR_140_10_X_RELBRANCH
- MPL 2.0: https://www.mozilla.org/en-US/MPL/2.0/
- Chrome bookmarks API: https://developer.chrome.com/docs/extensions/reference/api/bookmarks
- Chrome action API: https://developer.chrome.com/docs/extensions/reference/api/action
- Chrome options pages: https://developer.chrome.com/docs/extensions/develop/ui/options-page
- Chrome storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome i18n API: https://developer.chrome.com/docs/extensions/reference/api/i18n
- Chrome favicons in extensions: https://developer.chrome.com/docs/extensions/how-to/ui/favicons
- MDN MouseEvent.button: https://developer.mozilla.org/en-US/docs/Web/API/MouseEvent/button
- MDN auxclick: https://developer.mozilla.org/en-US/docs/Web/API/Element/auxclick_event
- Chromium BSD license reference: https://chromium.googlesource.com/chromium/src/+/HEAD/LICENSE

