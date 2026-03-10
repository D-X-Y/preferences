// Popup script — queue display, drag-and-drop reorder, PDF export

let db = null;
try {
  db = self.screenshotDB;
  if (!db) throw new Error("screenshotDB not found on self");
} catch (e) {
  console.error("Failed to load screenshotDB:", e);
}

const queueList = document.getElementById("queue-list");
const emptyState = document.getElementById("empty-state");
const queueCount = document.getElementById("queue-count");
const btnExport = document.getElementById("btn-export");
const btnClear = document.getElementById("btn-clear");
const btnVisible = document.getElementById("btn-visible");
const btnFullpage = document.getElementById("btn-fullpage");
const btnSelection = document.getElementById("btn-selection");
const confirmOverlay = document.getElementById("confirm-overlay");
const confirmYes = document.getElementById("confirm-yes");
const confirmNo = document.getElementById("confirm-no");

let screenshots = [];

// Format timestamp to HH:MM
function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// Get current active tab
async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Show status in empty state area
function showStatus(text, isError = false) {
  emptyState.textContent = text;
  emptyState.style.display = "block";
  emptyState.style.color = isError ? "#D94A4A" : "";
}

// Render the queue
function renderQueue() {
  const items = queueList.querySelectorAll(".queue-item");
  items.forEach((el) => el.remove());

  queueCount.textContent = `Queue (${screenshots.length})`;
  btnExport.disabled = screenshots.length === 0;
  emptyState.style.display = screenshots.length === 0 ? "block" : "none";
  if (screenshots.length === 0) {
    emptyState.textContent = "No screenshots yet. Capture one above.";
    emptyState.style.color = "";
  }

  screenshots.forEach((shot, idx) => {
    const item = document.createElement("div");
    item.className = "queue-item";
    item.draggable = true;
    item.dataset.id = shot.id;
    item.dataset.index = idx;

    item.innerHTML = `
      <span class="drag-handle" title="Drag to reorder">&#9776;</span>
      <img class="thumb" src="${shot.thumbnailDataUrl}" alt="thumbnail">
      <div class="info">
        <div class="label">${shot.label || "Capture"}</div>
        <div class="time">${formatTime(shot.timestamp)}</div>
      </div>
      <button class="btn-delete" title="Remove" data-id="${shot.id}">&times;</button>
    `;

    queueList.appendChild(item);
  });

  queueList.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      await db.deleteScreenshot(id);
      await loadQueue();
    });
  });

  setupDragAndDrop();
}

// Load queue from IndexedDB
async function loadQueue() {
  if (!db) return;
  screenshots = await db.getAllScreenshots();
  screenshots.sort((a, b) => a.order - b.order);
  renderQueue();
}

// Drag and drop reorder
function setupDragAndDrop() {
  const items = queueList.querySelectorAll(".queue-item");
  let draggedItem = null;

  items.forEach((item) => {
    item.addEventListener("dragstart", (e) => {
      draggedItem = item;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", item.dataset.index);
    });

    item.addEventListener("dragend", () => {
      item.classList.remove("dragging");
      draggedItem = null;
      items.forEach((i) => i.style.borderTop = "");
    });

    item.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (draggedItem && item !== draggedItem) {
        item.style.borderTop = "2px solid var(--accent)";
      }
    });

    item.addEventListener("dragleave", () => {
      item.style.borderTop = "";
    });

    item.addEventListener("drop", async (e) => {
      e.preventDefault();
      item.style.borderTop = "";
      if (!draggedItem || item === draggedItem) return;

      const fromIdx = parseInt(draggedItem.dataset.index);
      const toIdx = parseInt(item.dataset.index);

      const [moved] = screenshots.splice(fromIdx, 1);
      screenshots.splice(toIdx, 0, moved);

      const orderedIds = screenshots.map((s) => s.id);
      await db.updateOrder(orderedIds);
      renderQueue();
    });
  });
}

