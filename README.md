# Ninja ClassDojo Downloader 🥷📸

A simple browser extension for **Chromium (Chrome/Edge)** based browsers that lets parents/guardians **download photos, videos, and story captions from ClassDojo Stories**.  
✅ Photos download automatically  
✅ Videos download automatically  
✅ Story captions, teacher names, and class info are saved into text archives  
✅ Automatically scrolls to load all posts before downloading  
✅ Organizes everything neatly inside a **“ClassDojo Downloads”** folder with **one subfolder per day**

---

## ✨ Features

- 📅 **Select a date range** – download only between chosen dates  
- 🖼️ **Photos** – saved automatically with filenames like:  
  `2025-10-06_photo_ab12cd34.jpg`  
- 🎥 **Videos** – saved automatically in Chrome/Edge  
- 🧾 **Story archive files (.txt)** – each day’s posts saved to text files containing:  
  - Teacher name  
  - Class name  
  - Story caption text  
  - Linked photo/video filenames  
- 🗂️ **Automatic folder organization** – creates a master folder named **“ClassDojo Downloads”** with daily subfolders:  

Downloads/
└── ClassDojo Downloads/
├── 2025-10-07/
│   ├── 2025-10-07_photo_1.jpg
│   ├── 2025-10-07_video_1.mp4
│   ├── 2025-10-07.txt
├── 2025-10-08/
│   ├── …
├── 2025-10-09/
│   ├── …


- 🔄 **Auto-scrolls** through the entire feed to load all posts  
- 🔒 **Permissions** – limited to only what’s required:  
- `home.classdojo.com`  
- `sphotos.classdojo.com`  
- `svideos.classdojo.com`  

---

## 📄 PDF Handling

The downloader **detects and skips all PDF attachments automatically**.  

---

## 🔧 Installation (Chromium browsers)

1. **Download this repo/pre-release** (*Download ZIP*, then unzip).  
2. Open your browser’s extensions page:  
 - **Chrome** → `chrome://extensions/`  
 - **Edge** → `edge://extensions/`  
3. Enable **Developer Mode** (toggle in the top right).  
4. Click **Load unpacked**.  
5. Select the **Chromium** folder (it contains `manifest.json`).  
6. You’ll now see the **🥷 Ninja icon** in your toolbar.  

---

## ▶️ Usage

1. Log in to [ClassDojo](https://home.classdojo.com/) as a **parent/guardian**.  
2. Open your **child’s Story page**.  
3. Click the **Ninja icon** in your browser toolbar.  
4. Choose your desired **date range**.  
5. Click **Download** – the extension will:  
 - Automatically scroll the Story page to load every post  
 - Download all photos and videos  
 - Create daily `.txt` archive files containing story text and metadata  
 - Save everything inside a **“ClassDojo Downloads”** folder, neatly sorted by date  

---

## 🆕 Version 1.7

- Fixed metadata logic – `.txt` files now always generate within the selected date range  
- Added automatic folder organization:  
- A master folder **“ClassDojo Downloads”**  
- Subfolders for each date (one per day)  
- Improved stability and Chrome compatibility with background service worker  

---

YouTube

[![Watch the video](https://img.youtube.com/vi/P8nsjQuUTZE/maxresdefault.jpg)](https://www.youtube.com/watch?v=P8nsjQuUTZE)
