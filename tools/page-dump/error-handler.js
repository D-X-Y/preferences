// Global error handler for popup — catches crashes before popup.js loads
window.onerror = function(msg, src, line, col, err) {
  var el = document.getElementById("crash");
  if (el) {
    el.classList.remove("hidden");
    el.textContent = "JS Error: " + msg + "\nat " + src + ":" + line + ":" + col;
  }
};
window.addEventListener("unhandledrejection", function(e) {
  var el = document.getElementById("crash");
  if (el) {
    el.classList.remove("hidden");
    el.textContent = "Unhandled promise: " + (e.reason?.message || e.reason || "unknown");
  }
});
