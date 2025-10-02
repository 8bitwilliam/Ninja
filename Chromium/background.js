// background.js

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "directVideoDownload" && msg.url) {
    console.log("[Background] Direct video download requested:", msg.url);

    chrome.downloads.download({
      url: msg.url,
      filename: msg.filename || "video.mp4",
      saveAs: false
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("[Background] Download failed:", chrome.runtime.lastError.message);
      } else {
        console.log("[Background] Download started, ID:", downloadId);
      }
    });
  }
});
