 (() => {
   const api = (typeof browser !== "undefined") ? browser : chrome;
   console.log("[ClassDojo Downloader] content.js loaded ✅ (with Chromium video support)");

   const FEED_URL =
     "https://home.classdojo.com/api/storyFeed?withStudentCommentsAndLikes=true&withArchived=false";

   const seen = new Set();
   const queue = [];
   let scannedPosts = 0;
   let manualVideoLinks = [];

   const sleep = ms => new Promise(r => setTimeout(r, ms));

   // Detect if we’re in Chromium (Chrome/Edge/Brave/etc.)
   function isChromium() {
     return !!window.chrome && (!!window.chrome.runtime || !!window.chrome.downloads);
   }

   const stripQuery = (s) => String(s || "").split("#")[0].split("?")[0];

   function looksLikePDF({ url, mimetype }) {
     const mime = (mimetype || "").toLowerCase();
     if (mime === "application/pdf" || mime.includes("pdf")) return true;
     const clean = stripQuery(url || "").toLowerCase();
     return clean.endsWith(".pdf") || clean.includes(".pdf.");
   }

   function ymdLocal(date) {
     const d = new Date(date);
     return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
   }
   function inRange(itemISO, fromYMD, toYMD) {
     const ymd = ymdLocal(itemISO);
     return ymd >= fromYMD && ymd <= toYMD;
   }

   async function getFeedPage(url) {
     const resp = await fetch(url, {
       headers: {
         "accept": "*/*",
         "x-client-identifier": "Web",
         "x-sign-attachment-urls": "true"
       },
       credentials: "include",
       mode: "cors"
     });
     if (!resp.ok) throw new Error(`Feed HTTP ${resp.status}`);
     return resp.json();
   }

   function extractAttachmentsFromItem(item) {
     const atts = item?.contents?.attachments || [];
     const out = [];
     const postText = (item.contents?.message || item.contents?.text || "").trim();

     for (const a of atts) {
       const url = a.path || a.url || "";
       if (!url) continue;

       // 🚫 Skip PDFs
       if (looksLikePDF({ url, mimetype: a.mimetype })) {
         console.log("[Downloader] Skipping PDF:", url);
         continue;
       }

       const lower = stripQuery(url).toLowerCase();
       const type = lower.endsWith(".mp4") ? "video" : "photo";

       out.push({ url, time: item.time, type, text: postText });
     }

     return out;
   }

   async function saveBlob(att, name) {
     const resp = await fetch(att.url, {
       credentials: "omit",
       mode: "cors",
       referrerPolicy: "no-referrer"
     });

     const ct = (resp.headers.get("content-type") || "").toLowerCase();
     if (ct.includes("application/pdf")) {
       console.warn("[Downloader] Skipping PDF at save stage:", att.url);
       return "skipped-pdf";
     }

     if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
     const blob = await resp.blob();

     const a = document.createElement("a");
     const href = URL.createObjectURL(blob);
     a.href = href;
     a.download = name;
     document.body.appendChild(a);
     a.click();
     a.remove();
     URL.revokeObjectURL(href);

     return "saved";
   }

   async function downloadOne(att, i, total) {
     const date = (att.time || "").split("T")[0] || "file";
     let tail = decodeURIComponent((stripQuery(att.url).split("/").pop() || "")).toLowerCase();

     const hasGoodExt = /\.(jpg|jpeg|png|mp4)$/i.test(tail);
     if (!hasGoodExt) {
       tail += (att.type === "video" ? ".mp4" : ".jpg");
     }

     const name = `${date}_${tail || (att.type === "video" ? "video.mp4" : "photo.jpg")}`;

     try {
       if (att.type === "photo") {
         await saveBlob(att, name);
       } else {
         if (isChromium()) {
           // ✅ Chrome/Edge direct download
           api.runtime.sendMessage({
             action: "directVideoDownload",
             url: att.url,
             filename: name
           });
         } else {
           // 🍏 Safari fallback
           console.warn("[Downloader] Video needs manual download:", att.url);
           manualVideoLinks.push({ url: att.url, time: att.time, text: att.text });
         }
       }
     } catch (e) {
       console.error("[Downloader] Failed", att.url, e);
     } finally {
       api.runtime.sendMessage({
         action: "progressUpdate",
         current: i,
         total,
         fileType: att.type
       });
     }
   }

   async function runDownloader(fromYMD, toYMD) {
     try {
       seen.clear();
       queue.length = 0;
       scannedPosts = 0;
       manualVideoLinks = [];
       let url = FEED_URL;

       while (url) {
         const page = await getFeedPage(url);
         const items = Array.isArray(page?._items) ? page._items : [];
         scannedPosts += items.length;
         api.runtime.sendMessage({ action: "scanProgress", scanned: scannedPosts });

         let stop = false;
         for (const item of items) {
           if (!inRange(item.time, fromYMD, toYMD)) {
             if (ymdLocal(item.time) < fromYMD) { stop = true; break; }
             continue;
           }
           for (const att of extractAttachmentsFromItem(item)) {
             if (!seen.has(att.url)) {
               seen.add(att.url);
               queue.push(att);
             }
           }
         }
         if (stop) break;
         url = page?._links?.next?.href || "";
       }

       const photos = queue.filter(a => a.type === "photo").length;
       const videos = queue.filter(a => a.type === "video").length;
       api.runtime.sendMessage({
         action: "scanComplete",
         photos,
         videos,
         total: queue.length
       });

       let i = 0;
       for (const att of queue) {
         i++;
         await downloadOne(att, i, queue.length);
         await sleep(250);
       }

       api.runtime.sendMessage({ action: "downloadsComplete", manualVideoLinks });

     } catch (err) {
       console.error("[Downloader] Fatal error:", err);
       api.runtime.sendMessage({ action: "error", message: String(err?.message || err) });
       api.runtime.sendMessage({ action: "downloadsComplete", manualVideoLinks });
     }
   }

   api.runtime.onMessage.addListener(msg => {
     if (msg.action === "runDownloader") {
       runDownloader(msg.fromDate, msg.toDate);
     }
   });
 })();