// Capture handlers
btnVisible.addEventListener("click", async () => {
  console.log("[popup] Visible clicked");
  try {
    const tab = await getActiveTab();
    console.log("[popup] Active tab:", tab?.id, tab?.url);

    if (!tab) {
      showStatus("Error: no active tab found", true);
      return;
    }

    showStatus("Capturing...");
    chrome.runtime.sendMessage({ action: "captureVisible", tabId: tab.id }, (resp) => {
      console.log("[popup] captureVisible response:", resp, "lastError:", chrome.runtime.lastError);
      if (chrome.runtime.lastError) {
        showStatus("Error: " + chrome.runtime.lastError.message, true);
        return;
      }
      if (resp && resp.success) {
        loadQueue();
      } else {
        showStatus("Failed: " + (resp?.error || "no response"), true);
      }
    });
  } catch (err) {
    console.error("[popup] Visible click error:", err);
    showStatus("Error: " + err.message, true);
  }
});

btnFullpage.addEventListener("click", async () => {
  console.log("[popup] Full Page clicked");
  const tab = await getActiveTab();
  if (!tab) return;
  chrome.runtime.sendMessage({ action: "captureFullPage", tabId: tab.id });
  window.close();
});

btnSelection.addEventListener("click", async () => {
  console.log("[popup] Selection clicked");
  const tab = await getActiveTab();
  if (!tab) return;
  chrome.runtime.sendMessage({ action: "captureSelection", tabId: tab.id });
  window.close();
});

// Clear all with confirmation
btnClear.addEventListener("click", () => {
  if (screenshots.length === 0) return;
  confirmOverlay.classList.remove("hidden");
});

confirmNo.addEventListener("click", () => {
  confirmOverlay.classList.add("hidden");
});

confirmYes.addEventListener("click", async () => {
  confirmOverlay.classList.add("hidden");
  await db.clearAllScreenshots();
  await loadQueue();
});

// PDF Export
btnExport.addEventListener("click", async () => {
  if (screenshots.length === 0) return;
  btnExport.disabled = true;
  btnExport.textContent = "Exporting...";

  try {
    const allData = await db.getAllScreenshots();
    allData.sort((a, b) => a.order - b.order);

    const pxToMm = 0.264583;
    if (!window.jspdf) throw new Error("jsPDF library not loaded");
    const { jsPDF } = window.jspdf;
    let doc = null;

    for (let i = 0; i < allData.length; i++) {
      const shot = allData[i];
      const wMm = shot.width * pxToMm;
      const hMm = shot.height * pxToMm;
      const orientation = wMm > hMm ? "landscape" : "portrait";

      if (i === 0) {
        doc = new jsPDF({ orientation, unit: "mm", format: [wMm, hMm] });
      } else {
        doc.addPage([wMm, hMm], orientation);
      }

      const dataUrl = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(shot.blob);
      });

      doc.addImage(dataUrl, "PNG", 0, 0, wMm, hMm);
    }

    doc.save("screenshots.pdf");
  } catch (err) {
    console.error("PDF export failed:", err);
    showStatus("Export failed: " + err.message, true);
  } finally {
    btnExport.disabled = false;
    btnExport.textContent = "Export as PDF";
  }
});

// Log panel
const logToggle = document.getElementById("log-toggle");
const logPanel = document.getElementById("log-panel");
const logArrow = document.getElementById("log-arrow");
const logEntries = document.getElementById("log-entries");
const btnClearLogs = document.getElementById("btn-clear-logs");

logToggle.addEventListener("click", () => {
  const isHidden = logPanel.classList.toggle("hidden");
  logArrow.classList.toggle("open", !isHidden);
  if (!isHidden) loadLogs();
});

function formatLogTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

async function loadLogs() {
  const data = await chrome.storage.local.get({ logs: [] });
  logEntries.innerHTML = "";
  if (data.logs.length === 0) {
    logEntries.innerHTML = '<div class="log-empty">No log entries</div>';
    return;
  }
  // Show newest first
  const reversed = [...data.logs].reverse();
  for (const entry of reversed) {
    const div = document.createElement("div");
    div.className = "log-entry" + (entry.level === "error" ? " error" : "");
    div.textContent = `${formatLogTime(entry.time)} ${entry.message}`;
    div.title = entry.message;
    logEntries.appendChild(div);
  }
}

btnClearLogs.addEventListener("click", async () => {
  await chrome.storage.local.set({ logs: [] });
  loadLogs();
});

// Auto-refresh logs and queue while popup is open
const refreshInterval = setInterval(() => {
  loadQueue();
  if (!logPanel.classList.contains("hidden")) loadLogs();
}, 2000);
window.addEventListener("unload", () => clearInterval(refreshInterval));

// Load queue on popup open
console.log("[popup] loaded, db available:", !!db);
loadQueue();
