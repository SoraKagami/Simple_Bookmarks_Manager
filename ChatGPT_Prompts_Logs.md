Can you please attempt to take the logic from the Firefox source code (ESR 140: https://github.com/mozilla-firefox/firefox/tree/FIREFOX\_ESR\_140\_10\_X\_RELBRANCH) for how it's bookmarks manager works, then turn it into a chromium extension that works with chrome's bookmarks?

Please only use Firefox's official git repository on Github, documentation on Firefox from mozilla.org, and chromium plugin related can be sourced from websites that are highly reputable only.

2/2

#### Chromium & Extensions Engineer said:

I’ll map Firefox’s bookmark-manager concepts to Chrome’s `chrome.bookmarks` API, then provide a minimal MV3 extension skeleton. I’ll keep Firefox-derived behavior at the “logic/UX pattern” level, not copy Mozilla source verbatim.

Thought for 55s

Done: download the unpacked extension ZIP.

- Implemented a **Manifest V3 Chrome bookmark-manager override** using `chrome_url_overrides.bookmarks`, so it opens for `chrome://bookmarks`.
- Uses only Chrome’s `bookmarks` + `tabs` APIs. Chrome requires `"bookmarks"` permission to create, organize, edit, remove, and search bookmarks. [Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/bookmarks)
- Firefox logic mapped from ESR 140 Places/Library patterns:

    - left-pane roots
    - right-pane folder contents
    - details pane
    - search scoped to bookmarks/folder
    - back/forward folder navigation
    - live model/view refresh via bookmark events

      Firefox Places is explicitly a backend database plus model-view-controller UI system. [Firefox Source Docs](https://firefox-source-docs.mozilla.org/browser/places/index.html)
- I did **not** copy Mozilla code verbatim; I reimplemented the behavior for Chrome’s API surface.
- Firefox-only features not portable to Chrome bookmarks API: Places history/downloads queries, tags, keywords, JSONLZ4 backup/restore, separators, and full Firefox Library metadata. MDN notes the WebExtensions bookmarks API can retrieve, edit, remove, and organize bookmarks, but Chrome’s tree model is more limited. [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/bookmarks)

Install:

1. Unzip the file.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the unzipped `firefox_style_bookmark_manager` folder.
6. Open `chrome://bookmarks`.

Cross-browser notes:

- **Chrome/Chromium/Brave:** should work as a Chromium MV3 extension; Brave may keep its own UI behavior around `chrome://bookmarks`, but the APIs are Chromium-compatible in normal cases.
- **Firefox:** this exact package is not Firefox-targeted because it uses `chrome_url_overrides.bookmarks`; Firefox WebExtensions support bookmarks APIs, but not Chrome’s bookmark-manager override behavior in the same way.

Double-check:

- Test with nested folders, empty folders, and managed bookmarks.
- Confirm `chrome://bookmarks` is overridden after load.
- Verify special root folders cannot be renamed/deleted; Chrome forbids modifying root/special folders. [Chrome for Developers](https://developer.chrome.com/docs/extensions/reference/api/bookmarks)
- Bookmarklets using `javascript:` URLs are intentionally not executed.

![](https://www.google.com/s2/favicons?domain=https://developer.mozilla.org&sz=32)

![](https://www.google.com/s2/favicons?domain=https://firefox-source-docs.mozilla.org&sz=32)

![](https://www.google.com/s2/favicons?domain=https://developer.chrome.com&sz=32)

Sources