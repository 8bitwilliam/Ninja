 (() => {
   const api = (typeof browser !== 'undefined') ? browser : chrome;

   const $ui = document.getElementById('ui');
   const $warn = document.getElementById('warning');
   const $from = document.getElementById('fromDate');
   const $to = document.getElementById('toDate');
   const $go = document.getElementById('go');
   const $p = document.getElementById('progress');

   function reset() {
     $go.disabled = false;
     $go.textContent = 'Download';
   }

   api.runtime.onMessage.addListener(msg => {
     if (msg.action === 'scanProgress') {
       $p.innerHTML = `🔍 Scanning posts… <b>${msg.scanned}</b> checked`;
     }
     if (msg.action === 'scanComplete') {
       let t = `Found <b>${msg.photos}</b> photos and <b>${msg.videos}</b> videos.`;
       $p.innerHTML = t;
     }
     if (msg.action === 'progressUpdate') {
       let t = `Downloading <b>${msg.current}</b> of <b>${msg.total}</b> (${msg.fileType || 'file'})…`;
       $p.innerHTML = t;
     }
     if (msg.action === 'downloadsComplete') {
       let t = '<div style="margin-top:12px;">✅ All downloads complete!</div>';
       if (msg.manualVideoLinks && msg.manualVideoLinks.length > 0) {
         t += `<div style="margin-top:10px;">⚠️ ${msg.manualVideoLinks.length} video(s) need manual download.<br>
               Click below and choose <b>“Download Video”</b>:</div>`;
         for (const vid of msg.manualVideoLinks) {
           const date = vid.time ? vid.time.split('T')[0] : 'video';
           const textPart = vid.text ? ` – ${vid.text.substring(0,40)}...` : '';
           const label = `${date}${textPart}`;
           t += `<div style="margin-top:6px;">
                   <a href="${vid.url}" target="_blank" style="color:#4da3ff; text-decoration:underline;">
                     ${label}
                   </a>
                 </div>`;
         }
       }
       $p.innerHTML = t;
       reset();
     }
     if (msg.action === 'error') {
       $p.innerHTML = `⚠️ ${msg.message || 'Unexpected error'}`;
       reset();
     }
   });

   // UI setup
   api.tabs.query({ active: true, currentWindow: true }, tabs => {
     const url = tabs?.[0]?.url || '';
     if (url.startsWith('https://home.classdojo.com/')) {
       $ui.style.display = 'block';
       const today = new Date();
       const iso = today.toISOString().split('T')[0];
       if (!$from.value) $from.value = iso;
       if (!$to.value) $to.value = iso;
     } else {
       $warn.style.display = 'block';
     }
   });

   $go.addEventListener('click', () => {
     if (!$from.value || !$to.value) {
       $p.textContent = '⚠️ Please choose both dates.';
       return;
     }
     $go.disabled = true;
     $go.textContent = 'Processing…';
     $p.innerHTML = '🔍 Scanning posts…';

     api.tabs.query({ active: true, currentWindow: true }, tabs => {
       const tabId = tabs?.[0]?.id;
       if (!tabId) { $p.textContent = 'No active tab.'; reset(); return; }
       api.tabs.sendMessage(tabId, {
         action: 'runDownloader',
         fromDate: $from.value,
         toDate: $to.value
       });
     });
   });

   [$from, $to].forEach(el => el.addEventListener('change', () => el.blur()));
 })();
