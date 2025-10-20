 (() => {
   const api = chrome || browser;
   console.log("[Ninja Downloader] content.js loaded ✅ (v3.1 JSON-only, clean .txt)");

   const MASTER_FOLDER = "ClassDojo Downloads";
   const seen = new Set();
   const queue = [];
   const postMeta = {};
   const allItems = [];

   const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
   const stripQuery = (s) => String(s || "").split("#")[0].split("?")[0];

   let FEED_URL =
     "https://home.classdojo.com/api/feed/homeFeed?withStudentCommentsAndLikes=true&withArchived=false";

   // ---------- Helpers ----------
   function ymdLocal(date) {
     const d = new Date(date);
     return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
       d.getDate()
     ).padStart(2, "0")}`;
   }

   function looksLikePDF(url, mimetype) {
     const mime = (mimetype || "").toLowerCase();
     if (mime === "application/pdf" || mime.includes("pdf")) return true;
     const clean = stripQuery(url).toLowerCase();
     return clean.endsWith(".pdf") || clean.includes(".pdf.");
   }

   function formatStoryText(c) {
     if (!c) return "(No caption)";
     return (
       c.body ||
       c.text ||
       c.caption ||
       c.note ||
       (Array.isArray(c.richText)
         ? c.richText.map((r) => r.text?.trim() || "").filter(Boolean).join("\n")
         : "(No caption)")
     ).trim();
   }

   // ---------- Feed Fetch ----------
   async function getFeedPage(url) {
     const resp = await fetch(url, {
       headers: {
         accept: "*/*",
         "x-client-identifier": "Web",
         "x-sign-attachment-urls": "true",
       },
       credentials: "include",
       mode: "cors",
     });

     if (resp.status === 404 && url.includes("/feed/homeFeed")) {
       console.warn("[Ninja Downloader] homeFeed 404 — trying storyFeed fallback");
       FEED_URL =
         "https://home.classdojo.com/api/storyFeed?withStudentCommentsAndLikes=true&withArchived=false";
       return getFeedPage(FEED_URL);
     }

     if (!resp.ok) throw new Error(`Feed HTTP ${resp.status}`);
     return resp.json();
   }

   // ---------- File Handling ----------
   function sendDownload(url, filename, folder) {
     chrome.runtime.sendMessage({
       action: "directDownload",
       url,
       filename,
       sessionFolder: folder,
     });
   }

   async function saveFile(att, folder, name) {
     const resp = await fetch(att.url, {
       credentials: "omit",
       mode: "cors",
       referrerPolicy: "no-referrer",
     });
     if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
     const blob = await resp.blob();
     const blobUrl = URL.createObjectURL(blob);
     sendDownload(blobUrl, name, folder);
     setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
   }

   async function downloadOne(att, folder, name, i, total) {
     try {
       await saveFile(att, folder, name);
     } catch (e) {
       console.error("[Downloader] Failed", att.url, e);
     } finally {
       chrome.runtime.sendMessage({ action: "progressUpdate", current: i, total });
     }
   }

   // ---------- Save JSON and TXT ----------
   function saveJsonArchive() {
     const blob = new Blob([JSON.stringify(allItems, null, 2)], { type: "application/json" });
     const blobUrl = URL.createObjectURL(blob);
     sendDownload(blobUrl, "data.json", MASTER_FOLDER);
     setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
   }

   function saveTextArchive(dataByDay, fromYMD, toYMD) {
     Object.entries(dataByDay).forEach(([date, posts]) => {
       if (date < fromYMD || date > toYMD) return;

       const text = posts
         .map((p) => {
           const header = `[${date}]`;
           const teacher = `Teacher: ${p.teacher}`;
           const body = `Story:\n${p.storyText}`;
           const files = p.files?.length
             ? "Files:\n" + p.files.map((f) => `- ${f}`).join("\n")
             : "(No attachments)";
           return `${header}\n${teacher}\n${body}\n${files}\n`;
         })
         .join("\n");

       const blob = new Blob([text], { type: "text/plain" });
       const blobUrl = URL.createObjectURL(blob);
       sendDownload(blobUrl, `${date}.txt`, `${MASTER_FOLDER}/${date}`);
       setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
     });
   }

   // ---------- Main ----------
   async function runDownloader(fromYMD, toYMD) {
     try {
       queue.length = 0;
       Object.keys(postMeta).forEach((k) => delete postMeta[k]);
       let url = FEED_URL;
       let scanned = 0;

       while (url) {
         const page = await getFeedPage(url);
         if (!page?._items?.length) break;

         const items = page._items;
         allItems.push(...items);
         scanned += items.length;
         chrome.runtime.sendMessage({ action: "scanProgress", scanned });

         for (const item of items) {
           const date = ymdLocal(item.time);
           if (date < fromYMD || date > toYMD) continue;

           const teacher = item.senderName || "Unknown Teacher";
           const storyText = formatStoryText(item.contents);

           const attachments = item.contents?.attachments || [];
           for (const a of attachments) {
             const url = a.path || a.url;
             if (!url) continue;

             const cleanUrl = stripQuery(url);
             const fileName = `${date}_${decodeURIComponent(cleanUrl.split("/").pop())}`;
             const folder = `${MASTER_FOLDER}/${date}`;

             if (!postMeta[date]) postMeta[date] = [];
             if (!postMeta[date].length)
               postMeta[date].push({
                 date,
                 teacher,
                 storyText,
                 files: [],
               });

             postMeta[date][0].files.push(fileName);

             if (!seen.has(url)) {
               seen.add(url);
               queue.push({ url, folder, name: fileName });
             }
           }
         }

         url = page._links?.next?.href || "";
       }

       const total = queue.length;
       chrome.runtime.sendMessage({
         action: "scanComplete",
         photos: queue.filter((a) => a.name.endsWith(".jpg") || a.name.endsWith(".png")).length,
         videos: queue.filter((a) => a.name.endsWith(".mp4")).length,
         pdfs: queue.filter((a) => a.name.endsWith(".pdf")).length,
         total,
       });

       let i = 0;
       for (const att of queue) {
         i++;
         await downloadOne(att, att.folder, att.name, i, total);
         await sleep(200);
       }

       saveTextArchive(postMeta, fromYMD, toYMD);
       saveJsonArchive();
       chrome.runtime.sendMessage({ action: "downloadsComplete" });
     } catch (err) {
       console.error("[Downloader] Fatal error:", err);
       chrome.runtime.sendMessage({ action: "error", message: String(err?.message || err) });
       chrome.runtime.sendMessage({ action: "downloadsComplete" });
     }
   }

   chrome.runtime.onMessage.addListener((msg) => {
     if (msg.action === "runDownloader") runDownloader(msg.fromDate, msg.toDate);
   });
 })();
