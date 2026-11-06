/**
 * jjs — Image to JJS custom moveset converter
 *
 * Converts an uploaded image into a particle-grid moveset blueprint.
 * Output: readable JSON + an encoded shareable code string (base64 of the JSON).
 *
 * NOTE: The official JJS Skill Builder export binary format is not publicly
 * documented, so this tool produces a moveset *structure* you can use as a
 * blueprint — not a guaranteed in-game import string.
 */

const imageInput = document.getElementById('imageInput');
const resolutionInput = document.getElementById('resolution');
const particleSizeInput = document.getElementById('particleSize');
const thresholdInput = document.getElementById('threshold');
const colorModeInput = document.getElementById('colorMode');
const singleColorRow = document.getElementById('singleColorRow');
const singleColorInput = document.getElementById('singleColor');
const regenBtn = document.getElementById('regenBtn');
const origCanvas = document.getElementById('origCanvas');
const particleCanvas = document.getElementById('particleCanvas');
const particleCountEl = document.getElementById('particleCount');
const exportFormat = document.getElementById('exportFormat');
const output = document.getElementById('output');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');

const resVal = document.getElementById('resVal');
const sizeVal = document.getElementById('sizeVal');
const threshVal = document.getElementById('threshVal');

let img = null;
let particles = [];

// ---- UI wiring ----

resolutionInput.addEventListener('input', () => {
  resVal.textContent = resolutionInput.value;
});
particleSizeInput.addEventListener('input', () => {
  sizeVal.textContent = particleSizeInput.value;
});
thresholdInput.addEventListener('input', () => {
  threshVal.textContent = thresholdInput.value;
});

colorModeInput.addEventListener('change', () => {
  if (colorModeInput.value === 'single') {
    singleColorRow.style.display = 'flex';
  } else {
    singleColorRow.style.display = 'none';
  }
});

imageInput.addEventListener('change', handleFileSelect);
regenBtn.addEventListener('click', generateMoveset);
copyBtn.addEventListener('click', copyOutput);
downloadBtn.addEventListener('click', downloadOutput);

// ---- File handling ----

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    drawOriginal();
    regenBtn.disabled = false;
    generateMoveset();
  };
  img.src = url;
}

function drawOriginal() {
  const canvas = origCanvas;
  const ctx = canvas.getContext('2d');

  // Fit canvas to a max display size while keeping aspect ratio
  const maxDisp = 400;
  const scale = Math.min(maxDisp / img.width, maxDisp / img.height, 1);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

// ---- Core conversion ----

function generateMoveset() {
  if (!img) return;

  const res = parseInt(resolutionInput.value, 10);
  const particleSize = parseInt(particleSizeInput.value, 10);
  const threshold = parseInt(thresholdInput.value, 10);
  const colorMode = colorModeInput.value;
  const singleColor = singleColorInput.value;

  // Sample the image at `res` x `res` grid
  particles = sampleImageToParticles(img, res, threshold, colorMode, singleColor);

  // Draw preview
  drawParticlePreview(particles, particleSize);

  // Update count
  particleCountEl.textContent = `Particles: ${particles.length}`;

  // Build moveset object
  const moveset = {
    name: 'image-moveset',
    base: 'custom',
    created: new Date().toISOString(),
    source: 'jjs image converter',
    settings: {
      resolution: res,
      particleSize,
      threshold,
      colorMode,
      singleColor,
    },
    particles,
  };

  // Export outputs
  const json = JSON.stringify(moveset, null, 2);
  const code = encodeCode(moveset);

  output.value = exportFormat.value === 'code' ? code : json;
}

function sampleImageToParticles(image, res, threshold, colorMode, singleColor) {
  // Create an offscreen canvas to sample pixels
  const off = document.createElement('canvas');
  off.width = image.width;
  off.height = image.height;
  const octx = off.getContext('2d');
  octx.drawImage(image, 0, 0);

  const imageData = octx.getImageData(0, 0, image.width, image.height);
  const data = imageData.data;

  const stepX = image.width / res;
  const stepY = image.height / res;

  const particles = [];

  for (let gy = 0; gy < res; gy++) {
    for (let gx = 0; gx < res; gx++) {
      // Sample center of the grid cell
      const sx = Math.floor((gx + 0.5) * stepX);
      const sy = Math.floor((gy + 0.5) * stepY);
      const i = (sy * image.width + sx) * 4;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      // Alpha threshold: skip transparent cells
      if (a < threshold) continue;

      let color;
      if (colorMode === 'single') {
        color = singleColor;
      } else if (colorMode === 'grayscale') {
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        color = `rgb(${gray},${gray},${gray})`;
      } else {
        color = `rgb(${r},${g},${b})`;
      }

      // Particle "intensity" based on brightness — affects size/lifetime hints
      const brightness = (r + g + b) / 3;

      particles.push({
        id: `${gx},${gy}`,
        x: gx / (res - 1),   // normalized 0..1
        y: gy / (res - 1),   // normalized 0..1
        color,
        size: particleSize,
        opacity: a / 255,
        brightness,
        // JJS Skill Builder-ish hints (for manual recreation)
        skillSlot: null,
        animation: null,
        hitbox: null,
      });
    }
  }

  return particles;
}

function drawParticlePreview(particles, particleSize) {
  const canvas = particleCanvas;
  const ctx = canvas.getContext('2d');

  // Fixed preview size
  const size = 400;
  canvas.width = size;
  canvas.height = size;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(0, 0, size, size);

  // Draw each particle as a colored square (pixelated look)
  particles.forEach(p => {
    const px = Math.round(p.x * (size - particleSize));
    const py = Math.round(p.y * (size - particleSize));

    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;
    ctx.fillRect(px, py, particleSize, particleSize);
    ctx.globalAlpha = 1.0;
  });
}

// ---- Export encoding ----

function encodeCode(moveset) {
  const json = JSON.stringify(moveset);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  // Prefix so it looks like a moveset code
  return 'jjs:' + b64;
}

function decodeCode(code) {
  const prefix = 'jjs:';
  if (!code.startsWith(prefix)) return null;
  const b64 = code.slice(prefix.length);
  const json = decodeURIComponent(escape(atob(b64)));
  return JSON.parse(json);
}

// ---- Clipboard / download ----

async function copyOutput() {
  const text = output.value;
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const orig = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = orig; }, 1200);
  } catch (err) {
    // Fallback for older browsers
    output.select();
    document.execCommand('copy');
    const orig = copyBtn.textContent;
    copyBtn.textContent = 'Copied!';
    setTimeout(() => { copyBtn.textContent = orig; }, 1200);
  }
}

function downloadOutput() {
  const text = output.value;
  if (!text) return;
  const ext = exportFormat.value === 'code' ? 'jjsmoveset' : 'json';
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `jjs-moveset.${ext}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---- Format switch re-renders output ----

exportFormat.addEventListener('change', () => {
  if (!output.value) return;
  try {
    if (exportFormat.value === 'code') {
      // Try to parse current JSON and re-encode
      const parsed = JSON.parse(output.value);
      output.value = encodeCode(parsed);
    } else {
      // Try to decode current code to JSON
      const decoded = decodeCode(output.value);
      if (decoded) {
        output.value = JSON.stringify(decoded, null, 2);
      }
    }
  } catch (e) {
    // If conversion fails, leave as-is
  }
});
