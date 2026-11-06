# jjs

Image → JJS custom moveset converter.

Upload an image and convert it into a particle-based moveset blueprint for Jujutsu Shenanigans' Skill Builder.

> **Disclaimer:** This generates a moveset *structure* inspired by the JJS Skill Builder. The official JJS export string binary format is not publicly documented, so the output may not import directly into the game without adjustment. Use it as a design/blueprint tool — you can recreate the particle layout manually in the Skill Builder, or adapt the JSON output if you learn the real format.

## Features
- Image upload → particle grid conversion (positions, colors, sizes)
- Adjustable resolution, particle size, alpha threshold, and color mode
- Live dual-panel canvas preview (original vs. particle moveset)
- Export as readable JSON or an encoded shareable code string
- Copy to clipboard / download `.jjsmoveset` file
- Entirely client-side — nothing leaves your browser

## Stack
Plain HTML/CSS/JS. No build step, no dependencies. Open `index.html` directly or serve with any static server.

## Usage
1. Open `index.html`
2. Upload an image (PNG/JPG/GIF/WEBP)
3. Tweak resolution/size/threshold to get the particle density you want
4. Preview the particle moveset on the right canvas
5. Export as JSON or code string, copy/download, and use as a blueprint in the JJS Skill Builder
