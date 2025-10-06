 (() => {
   const api = (typeof browser !== "undefined") ? browser : chrome;
   console.log("[Ninja Downloader] content.js loaded ✅ (Auto-scroll + metadata)");

   const FEED_URL =
     "https://home.classdojo.com/api/storyFeed?withStudentCommentsAndLikes=true&withArchived=false";

   const seen = new Set();
   const queue = [];
   let scannedPosts = 0;
   let manualVideoLinks = [];
   const postMeta = {};

   const sleep = ms => new Promise(r => setTimeout(r, ms));

   function isChromium() {
     return !!window.chrome && (!!window.chrome.runtime || !!window.chrome.downloads);
   }

   const stripQuery = s => String(s || "").split("#")[0].split("?")[0];

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

   function inRange(itemISO, fromYMD, toYMD) {
     const ymd = ymdLocal(itemISO);
     return ymd >= fromYMD && ymd <= toYMD;
   }

   async function getFeedPage(url) {
     const resp = await fetch(url, {
       headers: {
         accept: "*/*",
         "x-client-identifier": "Web",
         "x-sign-attachment-urls": "true"
       },
       credentials: "include",
       mode: "cors"
     });
     if (!resp.ok) throw new Error(`Feed HTTP ${resp.status}`);
     return resp.json();
   }

   // 🧩 Auto-scroll + DOM Scraper
   async function scrapeDomMetadata() {
     console.log("[Ninja Downloader] Auto-scrolling to load all posts...");

     async function autoScrollPage(maxTime = 35000) {
       const start = Date.now();
       let lastHeight = 0;
       while (Date.now() - start < maxTime) {
         window.scrollTo(0, document.body.scrollHeight);
         await new Promise(r => setTimeout(r, 1000));

         const newHeight = document.body.scrollHeight;
         if (newHeight === lastHeight) {
           console.log("[Ninja Downloader] No more posts to load.");
           break;
         }
         lastHeight = newHeight;
       }
       window.scrollTo(0, 0); // return to top
     }

     // Trigger full feed loading
     await autoScrollPage(35000);
     await new Promise(r => setTimeout(r, 3000)); // allow render delay

     console.log("[Ninja Downloader] Collecting posts from DOM...");

     const posts = document.querySelectorAll('div[role="article"][aria-label="Story post"]');
     const results = [];

     posts.forEach(post => {
       const header = post.querySelector('div[data-name="storyPostHeader"]');
       const teacher = header?.querySelector('h3')?.innerText?.trim() || "Unknown Teacher";
       const className = header?.querySelector('span')?.innerText?.trim() || "Unknown Class";

       // Get proper date from title attribute
       const titleSpan = header?.querySelector('span[title]');
       const rawTime = titleSpan?.getAttribute("title") || "";
       let dateTime;

       if (rawTime && /\d{2}\/\d{2}\/\d{4}/.test(rawTime)) {
         const [day, month, year] = rawTime.match(/\d{2}\/\d{2}\/\d{4}/)[0].split("/");
         dateTime = `${year}-${month}-${day}`;
       } else {
         const now = new Date();
         dateTime = ymdLocal(now);
       }

       // Extract caption/story text
       const storyText =
         post.querySelector('div[data-name="storyPostContents"] span[data-name="richText"]')?.innerText?.trim() ||
         "(No caption)";

       results.push({
         teacher,
         className,
         storyText,
         date: dateTime,
         time: formatTime(new Date())
       });
     });

     console.log(`[Ninja Downloader] Scraped ${results.length} DOM posts`);
     return results;
   }

   function extractAttachmentsFromItem(item) {
     const atts = item?.contents?.attachments || [];
     const out = [];
     const postText = item.contents?.message || item.contents?.text || "";
     const postTime = item.time || "";

     for (const a of atts) {
       const url = a.path || a.url || "";
       if (!url) continue;
       if (looksLikePDF({ url, mimetype: a.mimetype })) continue;

       const lower = stripQuery(url).toLowerCase();
       const type = lower.endsWith(".mp4") ? "video" : "photo";

       out.push({
         url,
         time: postTime,
         type,
         text: postText
       });
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
       console.warn("[Downloader] Skipping PDF:", att.url);
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
     const date = (att.time || "").split("T")[0] || ymdLocal(new Date());
     let tail = decodeURIComponent((stripQuery(att.url).split("/").pop() || "")).toLowerCase();

     const hasGoodExt = /\.(jpg|jpeg|png|mp4)$/i.test(tail);
     if (!hasGoodExt) tail += att.type === "video" ? ".mp4" : ".jpg";

     const name = `${date}_${tail || (att.type === "video" ? "video.mp4" : "photo.jpg")}`;

     if (!postMeta[date]) postMeta[date] = [];
     if (!postMeta[date][0]) postMeta[date].push({
       date,
       time: "",
       teacher: "Unknown",
       className: "Unknown",
       storyText: "(No caption)",
       files: []
     });
     postMeta[date][0].files.push(name);

     try {
       if (att.type === "photo") {
         await saveBlob(att, name);
       } else {
         if (isChromium()) {
           api.runtime.sendMessage({
             action: "directVideoDownload",
             url: att.url,
             filename: name
           });
         } else {
           manualVideoLinks.push({ url: att.url, time: att.time });
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

   function saveTextArchivePerDay(dataByDay) {
     Object.entries(dataByDay).forEach(([date, posts]) => {
       const textContent = posts.map(entry => {
         const header = `[${entry.date} ${entry.time}]`;
         const teacher = `Teacher: ${entry.teacher}`;
         const classLine = `Class: ${entry.className}`;
         const body = entry.storyText ? `Story:\n${entry.storyText}` : "(No caption)";
         const files = entry.files && entry.files.length
           ? "Files:\n" + entry.files.map(f => `- ${f}`).join("\n")
           : "(No attachments)";
         return `${header}\n${teacher}\n${classLine}\n${body}\n${files}\n`;
       }).join("\n");

       const blob = new Blob([textContent], { type: "text/plain" });
       const a = document.createElement("a");
       a.href = URL.createObjectURL(blob);
       a.download = `ClassDojo_Archive_${date}.txt`;
       document.body.appendChild(a);
       a.click();
       a.remove();
       URL.revokeObjectURL(a.href);
     });
   }

   async function runDownloader(fromYMD, toYMD) {
     try {
       seen.clear();
       queue.length = 0;
       scannedPosts = 0;
       manualVideoLinks = [];
       Object.keys(postMeta).forEach(k => delete postMeta[k]);
       let url = FEED_URL;

       // Grab attachments via feed
       while (url) {
         const page = await getFeedPage(url);
         const items = Array.isArray(page?._items) ? page._items : [];
         scannedPosts += items.length;
         api.runtime.sendMessage({ action: "scanProgress", scanned: scannedPosts });

         let stop = false;
         for (const item of items) {
           if (!inRange(item.time, fromYMD, toYMD)) {
             if (ymdLocal(item.time) < fromYMD) {
               stop = true;
               break;
             }
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

       // Combine with DOM metadata
       const domData = await scrapeDomMetadata();
       domData.forEach(d => {
         if (!postMeta[d.date]) postMeta[d.date] = [];
         postMeta[d.date].push({
           date: d.date,
           time: d.time,
           teacher: d.teacher,
           className: d.className,
           storyText: d.storyText,
           files: postMeta[d.date]?.[0]?.files || []
         });
       });

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

       saveTextArchivePerDay(postMeta);

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
