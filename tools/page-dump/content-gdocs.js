// Page Dump — Google Docs content script
// Extracts document content via Google Docs export URL (bypasses canvas rendering)

(function () {
  if (window.__pageDumpGDocsInjected) return;
  window.__pageDumpGDocsInjected = true;

  /**
   * Extract the document ID from the current URL.
   */
  function getDocId() {
    const match = window.location.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    return match ? match[1] : null;
  }

  /**
   * Get the document title from the page.
   */
  function getTitle() {
    // Try the title input element first
    const titleInput = document.querySelector(".docs-title-input");
    if (titleInput?.value) return titleInput.value;

    // Fallback to page title, stripping the Google Docs suffix
    return document.title
      .replace(/ - Google Docs$/, "")
      .replace(/ - Google 文档$/, "")
      .trim();
  }

  /**
   * Fetch the document via the export URL.
   * This is same-origin from docs.google.com, so cookies are sent automatically.
   */
  async function fetchExport(docId, format) {
    const url = `https://docs.google.com/document/d/${docId}/export?format=${format}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Export failed (${resp.status}): ${resp.statusText}`);
    }
    return resp.text();
  }

  /**
   * Convert Google Docs exported HTML to clean plain text.
   */
  function htmlToPlainText(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const body = doc.body;
    if (!body) return "";
    return extractText(body).trim();
  }

  function extractText(el) {
    const parts = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        if (tag === "br") {
          parts.push("\n");
        } else if (tag === "p" || tag === "div" || /^h[1-6]$/.test(tag)) {
          parts.push("\n" + extractText(node) + "\n");
        } else if (tag === "li") {
          parts.push("\n- " + extractText(node));
        } else if (tag === "table") {
          parts.push("\n" + extractText(node) + "\n");
        } else if (tag === "tr") {
          parts.push(extractText(node) + "\n");
        } else if (tag === "td" || tag === "th") {
          parts.push(extractText(node) + "\t");
        } else {
          parts.push(extractText(node));
        }
      }
    }
    return parts.join("");
  }

  /**
   * Convert Google Docs exported HTML to Markdown.
   */
  function htmlToMarkdown(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const body = doc.body;
    if (!body) return "";
    return convertToMd(body).replace(/\n{3,}/g, "\n\n").trim();
  }

  function convertToMd(el) {
    const parts = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        const inner = convertToMd(node);

        if (/^h[1-6]$/.test(tag)) {
          const level = parseInt(tag[1]);
          parts.push("\n" + "#".repeat(level) + " " + inner.trim() + "\n");
        } else if (tag === "p") {
          parts.push("\n" + inner + "\n");
        } else if (tag === "br") {
          parts.push("\n");
        } else if (tag === "strong" || tag === "b") {
          parts.push("**" + inner + "**");
        } else if (tag === "em" || tag === "i") {
          parts.push("*" + inner + "*");
        } else if (tag === "a") {
          const href = node.getAttribute("href") || "";
          // Google Docs wraps links in a redirect — try to unwrap
          const cleanHref = decodeGoogleRedirect(href);
          parts.push("[" + inner + "](" + cleanHref + ")");
        } else if (tag === "ul" || tag === "ol") {
          const items = node.querySelectorAll(":scope > li");
          items.forEach((li, idx) => {
            const prefix = tag === "ol" ? `${idx + 1}. ` : "- ";
            parts.push("\n" + prefix + convertToMd(li).trim());
          });
          parts.push("\n");
        } else if (tag === "table") {
          parts.push("\n" + tableToMd(node) + "\n");
        } else if (tag === "img") {
          const alt = node.getAttribute("alt") || "image";
          const src = node.getAttribute("src") || "";
          parts.push(`![${alt}](${src})`);
        } else if (tag === "code") {
          parts.push("`" + inner + "`");
        } else if (tag === "pre") {
          parts.push("\n```\n" + inner + "\n```\n");
        } else if (tag === "blockquote") {
          const lines = inner.trim().split("\n");
          parts.push("\n" + lines.map((l) => "> " + l).join("\n") + "\n");
        } else if (tag === "hr") {
          parts.push("\n---\n");
        } else if (tag === "sup") {
          parts.push("^(" + inner + ")");
        } else if (tag === "sub") {
          parts.push("~(" + inner + ")");
        } else if (tag === "s" || tag === "del" || tag === "strike") {
          parts.push("~~" + inner + "~~");
        } else {
          parts.push(inner);
        }
      }
    }
    return parts.join("");
  }

  function tableToMd(table) {
    const rows = [];
    table.querySelectorAll("tr").forEach((tr) => {
      const cells = [];
      tr.querySelectorAll("th, td").forEach((cell) => {
        cells.push(convertToMd(cell).trim().replace(/\|/g, "\\|").replace(/\n/g, " "));
      });
      rows.push("| " + cells.join(" | ") + " |");
    });
    if (rows.length > 0) {
      const headerCells = rows[0].split("|").filter((c) => c.trim() !== "");
      const sep = "| " + headerCells.map(() => "---").join(" | ") + " |";
      rows.splice(1, 0, sep);
    }
    return rows.join("\n");
  }

  function decodeGoogleRedirect(href) {
    // Google Docs sometimes wraps links as google.com/url?q=...
    try {
      const url = new URL(href);
      if (url.hostname.includes("google.com") && url.pathname === "/url") {
        return url.searchParams.get("q") || href;
      }
    } catch {}
    return href;
  }

  /**
   * Main extraction.
   */
  async function extract() {
    const docId = getDocId();
    if (!docId) return null;

    const title = getTitle();

    // Fetch HTML export (preserves structure)
    const rawHtml = await fetchExport(docId, "html");
    const markdown = htmlToMarkdown(rawHtml);
    const plainText = htmlToPlainText(rawHtml);

    return {
      type: "gdocs",
      title,
      docId,
      content: plainText,
      markdown,
      rawHtml,
      url: window.location.href,
    };
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "extract") {
      extract()
        .then((data) => {
          sendResponse({ success: !!data, data });
        })
        .catch((err) => {
          sendResponse({ success: false, error: err.message });
        });
      return true; // async response
    }
  });
})();
