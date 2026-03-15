// Page Dump — popup script (handles ChatGPT + Google Docs)

let extractedData = null;
let siteType = null; // "chatgpt" | "gdocs"

function log(msg) {
  console.log("[page-dump popup]", msg);
}

function showCrash(msg) {
  const crash = document.getElementById("crash");
  if (crash) {
    crash.classList.remove("hidden");
    crash.textContent = (crash.textContent ? crash.textContent + "\n" : "") + msg;
  }
}

/**
 * Detect site type from URL.
 */
function detectSite(url) {
  if (!url) return null;
  if (url.includes("chatgpt.com/share/")) return "chatgpt";
  if (url.includes("docs.google.com/document/")) return "gdocs";
  return null;
}

document.addEventListener("DOMContentLoaded", async () => {
  log("Popup loaded");

  const statusEl = document.getElementById("status");
  const errorEl = document.getElementById("error");
  const errorMsg = document.getElementById("error-msg");

  // Wire up ChatGPT export buttons
  document.getElementById("btn-markdown").addEventListener("click", () => exportChatGPT("markdown"));
  document.getElementById("btn-json").addEventListener("click", () => exportChatGPT("json"));
  document.getElementById("btn-html").addEventListener("click", () => exportChatGPT("html"));

  // Wire up Google Docs export buttons
  document.getElementById("btn-gdocs-markdown").addEventListener("click", () => exportGDocs("markdown"));
  document.getElementById("btn-gdocs-text").addEventListener("click", () => exportGDocs("text"));
  document.getElementById("btn-gdocs-html").addEventListener("click", () => exportGDocs("html"));
  document.getElementById("btn-gdocs-json").addEventListener("click", () => exportGDocs("json"));

  // Get active tab
  let tab;
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
    log("Tab: " + (tab?.url || "(no url)"));
  } catch (e) {
    log("tabs.query error: " + e.message);
    statusEl.textContent = "Cannot access current tab.";
    return;
  }

  if (!tab) {
    statusEl.textContent = "No active tab found.";
    return;
  }

  const url = tab.url || "";
  siteType = detectSite(url);

  if (!siteType) {
    statusEl.textContent = "Unsupported page.";
    errorMsg.textContent = "Supported: ChatGPT share links, Google Docs. Current: " + url.slice(0, 100);
    errorEl.classList.remove("hidden");
    return;
  }

  statusEl.textContent = "Extracting…";
  log("Site type: " + siteType);

  try {
    // Inject the appropriate content script
    const scriptFile = siteType === "chatgpt" ? "content.js" : "content-gdocs.js";
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: [scriptFile],
      });
      log("Injected " + scriptFile);
    } catch (injectErr) {
      log("Injection note: " + injectErr.message);
    }

    await new Promise((r) => setTimeout(r, 500));

    // Request extraction
    log("Sending extract message…");
    const response = await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(tab.id, { action: "extract" }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp);
        }
      });
    });

    log("Response: " + JSON.stringify(response)?.slice(0, 200));

    if (!response?.success || !response.data) {
      const detail = response?.error || "Make sure the page has fully loaded.";
      throw new Error("Extraction failed: " + detail);
    }

    extractedData = response.data;

    if (siteType === "chatgpt") {
      renderChatGPTPreview(extractedData);
      document.getElementById("preview-chatgpt").classList.remove("hidden");
    } else {
      renderGDocsPreview(extractedData);
      document.getElementById("preview-gdocs").classList.remove("hidden");
    }

    statusEl.textContent = "Ready to export";
    document.getElementById("crash").classList.add("hidden");
  } catch (err) {
    log("Error: " + err.message);
    statusEl.textContent = "Extraction failed";
    errorMsg.textContent = err.message;
    errorEl.classList.remove("hidden");
  }
});

// ── ChatGPT rendering ──

function renderChatGPTPreview(data) {
  document.getElementById("conv-title").textContent = data.title || "Untitled Conversation";

  if (data.model) {
    document.getElementById("conv-model").textContent = "Model: " + data.model;
  }

  const userCount = data.messages.filter((m) => m.role === "user").length;
  const assistantCount = data.messages.filter((m) => m.role === "assistant").length;
  let stats = data.messages.length + " messages (" + userCount + " user, " + assistantCount + " assistant)";
  if (data.create_time) {
    stats += " · " + new Date(data.create_time * 1000).toLocaleDateString();
  }
  document.getElementById("conv-stats").textContent = stats;

  const container = document.getElementById("messages-preview");
  container.innerHTML = "";
  for (const msg of data.messages) {
    const div = document.createElement("div");
    div.className = "msg-preview " + msg.role;

    const roleDiv = document.createElement("div");
    roleDiv.className = "msg-role " + msg.role;
    roleDiv.textContent = msg.role === "user" ? "You" : "ChatGPT";

    const contentDiv = document.createElement("div");
    contentDiv.className = "msg-content";
    contentDiv.textContent = msg.content;
    if (msg.content.length > 300) contentDiv.classList.add("truncated");

    div.appendChild(roleDiv);
    div.appendChild(contentDiv);
    container.appendChild(div);
  }
}

