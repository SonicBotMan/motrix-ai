# Motrix AI — Browser Extension

A Chrome / Firefox browser extension that adds one-click "Download with Motrix AI"
integration to your browser.

## Features

- **Context menu** — Right-click any link, video, or audio element and choose
  *"Download with Motrix AI"*.
- **Auto-detect** — Magnet links, `ed2k://` links, and embedded `<video>`
  sources automatically get a ⬇ Motrix AI button next to them.
- **Popup** — Click the toolbar icon to paste a URL / magnet / ed2k link and send
  it to the desktop app.
- **Clipboard fallback** — If the Motrix AI desktop app isn't running, the
  extension copies the URL to your clipboard so you can paste it manually.

---

## Install in Chrome / Edge / Brave (Manifest V3)

1. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked**.
4. Select the `extensions/browser/` directory from this repository.
5. The Motrix AI icon should appear in your toolbar.

## Install in Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select the `manifest.json` file inside `extensions/browser/`.
4. The extension will be loaded for the current session.

> **Note:** For permanent Firefox installation, the extension needs to be signed
> via [AMO](https://addons.mozilla.org/developers/) or loaded through a
> [Web Extension build](https://extensionworkshop.com/) with a
> `browser_specific_settings` key in the manifest.

---

## Connecting to Motrix AI Desktop App

The extension communicates with the Motrix AI desktop app via a local HTTP API:

| Setting       | Value                      |
|---------------|----------------------------|
| **Host**      | `127.0.0.1`                |
| **Port**      | `18900`                    |
| **Endpoint**  | `POST /api/download`       |
| **Body**      | `{ "url": "...", "title": "..." }` |

### Steps

1. **Launch Motrix AI** on your computer (the GUI desktop app).
2. Ensure the local API server is enabled (Settings → Advanced → Local API).
3. The default port is **18900**. If you changed it, update the URLs in
   `background.js` and `popup.js`.
4. Right-click a download link or use the popup — the URL will be sent to the
   app instantly.

### If the desktop app isn't running

The extension automatically falls back to **copying the URL to your clipboard**
so you can paste it into Motrix AI when it launches.

---

## File Structure

```
extensions/browser/
├── manifest.json    Extension manifest (MV3)
├── background.js    Service worker — context menu, messaging, API calls
├── content.js       Content script — auto-detects magnet/ed2k/video links
├── popup.html       Toolbar popup UI
├── popup.js         Popup logic — send URL, clipboard fallback, auto-fill
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md        This file
```

---

## Development

```bash
# Make changes to any .js / .html / .json file, then:
# Chrome:  chrome://extensions → click "Reload" on the Motrix AI card
# Firefox: about:debugging → click "Reload"
```

No build step is required — all source files are plain JavaScript.

---

## License

Same license as the Motrix AI project.
