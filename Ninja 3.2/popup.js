document.addEventListener("DOMContentLoaded", () => {
  const api = chrome || browser;

  const btn = document.getElementById("go");
  const fromInput = document.getElementById("fromDate");
  const toInput = document.getElementById("toDate");
  const progress = document.getElementById("progress");
  const ui = document.getElementById("ui");
  const warning = document.getElementById("warning");

  const log = (...a) => console.log("[Ninja Popup]", ...a);

  // --- Check if we are on the correct site --------------------------------
  api.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const url = (tabs && tabs[0] && tabs[0].url) ? tabs[0].url : "";
    if (url.startsWith("https://home.classdojo.com/")) {
      ui.style.display = "block";
      warning.style.display = "none";
    } else {
      ui.style.display = "none";
      warning.style.display = "block";
    }
  });

  // --- Ensure content.js is loaded into the active tab --------------------
  async function ensureContentReady() {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found");

    try {
      // ping content.js
      await api.tabs.sendMessage(tab.id, { action: "ping" });
      log("content.js already present");
    } catch {
      log("Injecting content.js into tab…");
      await api.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      // wait a full second to let it register
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  // --- Send message to active tab safely ----------------------------------
  async function safeSendToActiveTab(message) {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab found");
    try {
      return await api.tabs.sendMessage(tab.id, message);
    } catch (err) {
      throw new Error("Content script not yet ready or wrong page.");
    }
  }

  // --- Handle the click to start download ---------------------------------
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    btn.textContent = "Processing…";
    progress.textContent = "Preparing…";

    try {
      const fromVal = fromInput.value;
      const toVal = toInput.value;

      if (!fromVal || !toVal) {
        progress.textContent = "Please select both dates.";
        btn.disabled = false;
        btn.textContent = "Download";
        return;
      }

      await ensureContentReady();
      progress.textContent = "🔍 Scanning posts…";

      try {
        await safeSendToActiveTab({
          action: "runDownloader",
          fromDate: fromVal,
          toDate: toVal,
        });
      } catch (sendErr) {
        console.error(sendErr);
        progress.textContent = "Could not connect to downloader. Make sure you’re on the Story page and try again.";
        btn.disabled = false;
        btn.textContent = "Download";
        return;
      }
    } catch (e) {
      console.error(e);
      progress.textContent = `Error: ${e.message}`;
      btn.disabled = false;
      btn.textContent = "Download";
    }
  });

  // --- Listen for messages from content.js (progress updates) -------------
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "scanProgress") {
      progress.textContent = `🔍 Scanning posts… ${message.scanned}`;
    }
    if (message.action === "scanComplete") {
      progress.textContent = `Found ${message.photos ?? 0} photos, ${message.videos ?? 0} videos, ${message.pdfs ?? 0} pdfs (total: ${message.total}).`;
    }
    if (message.action === "progressUpdate") {
      progress.textContent = `Downloading ${message.current} of ${message.total}...`;
    }
    if (message.action === "downloadsComplete") {
      progress.textContent = "✅ All downloads complete!";
      btn.disabled = false;
      btn.textContent = "Download";
    }
    if (message.action === "error") {
      progress.textContent = `❌ ${message.message}`;
      btn.disabled = false;
      btn.textContent = "Download";
    }
  });

  log("popup.js loaded ✅ (stable injection + progress feedback)");
});