function exportChatGPT(format) {
  if (!extractedData) return;
  const data = extractedData;
  let content, filename, mimeType;

  switch (format) {
    case "markdown":
      content = chatgptToMarkdown(data);
      filename = slugify(data.title) + ".md";
      mimeType = "text/markdown";
      break;
    case "json":
      content = JSON.stringify(data, null, 2);
      filename = slugify(data.title) + ".json";
      mimeType = "application/json";
      break;
    case "html":
      content = chatgptToHTML(data);
      filename = slugify(data.title) + ".html";
      mimeType = "text/html";
      break;
  }
  downloadFile(content, filename, mimeType);
  showFeedback();
}

function chatgptToMarkdown(data) {
  const lines = [];
  lines.push("# " + (data.title || "Untitled") + "\n");
  if (data.model) lines.push("**Model:** " + data.model);
  if (data.create_time) {
    lines.push("**Date:** " + new Date(data.create_time * 1000).toISOString().slice(0, 10));
  }
  lines.push("**Source:** ChatGPT Share Link\n");
  lines.push("---\n");

  for (const msg of data.messages) {
    const label = msg.role === "user" ? "**You**" : "**ChatGPT**";
    let meta = "";
    if (msg.model) meta += " *(" + msg.model + ")*";
    if (msg.timestamp) meta += " *" + new Date(msg.timestamp * 1000).toLocaleString() + "*";
    lines.push("### " + label + meta + "\n");
    lines.push(msg.content.trim());
    lines.push("\n---\n");
  }
  return lines.join("\n");
}

function chatgptToHTML(data) {
  const title = escapeHTML(data.title || "Untitled");
  const messages = data.messages
    .map((msg) => {
      const role = msg.role === "user" ? "You" : "ChatGPT";
      const content = formatHTMLContent(msg.content);
      return '<div class="message ' + msg.role + '"><div class="role">' + role + '</div><div class="content">' + content + "</div></div>";
    })
    .join("\n");

  let metaHTML = "";
  if (data.model) metaHTML += '<p class="meta">Model: ' + escapeHTML(data.model) + "</p>";
  if (data.create_time) metaHTML += '<p class="meta">Date: ' + new Date(data.create_time * 1000).toISOString().slice(0, 10) + "</p>";

  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + "</title>" + HTML_STYLES + "</head><body><h1>" + title + "</h1>" + metaHTML + "<hr>" + messages + "</body></html>";
}

// ── Google Docs rendering ──

function renderGDocsPreview(data) {
  document.getElementById("gdocs-title").textContent = data.title || "Untitled Document";

  const words = (data.content || "").split(/\s+/).filter(Boolean).length;
  const chars = (data.content || "").length;
  document.getElementById("gdocs-stats").textContent = words + " words · " + chars.toLocaleString() + " characters";

  const preview = document.getElementById("gdocs-content-preview");
  preview.className = "gdocs-preview";
  const text = (data.content || "").slice(0, 1000);
  preview.textContent = text;
  if ((data.content || "").length > 1000) {
    preview.classList.add("truncated");
  }
}

function exportGDocs(format) {
  if (!extractedData) return;
  const data = extractedData;
  let content, filename, mimeType;

  switch (format) {
    case "markdown":
      content = data.markdown || data.content;
      filename = slugify(data.title) + ".md";
      mimeType = "text/markdown";
      break;
    case "text":
      content = data.content;
      filename = slugify(data.title) + ".txt";
      mimeType = "text/plain";
      break;
    case "html":
      content = data.rawHtml;
      filename = slugify(data.title) + ".html";
      mimeType = "text/html";
      break;
    case "json":
      content = JSON.stringify({ title: data.title, docId: data.docId, url: data.url, content: data.content, markdown: data.markdown }, null, 2);
      filename = slugify(data.title) + ".json";
      mimeType = "application/json";
      break;
  }
  downloadFile(content, filename, mimeType);
  showFeedback();
}

// ── Shared utilities ──

function formatHTMLContent(text) {
  let html = escapeHTML(text);
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => "<pre><code>" + code + "</code></pre>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  return html;
}

function escapeHTML(str) {
  const el = document.createElement("span");
  el.textContent = str;
  return el.innerHTML;
}

function slugify(str) {
  return (str || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function showFeedback() {
  const el = document.getElementById("copy-feedback");
  el.textContent = "Downloaded!";
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 2000);
}

const HTML_STYLES = `<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:800px;margin:0 auto;padding:24px;background:#f9f9f9;color:#1a1a1a;line-height:1.6}
h1{font-size:24px;margin-bottom:8px} .meta{color:#666;font-size:14px;margin-bottom:4px}
hr{border:none;border-top:1px solid #ddd;margin:16px 0}
.message{margin:16px 0;padding:16px;border-radius:8px}
.message.user{background:#e8f4fd} .message.assistant{background:#f0faf6}
.role{font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px}
.message.user .role{color:#2b7bb9} .message.assistant .role{color:#10a37f}
.content{white-space:pre-wrap;word-break:break-word}
.content pre{background:#1e1e1e;color:#d4d4d4;padding:12px;border-radius:6px;overflow-x:auto;margin:8px 0;font-size:13px}
.content code{background:#e8e8e8;padding:2px 5px;border-radius:3px;font-size:13px}
.content pre code{background:none;padding:0}
@media(prefers-color-scheme:dark){body{background:#1a1a1a;color:#e0e0e0}.meta{color:#999}hr{border-color:#333}.message.user{background:#1a2a35}.message.assistant{background:#1a2d24}.content code{background:#2d2d2d}}
</style>`;
