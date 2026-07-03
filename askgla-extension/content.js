/*
 * WHAT DOES THIS FILE DO: reads saved settings from chrome.storage then calls
 * window.__askglaInit() which is defined by widget.js (loaded first by manifest.json).
 *
 * Both scripts run in the same content script isolated world — no <script> tag injection,
 * no CSP issues, works on every site.
 */

chrome.storage.sync.get(
  { apiBase: "https://13-206-227-58.sslip.io", dept: "", enabled: true },
  function (cfg) {
    if (!cfg.enabled) return;

    if (typeof window.__askglaInit === "function") {
      window.__askglaInit(
        (cfg.apiBase || "https://13-206-227-58.sslip.io").replace(/\/+$/, ""),
        cfg.dept || ""
      );
    }
  }
);
