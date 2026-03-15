// ChatGPT Dump — content script
// Extracts conversation data from ChatGPT share pages

(function () {
  if (window.__chatgptDumpInjected) return;
  window.__chatgptDumpInjected = true;

  /**
   * Try to get conversation data from React Router internal state.
   * This is the most reliable method — gives us structured JSON.
   */
  function extractFromReactRouter() {
    try {
      const router = window.__reactRouterDataRouter;
      if (!router) return null;

      const loaderData = router.state?.loaderData;
      if (!loaderData) return null;

      // Try known route keys
      for (const key of Object.keys(loaderData)) {
        if (key.includes("share")) {
          const data =
            loaderData[key]?.serverResponse?.data ||
            loaderData[key]?.data ||
            loaderData[key];
          if (data && (data.mapping || data.title)) {
            return data;
          }
        }
      }
    } catch (e) {
      console.warn("[chatgpt-dump] React Router extraction failed:", e);
    }
    return null;
  }

  /**
   * Try to get data from __NEXT_DATA__ script tag (SSR data).
   */
  function extractFromNextData() {
    try {
      const el = document.getElementById("__NEXT_DATA__");
      if (!el) return null;
      const data = JSON.parse(el.textContent);
      const pageProps = data?.props?.pageProps;
      if (pageProps && (pageProps.serverResponse || pageProps.title)) {
        return pageProps.serverResponse?.data || pageProps;
      }
    } catch (e) {
      console.warn("[chatgpt-dump] __NEXT_DATA__ extraction failed:", e);
    }
    return null;
  }

  /**
   * Fallback: scrape the rendered DOM.
   */
  function extractFromDOM() {
    const title =
      document.querySelector("h1")?.textContent?.trim() ||
      document.title.replace(/ \| ChatGPT$/, "").trim();

    const articles = document.querySelectorAll(
      'article[data-testid^="conversation-turn-"]'
    );
    if (articles.length === 0) return null;

    const messages = [];
    articles.forEach((article, i) => {
      // Prefer the explicit role attribute on message elements
      const roleEl = article.querySelector("[data-message-author-role]");
      let role = roleEl?.getAttribute("data-message-author-role");

      // Fallback: odd turns = user, even turns = assistant (turn-0 is system/empty)
      if (!role) {
        const turnNum = parseInt(
          article.getAttribute("data-testid").replace("conversation-turn-", ""),
          10
        );
        role = turnNum % 2 === 1 ? "user" : "assistant";
      }

      // Skip system messages
      if (role === "system") return;

      // Extract text content, preserving code blocks
      const contentEl =
        article.querySelector(".markdown") ||
        roleEl ||
        article;

      const content = extractContentFromElement(contentEl);
      if (content.trim()) {
        messages.push({ role, content });
      }
    });

    return { title, messages, _source: "dom" };
  }

  /**
   * Extract readable content from a DOM element, preserving structure.
   */
  function extractContentFromElement(el) {
    const parts = [];

    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent);
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();

        if (tag === "pre") {
          // Code block
          const code = node.querySelector("code");
          const lang =
            code
              ?.className?.match(/language-(\w+)/)?.[1]
              ?.replace("undefined", "") || "";
          parts.push("\n```" + lang + "\n" + (code || node).textContent + "\n```\n");
        } else if (tag === "code") {
          parts.push("`" + node.textContent + "`");
        } else if (tag === "ol" || tag === "ul") {
          const items = node.querySelectorAll(":scope > li");
          items.forEach((li, idx) => {
            const prefix = tag === "ol" ? `${idx + 1}. ` : "- ";
            parts.push(prefix + extractContentFromElement(li).trim() + "\n");
          });
        } else if (tag === "table") {
          parts.push("\n" + extractTable(node) + "\n");
        } else if (tag === "img") {
          const alt = node.getAttribute("alt") || "image";
          const src = node.getAttribute("src") || "";
          parts.push(`![${alt}](${src})`);
        } else if (tag === "a") {
          const href = node.getAttribute("href") || "";
          parts.push(`[${node.textContent}](${href})`);
        } else if (
          tag === "strong" ||
          tag === "b"
        ) {
          parts.push("**" + node.textContent + "**");
        } else if (tag === "em" || tag === "i") {
          parts.push("*" + node.textContent + "*");
        } else if (/^h[1-6]$/.test(tag)) {
          const level = parseInt(tag[1]);
          parts.push(
            "\n" + "#".repeat(level) + " " + node.textContent.trim() + "\n"
          );
        } else if (tag === "p") {
          parts.push("\n" + extractContentFromElement(node) + "\n");
        } else if (tag === "br") {
          parts.push("\n");
        } else if (tag === "blockquote") {
          const lines = extractContentFromElement(node)
            .trim()
            .split("\n");
          parts.push("\n" + lines.map((l) => "> " + l).join("\n") + "\n");
        } else {
          parts.push(extractContentFromElement(node));
        }
      }
    }
    return parts.join("");
  }

  /**
   * Extract a table element to markdown.
   */
  function extractTable(table) {
    const rows = [];
    table.querySelectorAll("tr").forEach((tr) => {
      const cells = [];
      tr.querySelectorAll("th, td").forEach((cell) => {
        cells.push(cell.textContent.trim().replace(/\|/g, "\\|"));
      });
      rows.push("| " + cells.join(" | ") + " |");
    });
    if (rows.length > 0) {
      // Add separator after header
      const headerCells = rows[0].split("|").filter((c) => c.trim());
      const sep =
        "| " + headerCells.map(() => "---").join(" | ") + " |";
      rows.splice(1, 0, sep);
    }
    return rows.join("\n");
  }

  /**
   * Normalize structured API data into a flat message list.
   */
  function normalizeAPIData(data) {
    const title = data.title || "Untitled";
    const mapping = data.mapping || {};

    // Build the linear conversation by following the tree
    const messages = [];
    let nodeId = data.current_node;

    // Walk backwards to get all nodes, then reverse
    const chain = [];
    while (nodeId && mapping[nodeId]) {
      chain.push(mapping[nodeId]);
      nodeId = mapping[nodeId].parent;
    }
    chain.reverse();

    for (const node of chain) {
      const msg = node.message;
      if (!msg) continue;
      if (msg.author?.role === "system") continue;

      const role = msg.author?.role || "unknown";
      const contentParts = msg.content?.parts || [];
      const content = contentParts
        .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
        .join("\n");

      if (!content.trim()) continue;

      messages.push({
        role,
        content,
        model: msg.metadata?.model_slug || null,
        timestamp: msg.create_time || null,
        id: msg.id || null,
      });
    }

    return {
      title,
      messages,
      create_time: data.create_time || null,
      update_time: data.update_time || null,
      model: data.default_model_slug || null,
      _source: "api",
    };
  }

  /**
   * Main extraction — try sources in order of reliability.
   */
  function extract() {
    // 1. React Router state (best)
    let raw = extractFromReactRouter();
    if (raw && raw.mapping) {
      return normalizeAPIData(raw);
    }

    // 2. __NEXT_DATA__ (SSR)
    raw = extractFromNextData();
    if (raw && raw.mapping) {
      return normalizeAPIData(raw);
    }

    // 3. DOM scraping (fallback)
    const domData = extractFromDOM();
    if (domData && domData.messages.length > 0) {
      return domData;
    }

    return null;
  }

  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.action === "extract") {
      const data = extract();
      sendResponse({ success: !!data, data });
    }
    return true; // async
  });
})();
