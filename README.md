# jjs

Image/Video → JJS custom moveset converter.

Upload an image or video and convert it into a **real JJS Skill Builder import code** (base64 → zstd → JSON) that you can paste into Jujutsu Shenanigans' Character Block configure menu.

> **Disclaimer:** Codes are generated in the verified JJS import-code format. They may break after JJS game updates. Import via: Private Server → Free Build → Place Character Block → Configure → Import/Clipboard → paste code.

## Features
- Image/video upload → color block grid (positions, colors, sizes, opacity)
- Blocks touch by default with adjustable gap/spacing between them
- Adjustable resolution, block size, gap, alpha threshold, and color mode
- Live dual-panel canvas preview (original vs. block moveset)
- Duration control for particle/block lifetime
- Video frame rate control for frame-by-frame extraction
- Generates **real JJS import codes** (base64 + zstd compressed JSON)
- Decode existing JJS moveset codes back to JSON
- Copy to clipboard / download `.jjsmoveset` / `.json`
- Client-side media processing + Node.js backend for zstd encode/decode

## Stack
- Frontend: vanilla HTML/CSS/JS
- Backend: Node.js with built-in zstd (Node 22+)
- Format: JSON → zstd (level 19, content size on, checksum off) → base64

## Usage
1. Start the server: `node server/index.js`
2. Open `http://localhost:8765`
3. Upload an image or video, adjust settings, preview the block moveset
4. Export as a JJS import code, copy it, and paste into the game's Character Block → Configure → Import/Clipboard
5. Or decode an existing code by pasting it in the "Decode" section

## Files
- `index.html` — frontend UI
- `style.css` — styling
- `app.js` — frontend media processing + API calls
- `server/index.js` — Node.js HTTP server + zstd encode/decode API
- `README.md` — this file
