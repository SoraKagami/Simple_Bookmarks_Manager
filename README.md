# Firefox-style Bookmark Manager for Chrome

A Manifest V3 Chrome extension that maps Firefox Places Library ideas to Chrome's bookmarks API.

## Firefox-inspired behavior

- Left-pane root selection.
- Right-pane folder contents.
- Search scoped to the active folder, recursively.
- Back/forward navigation between selected folders.
- Details pane for title, URL, parent folder, and deletion.
- Live refresh from bookmark events.

## Install locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Click **Load unpacked**.
4. Select this folder.
5. Open `chrome://bookmarks` or click the extension action.

## Limits

- Chrome bookmarks do not expose Firefox Places tags, keywords, history/downloads queries, or JSONLZ4 backups.
- Bookmarklets with `javascript:` URLs are not executed by this manager; they are opened as URLs only.
