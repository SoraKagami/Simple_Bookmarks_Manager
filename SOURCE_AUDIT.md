# Source Audit

Version: 0.7.18

## Summary

This extension does not include copied Mozilla Firefox source code, copied Chromium source code, or vendored third-party code.

The Firefox ESR 140 repository was used as a design reference for how Firefox's bookmark manager is organized around Places concepts. The extension implementation is original JavaScript/CSS/HTML written for Chrome's Manifest V3 extension APIs, including the manager page, options page, and localization helper.

## Firefox-derived material

No source code was copied from Firefox.

The following Firefox concepts influenced the extension's behavior:

- Bookmark folders are presented as a tree.
- Selecting a folder updates the main content list.
- Search can inspect a folder recursively.
- A details pane edits title, URL, and parent folder.
- UI refreshes when bookmark data changes.
- The layout broadly follows a Library-style navigation/content/details split.
- Persistent preferences are exposed through a standard Chromium options page.
- Packaged UI strings are organized through Chromium-style extension localization files for future language support.

## Not implemented from Firefox

The following Firefox Places features were not ported because Chrome's bookmark extension API does not expose equivalent data or because they are out of scope for this initial version:

- Places SQLite database access.
- History/downloads Places queries.
- Tags and keywords.
- Separators.
- PlacesTransactions undo/redo.
- JSONLZ4 bookmark backup/restore.
- Firefox-specific XUL/browser frontend code.
- Firefox `PlacesUIUtils`, `PlacesTreeView`, `PlacesViewBase`, or similar modules.

## License conclusion

Because no Mozilla source files were copied, modified, or redistributed, there are no Firefox/MPL third-party source-file notices that must be preserved for this extension.

The project itself is licensed under MPL 2.0 by choice. This keeps the source open in a Mozilla-like, file-level copyleft style while remaining practical for extension distribution.

## References

- Firefox ESR 140 source reference: https://github.com/mozilla-firefox/firefox/tree/FIREFOX_ESR_140_10_X_RELBRANCH
- Firefox Places docs: https://firefox-source-docs.mozilla.org/browser/places/index.html
- Firefox Bookmarks internals docs: https://firefox-source-docs.mozilla.org/browser/places/Bookmarks.html
- Firefox Places architecture docs: https://firefox-source-docs.mozilla.org/browser/places/architecture-overview.html
- Mozilla MPL 2.0: https://www.mozilla.org/MPL/2.0/
- Chrome bookmarks API: https://developer.chrome.com/docs/extensions/reference/api/bookmarks
- Chrome options pages: https://developer.chrome.com/docs/extensions/develop/ui/options-page
- Chrome storage API: https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome i18n API: https://developer.chrome.com/docs/extensions/reference/api/i18n
- Chrome override pages: https://developer.chrome.com/docs/extensions/develop/ui/override-chrome-pages
- Chromium BSD license reference: https://chromium.googlesource.com/chromium/src/+/HEAD/LICENSE
