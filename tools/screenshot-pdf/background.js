// Service worker — coordinates captures, stores to IndexedDB
// All DB functions inlined to avoid importScripts issues in MV3

const DB_NAME = "screenshotPdfDB";
const DB_VERSION = 1;
const STORE_NAME = "screenshots";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("order", "order", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addScreenshot(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllScreenshots() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const idx = store.index("order");
    const req = idx.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Generate a unique ID
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Create a thumbnail data URL from a full-size data URL
async function makeThumbnail(dataUrl, maxW = 200, maxH = 150) {
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(maxW / bmp.width, maxH / bmp.height, 1);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  const thumbBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.readAsDataURL(thumbBlob);
  });
}

// Convert data URL to Blob
async function dataUrlToBlob(dataUrl) {
  const resp = await fetch(dataUrl);
  return resp.blob();
}

// Get next order index
async function nextOrder() {
  const all = await getAllScreenshots();
  return all.length;
}

// Capture the visible tab area
async function captureVisible() {
  const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });
  return dataUrl;
}

// Store a capture
async function storeCapture(dataUrl, label) {
  const thumbnail = await makeThumbnail(dataUrl);
  const blob = await dataUrlToBlob(dataUrl);

  // Get image dimensions
  const bmp = await createImageBitmap(blob);
  const width = bmp.width;
  const height = bmp.height;
  bmp.close();

  const order = await nextOrder();
  await addScreenshot({
    id: uid(),
    blob,
    thumbnailDataUrl: thumbnail,
    width,
    height,
    order,
    timestamp: Date.now(),
    label,
  });
}

// Logging — stores entries in chrome.storage.local for popup to display
async function addLog(message, level = "info") {
  const entry = { time: Date.now(), message, level };
  console.log(`[screenshot-pdf] [${level}] ${message}`);
  try {
    const data = await chrome.storage.local.get({ logs: [] });
    const logs = data.logs;
    logs.push(entry);
    // Keep last 50 entries
    if (logs.length > 50) logs.splice(0, logs.length - 50);
    await chrome.storage.local.set({ logs });
  } catch (e) {
    // Don't let logging failures break anything
  }
}

// Set badge during capture
function setBadge(text) {
  chrome.action.setBadgeText({ text });
  chrome.action.setBadgeBackgroundColor({ color: "#4A90D9" });
}

function clearBadge() {
  chrome.action.setBadgeText({ text: "" });
}

// Inject content script if not already injected
async function ensureContentScript(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => window.__screenshotPdfInjected || false,
    });
    if (!result.result) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"],
      });
    }
  } catch (err) {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  }
}

// Message handler
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  console.log("[screenshot-pdf] received:", msg.action);

  if (msg.action === "captureVisible") {
    (async () => {
      try {
        setBadge("...");
        await addLog("Capturing visible area...");
        const dataUrl = await captureVisible();
        await storeCapture(dataUrl, "Visible");
        clearBadge();
        await addLog("Visible capture stored");
        sendResponse({ success: true });
      } catch (err) {
        console.error("[screenshot-pdf] captureVisible error:", err);
        await addLog("Visible capture failed: " + err.message, "error");
        clearBadge();
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === "captureFullPage") {
    (async () => {
      try {
        setBadge("...");
        await addLog("Starting full-page capture...");
        const tabId = msg.tabId;
        await ensureContentScript(tabId);
        chrome.tabs.sendMessage(tabId, { action: "startFullPageCapture" });
        sendResponse({ success: true });
      } catch (err) {
        console.error("[screenshot-pdf] captureFullPage error:", err);
        await addLog("Full-page capture failed to start: " + err.message, "error");
        clearBadge();
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === "captureSelection") {
    (async () => {
      try {
        const tabId = msg.tabId;
        await ensureContentScript(tabId);
        chrome.tabs.sendMessage(tabId, { action: "startSelection" });
        sendResponse({ success: true });
      } catch (err) {
        console.error("[screenshot-pdf] captureSelection error:", err);
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Capture visible tab and store directly — avoids sending large data URLs through messaging
  if (msg.action === "captureAndStore") {
    (async () => {
      try {
        const dataUrl = await captureVisible();
        await storeCapture(dataUrl, msg.label || "Capture");
        await addLog("Stored: " + (msg.label || "Capture"));
        sendResponse({ success: true });
      } catch (err) {
        console.error("[screenshot-pdf] captureAndStore error:", err);
        await addLog("Capture+store failed: " + err.message, "error");
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === "captureForStitch") {
    (async () => {
      try {
        const dataUrl = await captureVisible();
        sendResponse({ dataUrl });
      } catch (err) {
        console.error("[screenshot-pdf] captureForStitch error:", err);
        sendResponse({ error: err.message });
      }
    })();
    return true;
  }

  if (msg.action === "storeCapture") {
    (async () => {
      try {
        await storeCapture(msg.dataUrl, msg.label || "Capture");
        clearBadge();
        await addLog("Stored: " + (msg.label || "Capture"));
        sendResponse({ success: true });
      } catch (err) {
        console.error("[screenshot-pdf] storeCapture error:", err);
        await addLog("Store failed: " + err.message, "error");
        clearBadge();
        sendResponse({ success: false, error: err.message });
      }
    })();
    return true;
  }

  // Full-page progress update from content script
  if (msg.action === "fullPageProgress") {
    (async () => {
      const { current, total } = msg;
      setBadge(`${current}/${total}`);
      await addLog(`Full page: capturing segment ${current}/${total}`);
      sendResponse({ ok: true });
    })();
    return true;
  }

  // Full-page done — content script sends each segment individually
  if (msg.action === "fullPageDone") {
    (async () => {
      clearBadge();
      await addLog(`Full page complete: ${msg.count} segments stored`);
      setBadge("OK");
      setTimeout(() => clearBadge(), 1000);
      sendResponse({ ok: true });
    })();
    return true;
  }

  // Full-page error from content script
  if (msg.action === "fullPageError") {
    (async () => {
      clearBadge();
      await addLog("Full page error: " + msg.error, "error");
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (msg.action === "ping") {
    sendResponse({ pong: true });
    return false;
  }
});

// Keyboard shortcut handler
chrome.commands.onCommand.addListener(async (command) => {
  console.log("[screenshot-pdf] command:", command);
  if (command === "recapture-selection") {
    try {
      setBadge("...");
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      await ensureContentScript(tab.id);
      chrome.tabs.sendMessage(tab.id, { action: "recaptureLastSelection" });
    } catch (err) {
      console.error("[screenshot-pdf] recapture-selection error:", err);
      clearBadge();
    }
    return;
  }

  if (command === "capture-visible") {
    try {
      setBadge("...");
      const dataUrl = await captureVisible();
      await storeCapture(dataUrl, "Visible");
      clearBadge();
      // Flash badge to confirm
      setBadge("OK");
      setTimeout(() => clearBadge(), 1000);
    } catch (err) {
      console.error("[screenshot-pdf] shortcut capture error:", err);
      clearBadge();
    }
  }
});

console.log("[screenshot-pdf] service worker started");
