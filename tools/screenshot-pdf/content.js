// Content script — injected into pages for full-page scroll and selection capture

if (!window.__screenshotPdfInjected) {
  window.__screenshotPdfInjected = true;

  const DPR = window.devicePixelRatio || 1;

  // Keep service worker alive during long operations
  let keepAliveInterval = null;
  function startKeepAlive() {
    keepAliveInterval = setInterval(() => {
      chrome.runtime.sendMessage({ action: "ping" });
    }, 20000);
  }
  function stopKeepAlive() {
    if (keepAliveInterval) {
      clearInterval(keepAliveInterval);
      keepAliveInterval = null;
    }
  }

  // Hide fixed/sticky elements to prevent duplication during scroll capture
  function getFixedElements() {
    const elements = [];
    const all = document.querySelectorAll("*");
    for (const el of all) {
      const style = getComputedStyle(el);
      if (style.position === "fixed" || style.position === "sticky") {
        elements.push({ el, originalDisplay: el.style.display });
      }
    }
    return elements;
  }

  function hideFixedElements(elements) {
    for (const { el } of elements) {
      el.style.display = "none";
    }
  }

  function restoreFixedElements(elements) {
    for (const { el, originalDisplay } of elements) {
      el.style.display = originalDisplay;
    }
  }

  // Wait for a specified time
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Request a capture from background
  function requestCapture() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "captureForStitch" }, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else if (resp.error) {
          reject(new Error(resp.error));
        } else {
          resolve(resp.dataUrl);
        }
      });
    });
  }

  // Load image from data URL
  function loadImage(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  // Send a message and wait for response (promisified)
  function sendMsg(msg) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(msg, (resp) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(resp);
        }
      });
    });
  }

  // Full-page scroll capture — background captures and stores each segment
  // directly to avoid sending large data URLs through messaging
  async function fullPageCapture() {
    startKeepAlive();

    const viewportHeight = window.innerHeight;
    const fullHeight = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    const totalSteps = Math.ceil(fullHeight / viewportHeight);
    const originalScrollY = window.scrollY;
    const fixedElements = getFixedElements();
    let stored = 0;
    let errors = 0;

    try {
      for (let i = 0; i < totalSteps; i++) {
        const scrollY = i * viewportHeight;
        window.scrollTo(0, scrollY);
        await wait(300); // Wait for scroll and render

        // Hide fixed elements after first capture
        if (i === 1) {
          hideFixedElements(fixedElements);
          await wait(100);
        }

        // Report progress
        sendMsg({ action: "fullPageProgress", current: i + 1, total: totalSteps });

        // Background captures visible tab and stores directly
        const label = totalSteps === 1
          ? "Full Page"
          : `Full Page (${i + 1}/${totalSteps})`;

        // Retry up to 3 times with increasing delay for rate limit errors
        let success = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const resp = await sendMsg({ action: "captureAndStore", label });
            if (resp && resp.success) {
              stored++;
              success = true;
              break;
            }
            const errMsg = resp?.error || "unknown";
            if (errMsg.includes("MAX_CAPTURE") && attempt < 2) {
              await wait(600 * (attempt + 1)); // Back off: 600ms, 1200ms
              continue;
            }
            errors++;
            sendMsg({ action: "fullPageError", error: `Segment ${i + 1}: ${errMsg}` });
            break;
          } catch (segErr) {
            if (segErr.message.includes("MAX_CAPTURE") && attempt < 2) {
              await wait(600 * (attempt + 1));
              continue;
            }
            errors++;
            sendMsg({ action: "fullPageError", error: `Segment ${i + 1}: ${segErr.message}` });
            break;
          }
        }

        // Delay between captures — Chrome limits captureVisibleTab to ~2/sec
        if (i < totalSteps - 1) {
          await wait(300);
        }
      }

      await sendMsg({ action: "fullPageDone", count: stored, errors });
    } catch (err) {
      sendMsg({ action: "fullPageError", error: err.message });
    } finally {
      restoreFixedElements(fixedElements);
      window.scrollTo(0, originalScrollY);
      stopKeepAlive();
    }
  }

  // Selection capture
  function startSelectionCapture() {
    const overlay = document.createElement("div");
    overlay.id = "__screenshot-pdf-overlay";
    Object.assign(overlay.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100vw",
      height: "100vh",
      zIndex: "2147483647",
      cursor: "crosshair",
      background: "rgba(0, 0, 0, 0.2)",
      margin: "0",
      padding: "0",
    });

    const selectionBox = document.createElement("div");
    Object.assign(selectionBox.style, {
      position: "fixed",
      border: "2px dashed #fff",
      background: "rgba(74, 144, 217, 0.2)",
      pointerEvents: "none",
      display: "none",
    });
    overlay.appendChild(selectionBox);

    let startX = 0, startY = 0;
    let isDragging = false;

    function onMouseDown(e) {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      selectionBox.style.display = "block";
      selectionBox.style.left = startX + "px";
      selectionBox.style.top = startY + "px";
      selectionBox.style.width = "0";
      selectionBox.style.height = "0";
      e.preventDefault();
    }

    function onMouseMove(e) {
      if (!isDragging) return;
      const x = Math.min(e.clientX, startX);
      const y = Math.min(e.clientY, startY);
      const w = Math.abs(e.clientX - startX);
      const h = Math.abs(e.clientY - startY);
      selectionBox.style.left = x + "px";
      selectionBox.style.top = y + "px";
      selectionBox.style.width = w + "px";
      selectionBox.style.height = h + "px";
      e.preventDefault();
    }

    function cleanup() {
      overlay.removeEventListener("mousedown", onMouseDown);
      overlay.removeEventListener("mousemove", onMouseMove);
      overlay.removeEventListener("mouseup", onMouseUp);
      document.removeEventListener("keydown", onKeyDown);
      overlay.remove();
    }

    function onMouseUp(e) {
      if (!isDragging) return;
      isDragging = false;

      const rect = {
        x: Math.min(e.clientX, startX),
        y: Math.min(e.clientY, startY),
        width: Math.abs(e.clientX - startX),
        height: Math.abs(e.clientY - startY),
      };

      cleanup();

      if (rect.width < 10 || rect.height < 10) return; // Too small

      // Save last selection for re-capture shortcut
      chrome.storage.local.set({ lastSelectionRect: rect });

      captureRect(rect);
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        cleanup();
      }
    }

    overlay.addEventListener("mousedown", onMouseDown);
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("mouseup", onMouseUp);
    document.addEventListener("keydown", onKeyDown);
    document.body.appendChild(overlay);
  }

  // Capture and crop a given rect from the visible viewport
  function captureRect(rect) {
    requestAnimationFrame(() => {
      chrome.runtime.sendMessage({ action: "captureForStitch" }, (resp) => {
        if (resp.error) return;

        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const cropX = rect.x * DPR;
          const cropY = rect.y * DPR;
          const cropW = rect.width * DPR;
          const cropH = rect.height * DPR;
          canvas.width = cropW;
          canvas.height = cropH;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
          const croppedDataUrl = canvas.toDataURL("image/png");
          chrome.runtime.sendMessage({
            action: "storeCapture",
            dataUrl: croppedDataUrl,
            label: "Selection",
          });
        };
        img.src = resp.dataUrl;
      });
    });
  }

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "startFullPageCapture") {
      fullPageCapture();
    } else if (msg.action === "startSelection") {
      startSelectionCapture();
    } else if (msg.action === "recaptureLastSelection") {
      chrome.storage.local.get("lastSelectionRect", (data) => {
        if (data.lastSelectionRect) {
          captureRect(data.lastSelectionRect);
        }
      });
    }
  });
}
