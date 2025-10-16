console.log("[Ninja Downloader] Background service worker loaded ✅");

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "directDownload") {
    handleDownload(message);
  }
  return true;
});

async function handleDownload(message) {
  try {
    const { url, filename, sessionFolder } = message;
    if (!url || !filename) return;

    const folderPath = `${sessionFolder}/${filename}`;
    console.log(`[Downloader] Saving to ${folderPath}`);

    // Trigger Chrome-managed download
    await chrome.downloads.download({
      url,
      filename: folderPath,
      conflictAction: "overwrite"
    });

    console.log(`[Downloader] ✅ Download queued: ${folderPath}`);
  } catch (err) {
    console.error("[Downloader] ❌ Download failed:", err);
  }
}
