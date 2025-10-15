 (() => {
   const api = (typeof browser !== "undefined") ? browser : chrome;
   console.log("[Ninja Downloader] content.js loaded ✅ (v1.7 ClassDojo Downloads + region + fallback)");

   // ---- FEED URL (new + fallback) ------------------------------------------
   let FEED_URL =
     "https://home.classdojo.com/api/feed/homeFeed?withStudentCommentsAndLikes=true&withArchived=false";

   const seen = new Set();
   const queue = [];
   let scannedPosts = 0;
   let manualVideoLinks = [];
   const postMeta = {};
   const MASTER_FOLDER = "ClassDojo Downloads";
   const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
   const stripQuery = (s) => String(s || "").split("#")[0].split("?")[0];

   // ---- helpers ------------------------------------------------------------
   function looksLikePDF({ url, mimetype }) {
     const mime = (mimetype || "").toLowerCase();
     if (mime === "application/pdf" || mime.includes("pdf")) return true;
     const clean = stripQuery(url || "").toLowerCase();
     return clean.endsWith(".pdf") || clean.includes(".pdf.");
   }

   function ymdLocal(date) {
     const d = new Date(date);
     return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
   }

   function formatTime(dateStr) {
     const d = new Date(dateStr);
     return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
   }

   // ---- caption extractor --------------------------------------------------
   function extractStoryText(item) {
     const c = item?.contents || {};
     let txt = "";
     if (typeof c.text === "string" && c.text.trim()) txt = c.text;
     else if (typeof c.message === "string" && c.message.trim()) txt = c.message;
     else if (typeof c.caption === "string" && c.caption.trim()) txt = c.caption;
     else if (typeof c.note === "string" && c.note.trim()) txt = c.note;
     else if (Array.isArray(c.richText) && c.richText.length) {
       txt = c.richText
         .map((r) => (r.text ? r.text.trim() : ""))
         .filter(Boolean)
         .join("\n");
     }
     return txt.trim();
   }

   // ---- feed fetch with fallback -------------------------------------------
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

     // fallback to old path if 404
     if (resp.status === 404 && url.includes("/feed/homeFeed")) {
       console.warn("[Ninja Downloader] homeFeed 404 — trying storyFeed fallback");
       FEED_URL =
         "https://home.classdojo.com/api/storyFeed?withStudentCommentsAndLikes=true&withArchived=false";
       return getFeedPage(FEED_URL);
     }

     if (!resp.ok) throw new Error(`Feed HTTP ${resp.status}`);
     return resp.json();
   }

   // ---- DOM scraper --------------------------------------------------------
   async function scrapeDomMetadata() {
     console.log("[Ninja Downloader] Auto-scrolling to load all posts...");

     async function autoScrollPage(maxTime = 35000) {
       const start = Date.now();
       let lastHeight = 0;
       while (Date.now() - start < maxTime) {
         window.scrollTo(0, document.body.scrollHeight);
         await new Promise((r) => setTimeout(r, 1000));
         const newHeight = document.body.scrollHeight;
         if (newHeight === lastHeight) break;
         lastHeight = newHeight;
       }
       window.scrollTo(0, 0);
     }

     await autoScrollPage(35000);
     await new Promise((r) => setTimeout(r, 3000));

     const posts = document.querySelectorAll('div[role="article"][aria-label="Story post"]');
     const results = [];

     posts.forEach((post) => {
       const header = post.querySelector('div[data-name="storyPostHeader"]');
       const teacher = header?.querySelector("h3")?.innerText?.trim() || "Unknown Teacher";
       const className = header?.querySelector("span")?.innerText?.trim() || "Unknown Class";
       const titleSpan = header?.querySelector('span[title]');
       const rawTime = titleSpan?.getAttribute("title") || "";
       let dateTime;
       if (rawTime && /\d{2}\/\d{2}\/\d{4}/.test(rawTime)) {
         const [day, month, year] = rawTime.match(/\d{2}\/\d{2}\/\d{4}/)[0].split("/");
         dateTime = `${year}-${month}-${day}`;
       } else {
         dateTime = ymdLocal(new Date());
       }
       const storyText =
         post.querySelector('div[data-name="storyPostContents"] span[data-name="richText"]')?.innerText?.trim() ||
         "(No caption)";
       results.push({
         teacher,
         className,
         storyText,
         date: dateTime,
         time: formatTime(new Date()),
       });
     });

     console.log(`[Ninja Downloader] Scraped ${results.length} DOM posts`);
     return results;
   }

   // ---- attachments --------------------------------------------------------
   function extractAttachmentsFromItem(item) {
     const atts = item?.contents?.attachments || [];
     const out = [];
     const postTime = item.time || "";

     for (const a of atts) {
       const url = a.path || a.url || "";
       if (!url) continue;
       if (looksLikePDF({ url, mimetype: a.mimetype })) continue;
       const lower = stripQuery(url).toLowerCase();
       const type = lower.endsWith(".mp4") ? "video" : "photo";
       out.push({ url, time: postTime, type });
     }
     return out;
   }

   // ---- send download request to background.js -----------------------------
   function sendDownloadToBackground(url, filename, folder) {
     chrome.runtime.sendMessage({
       action: "directDownload",
       url,
       filename,
       sessionFolder: folder,
     });
   }

   async function saveBlob(att, folder, name) {
     const resp = await fetch(att.url, {
       credentials: "omit",
       mode: "cors",
       referrerPolicy: "no-referrer",
     });
     const ct = (resp.headers.get("content-type") || "").toLowerCase();
     if (ct.includes("application/pdf")) return "skipped-pdf";
     if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
     const blob = await resp.blob();
     const blobUrl = URL.createObjectURL(blob);
     sendDownloadToBackground(blobUrl, name, folder);
     setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
     return "saved";
   }

   async function downloadOne(att, fromYMD, toYMD, i, total) {
     const date = (att.time || "").split("T")[0] || ymdLocal(new Date());
     if (date < fromYMD || date > toYMD) return;
     let tail = decodeURIComponent((stripQuery(att.url).split("/").pop() || "")).toLowerCase();
     const hasGoodExt = /\.(jpg|jpeg|png|mp4)$/i.test(tail);
     if (!hasGoodExt) tail += att.type === "video" ? ".mp4" : ".jpg";
     const name = `${date}_${tail}`;
     const folder = `${MASTER_FOLDER}/${date}`;

     if (!postMeta[date]) postMeta[date] = [];
     if (!postMeta[date][0])
       postMeta[date].push({
         date,
         time: "",
         teacher: "Unknown",
         className: "Unknown",
         storyText: "(No caption)",
         files: [],
       });
     postMeta[date][0].files.push(name);

     try {
       await saveBlob(att, folder, name);
     } catch (e) {
       console.error("[Downloader] Failed", att.url, e);
     } finally {
       api.runtime.sendMessage({
         action: "progressUpdate",
         current: i,
         total,
         fileType: att.type,
       });
     }
   }

   // ---- text archive -------------------------------------------------------
   function saveTextArchivePerDay(dataByDay, fromYMD, toYMD) {
     Object.entries(dataByDay).forEach(([date, posts]) => {
       if (date < fromYMD || date > toYMD) return;
       const textContent = posts
         .map((entry) => {
           const header = `[${entry.date} ${entry.time}]`;
           const teacher = `Teacher: ${entry.teacher}`;
           const classLine = `Class: ${entry.className}`;
           const body = entry.storyText ? `Story:\n${entry.storyText}` : "(No caption)";
           const files =
             entry.files && entry.files.length
               ? "Files:\n" + entry.files.map((f) => `- ${f}`).join("\n")
               : "(No attachments)";
           return `${header}\n${teacher}\n${classLine}\n${body}\n${files}\n`;
         })
         .join("\n");
       const blob = new Blob([textContent], { type: "text/plain" });
       const blobUrl = URL.createObjectURL(blob);
       const filename = `${date}.txt`;
       const folder = `${MASTER_FOLDER}/${date}`;
       sendDownloadToBackground(blobUrl, filename, folder);
       setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
     });
   }

   // ---- main ---------------------------------------------------------------
   async function runDownloader(fromYMD, toYMD) {
     try {
       seen.clear();
       queue.length = 0;
       scannedPosts = 0;
       manualVideoLinks = [];
       Object.keys(postMeta).forEach((k) => delete postMeta[k]);
       let url = FEED_URL;

       while (url) {
         const page = await getFeedPage(url);
         const items = Array.isArray(page?._items) ? page._items : [];
         scannedPosts += items.length;
         api.runtime.sendMessage({ action: "scanProgress", scanned: scannedPosts });

         for (const item of items) {
           const itemDate = ymdLocal(item.time);
           if (itemDate < fromYMD || itemDate > toYMD) continue;
           for (const att of extractAttachmentsFromItem(item)) {
             if (!seen.has(att.url)) {
               seen.add(att.url);
               queue.push(att);
             }
           }
         }
         url = page?._links?.next?.href || "";
       }

       const domData = await scrapeDomMetadata();
       domData.forEach((d) => {
         if (d.date < fromYMD || d.date > toYMD) return;
         if (!postMeta[d.date]) postMeta[d.date] = [];
         postMeta[d.date].push({
           date: d.date,
           time: d.time,
           teacher: d.teacher,
           className: d.className,
           storyText: d.storyText,
           files: postMeta[d.date]?.[0]?.files || [],
         });
       });

       const photos = queue.filter((a) => a.type === "photo").length;
       const videos = queue.filter((a) => a.type === "video").length;
       api.runtime.sendMessage({ action: "scanComplete", photos, videos, total: queue.length });

       let i = 0;
       for (const att of queue) {
         i++;
         await downloadOne(att, fromYMD, toYMD, i, queue.length);
         await sleep(250);
       }

       saveTextArchivePerDay(postMeta, fromYMD, toYMD);
       api.runtime.sendMessage({ action: "downloadsComplete", manualVideoLinks });
     } catch (err) {
       console.error("[Downloader] Fatal error:", err);
       api.runtime.sendMessage({ action: "error", message: String(err?.message || err) });
       api.runtime.sendMessage({ action: "downloadsComplete", manualVideoLinks });
     }
   }

   api.runtime.onMessage.addListener((msg) => {
     if (msg.action === "runDownloader") runDownloader(msg.fromDate, msg.toDate);
   });
 })();
