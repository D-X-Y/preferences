# Screenshot to PDF — Chrome Extension

Capture screenshots (visible area, full page scroll, or manual selection), queue them, reorder, and export as a multi-page PDF.

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this `screenshot-pdf/` directory

## Usage

Click the extension icon to open the popup:

- **Visible** — captures the current visible viewport
- **Full Page** — scrolls the entire page and stitches captures together
- **Selection** — lets you drag a rectangle to capture a specific area

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **⌥⇧S** (Option+Shift+S) | Capture visible area |
| **⌥⇧A** (Option+Shift+A) | Re-capture last selected area |

The selection shortcut remembers the last rectangle you drew and re-captures that same area — useful for repeatedly capturing the same region (e.g., a chart or panel) as content changes.

Shortcuts can be customized at `chrome://extensions/shortcuts`.

Captured screenshots appear in the queue. You can:

- **Drag and drop** to reorder
- **Delete** individual items with the × button
- **Clear All** to empty the queue
- **Export as PDF** to download all queued screenshots as a multi-page PDF

Each PDF page is sized to match the screenshot dimensions (no white borders).

## Architecture

| File | Role |
|------|------|
| `manifest.json` | Manifest V3 configuration |
| `background.js` | Service worker — `captureVisibleTab()`, message routing, IndexedDB storage |
| `content.js` | Injected into pages — scroll-stitch and selection overlay |
| `popup.html/js/css` | Extension popup — queue display, reorder, PDF export |
| `db.js` | IndexedDB helper shared by background and popup |
| `lib/jspdf.umd.min.js` | Vendored jsPDF for PDF generation |

## Notes

- Full-page capture hides fixed/sticky elements after the first scroll to prevent duplication
- All coordinate math accounts for `devicePixelRatio` (Retina displays)
- Falls back to 1x resolution for very tall pages (canvas size limits)
- The popup closes for full-page and selection captures; queue updates on reopen
- Images stored as Blobs in IndexedDB (no base64 overhead, handles large captures)
