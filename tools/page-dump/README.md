# Page Dump

Chrome extension to extract and export content from ChatGPT share links and Google Docs.

## Supported Sites

| Site | What it extracts |
|------|------------------|
| **ChatGPT share links** (`chatgpt.com/share/...`) | Full conversation with roles, model info, timestamps |
| **Google Docs** (`docs.google.com/document/...`) | Document content via export API (bypasses canvas rendering) |

## Export Formats

| Format | ChatGPT | Google Docs |
|--------|---------|-------------|
| Markdown | Conversation with headers per turn | Headings, lists, tables, links preserved |
| JSON | Full structured data with metadata | Title, content, markdown |
| HTML | Styled self-contained file | Original Google Docs HTML export |
| Plain Text | — | Clean plain text |

## How it works

### ChatGPT
Tries three extraction methods in order:
1. **React Router state** — ChatGPT's internal data store (full metadata)
2. **`__NEXT_DATA__`** — Next.js SSR hydration data
3. **DOM scraping** — parses rendered HTML as fallback

### Google Docs
Uses the Google Docs **export URL** (`/export?format=html`), which:
- Completely bypasses the canvas-based rendering
- Returns structured HTML with headings, lists, tables, links
- Works automatically with the user's existing Google session cookies

## Install

1. Open `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right)
3. Click **Load unpacked** → select the `chatgpt-dump/` folder
4. Pin the extension for easy access

## Usage

1. Open a supported page (ChatGPT share link or Google Doc)
2. Click the extension icon
3. Preview the extracted content
4. Click an export button to download

## Files

```
chatgpt-dump/
├── manifest.json        # MV3 extension config
├── content.js           # ChatGPT data extraction
├── content-gdocs.js     # Google Docs data extraction
├── popup.html/js/css    # Extension popup UI
├── error-handler.js     # Global error handler for popup
├── icons/               # Extension icons
└── README.md
```
