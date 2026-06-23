# Simple Bookmarks Manager

A simple local bookmarks manager for Chromium browsers, inspired by Firefox Places, Firefox’s bookmark management system.

This project is licensed under the `Mozilla Public License 2.0` (`MPL-2.0`).
See [LICENSE](LICENSE) for details.
Source code available at: https://github.com/SoraKagami/Simple_Bookmarks_Manager

Please report issues, bugs, and suggestions at: https://github.com/SoraKagami/Simple_Bookmarks_Manager/issues

The latest stable release of Simple Bookmarks Manager is available on the [Chrome Web Store](https://chromewebstore.google.com/detail/simple-bookmarks-manager/bljcbgidellmijkcbhjbajpnkeaaknle).

## Features

- Layout & features inspired by Firefox's bookmarks manager
- Creation, editing, sorting and management of bookmarks and folders
- Full default Chromium bookmarks compatibility
- Separator support using a Chromium-compatible bookmark convention: title `———` plus URL `about:blank`
- Left-pane Library folder tree with collapsible subfolders
- Drag-and-drop reordering for bookmarks and folders
- Bookmarks search with optional limitation to the current folder & subfolders
- Keyboard navigation support
- Visual temporary sorting for folders
- Permanent Sort-by-Name and Sort-by-Date options
- Live refresh from Chrome bookmark events
- Custom right-click context menus
- Options menu with persistent settings
- Persistent options are stored in `chrome.storage.local`.
- GenAI-assisted translations available for multiple languages
- Adjustable fonts (limited selection) and font sizes
- Multiple themes available

## Languages with UI support

- English
- 繁體中文
- 简体中文
- 日本語
- 한국어
- Español
- Français
- Deutsch
- Português (Brasil)
- Italiano
- Nederlands
- Polski
- Türkçe
- Tiếng Việt
- Bahasa Indonesia
- עברית
- Українська
- Русский
- Te Reo Māori
- N3tsp34k

**Please note:** languages other than English are translations made using GenAI.

## Pinning Simple Bookmarks Manager for easy access

Pinning Simple Bookmarks Manager (SBM) to the toolbar allows faster and easier access to the extension.

Once SBM is installed in your Chromium-based browser, you can pin it to the toolbar in one of the following ways:

### 1. Pin via the Extensions menu

1. Click the Extensions button, usually located to the right of the address bar.
2. Find `Simple Bookmarks Manager` in the list.
3. Click the pin icon next to `Simple Bookmarks Manager`.

This will pin SBM to the toolbar. If SBM is already pinned, clicking the pin icon will unpin it.

### 2. Pin via the Manage Extensions page

1. Click the Extensions button, usually located to the right of the address bar.
2. Click `Manage Extensions`.

Alternatively:

1. Click the Chromium menu button.
2. Select `Extensions`.
3. Click `Manage Extensions`.

Once the Extensions page is open:

1. Find `Simple Bookmarks Manager` in the list.
2. Click `Details`.
3. Scroll down to `Pin to toolbar`.
4. Toggle the option on.

## Privacy and Permissions

### Permissions

- **Bookmarks**: Required to read, modify and write bookmarks
- **Favicon**: Required to display the bookmark icons
- **Storage**: Required to store extension settings

### Privacy

- **No Telemetry**
- **No Ads**
- **No Subscriptions**
- **No Network Connections**

## Project history

For background on how this extension was developed, including the GenAI-assisted development process, see [PROJECT_HISTORY.md](Documentation/PROJECT_HISTORY.md).

## Source Code Audit by ChatGPT

As part of the development process, ChatGPT was asked to perform a source code audit to check whether any code appeared to originate from other repositories. This was done as an additional precaution rather than assuming that all code was original.

The result, last updated for the `v0.7.20` release made for an interesting read and has been preserved in [SOURCE_AUDIT.md](Documentation/SOURCE_AUDIT.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

## Notes

**Please note:** `Release builds` and `Chrome Web Store Releases` do not contain files that are unnecessary.

The `Documentation` and `GenAI_Prompt_Logs` folders can be accessed directly on GitHub.