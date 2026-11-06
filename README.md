# jjs

Image → JJS custom moveset converter.

Upload an image and convert it into a **real JJS Skill Builder import code** (base64 → zstd → JSON) that you can paste into Jujutsu Shenanigans' Character Block configure menu.

> **Disclaimer:** Codes are generated in the verified JJS import-code format. They may break after JJS game updates. Import via: Private Server → Free Build → Place Character Block → Configure → Import/Clipboard → paste code.

## Features
- Image upload → particle grid conversion (positions, colors, sizes, opacity)
- Adjustable resolution, particle size, alpha threshold, and color mode
- Live dual-panel canvas preview (original vs. particle moveset)
- Generates **real JJS import codes** (base64 + zstd compressed JSON)
- Decode existing JJS moveset codes back to JSON
- Copy to clipboard / download `.jjsmoveset` / `.json`
- Client-side image processing + Node.js backend for zstd encode/decode

## Stack
- Frontend: vanilla HTML/CSS/JS
- Backend: Node.js with built-in zstd (Node 22+)
- Format: JSON → zstd (level 19, content size on, checksum off) → base64

## Usage
1. Start the server: `node server/index.js`
2. Open `http://localhost:8765`
3. Upload an image, adjust settings, preview the particle moveset
4. Export as a JJS import code, copy it, and paste into the game's Character Block → Configure → Import/Clipboard
5. Or decode an existing code by pasting it in the "Decode" section

## Files
- `index.html` — frontend UI
- `style.css` — styling
- `app.js` — frontend image processing + API calls
- `server/index.js` — Node.js HTTP server + zstd encode/decode API
- `README.md` — this file
