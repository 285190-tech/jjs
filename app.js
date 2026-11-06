/**
 * jjs — Image to JJS custom moveset converter
 *
 * Frontend: image upload, particle-grid generation, preview.
 * Backend (Node.js): zstd encode/decode for real JJS Skill Builder import codes.
 *
 * Import in-game: Private Server → Free Build → Place Character Block →
 * Configure → Import/Clipboard → paste code.
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
const importInput = document.getElementById('importInput');
const decodeBtn = document.getElementById('decodeBtn');
const serverStatus = document.getElementById('serverStatus');

const resVal = document.getElementById('resVal');
const sizeVal = document.getElementById('sizeVal');
const threshVal = document.getElementById('threshVal');

let img = null;
let particles = [];
let serverReady = false;

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
decodeBtn.addEventListener('click', decodeExistingCode);

exportFormat.addEventListener('change', async () => {
  if (!output.value) return;
  try {
    if (exportFormat.value === 'code') {
      const parsed = JSON.parse(output.value);
      const res = await fetch('/api/encode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: parsed.slots || parsed }),
      });
      const data = await res.json();
      if (data.code) output.value = data.code;
    } else {
      const res = await fetch('/api/decode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: output.value }),
      });
      const data = await res.json();
      if (data.slots) output.value = JSON.stringify({ slots: data.slots }, null, 2);
    }
  } catch (e) {
    console.error(e);
  }
});

// ---- Server readiness check ----

async function checkServer() {
  try {
    const res = await fetch('/api/decode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'KLUv/SC2XQQAMkgbGVBZBzBSojMUqD' }),
    });
    // Even a 400 means the server is up
    serverReady = true;
    serverStatus.textContent = 'Server ready — generating real JJS import codes.';
    serverStatus.style.color = '#00ff9d';
    regenBtn.disabled = false;
    if (img) generateMoveset();
  } catch (e) {
    serverReady = false;
    serverStatus.textContent = 'Server not available — codes will not generate.';
    serverStatus.style.color = '#ff6b6b';
    setTimeout(checkServer, 1000);
  }
}
checkServer();

// ---- File handling ----

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    drawOriginal();
    if (serverReady) {
      regenBtn.disabled = false;
      generateMoveset();
    }
  };
  img.src = url;
}

function drawOriginal() {
  const canvas = origCanvas;
  const ctx = canvas.getContext('2d');

  const maxDisp = 400;
  const scale = Math.min(maxDisp / img.width, maxDisp / img.height, 1);
  canvas.width = img.width * scale;
  canvas.height = img.height * scale;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
}

// ---- Core conversion ----

async function generateMoveset() {
  if (!img || !serverReady) return;

  const res = parseInt(resolutionInput.value, 10);
  const particleSize = parseInt(particleSizeInput.value, 10);
  const threshold = parseInt(thresholdInput.value, 10);
  const colorMode = colorModeInput.value;
  const singleColor = singleColorInput.value;

  particles = sampleImageToParticles(img, res, threshold, colorMode, singleColor);
  drawParticlePreview(particles, particleSize);
  particleCountEl.textContent = `Particles: ${particles.length}`;

  const moveset = buildMoveset(particles, res, particleSize, threshold, colorMode, singleColor);

  const json = JSON.stringify(moveset, null, 2);
  const codeRes = await fetch('/api/encode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slots: moveset.slots }),
  });
  const codeData = await codeRes.json();
  const code = codeData.code || '';

  output.value = exportFormat.value === 'code' ? code : json;
}

function sampleImageToParticles(image, res, threshold, colorMode, singleColor) {
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
      const sx = Math.floor((gx + 0.5) * stepX);
      const sy = Math.floor((gy + 0.5) * stepY);
      const i = (sy * image.width + sx) * 4;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

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

      const brightness = (r + g + b) / 3;

      particles.push({
        id: `${gx},${gy}`,
        x: gx / (res - 1),
        y: gy / (res - 1),
        color,
        size: particleSize,
        opacity: a / 255,
        brightness,
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

  const size = 400;
  canvas.width = size;
  canvas.height = size;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(0, 0, size, size);

  particles.forEach(p => {
    const px = Math.round(p.x * (size - particleSize));
    const py = Math.round(p.y * (size - particleSize));

    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;
    ctx.fillRect(px, py, particleSize, particleSize);
    ctx.globalAlpha = 1.0;
  });
}

// ---- Build JJS slot structure ----

function buildMoveset(particles, res, particleSize, threshold, colorMode, singleColor) {
  const slots = [];

  // Main skill slot — each particle becomes a hitbox entry
  const line = particles.map(p => ({
    K_NAME: 'HITBOX',
    PREVIEW: [0, 0.1],
    DAMAGE: 1,
    STUN_ANIM: true,
    HIT_USER: false,
    BLOCKABLE: false,
    SINGLE_TARGET: false,
    SIZE: `${p.size}, ${p.size}, ${p.size}`,
    COLOR: p.color.replace('rgb(', '').replace(')', ''),
    POSITION: `${p.x.toFixed(3)}, ${p.y.toFixed(3)}, 0`,
    ROTATION: '0, 0, 0',
    TIME: 0.1,
  }));

  slots.push({
    DATA: {
      Req: [],
      Line: line,
      Prop: [],
      Branch: null,
    },
    NAME: 'Image Moveset',
    K_NAME: 'SKILL',
    KEY: 1,
    TOOL_TIP: 'Particle moveset generated from image',
    COOLDOWN: 5,
  });

  // Visual slots for every 4th particle
  particles.forEach((p, i) => {
    if (i % 4 === 0) {
      slots.push({
        DATA: {
          Req: [],
          Line: [{
            K_NAME: 'VISUAL',
            EFFECT: 'Particle',
            COLOR: p.color.replace('rgb(', '').replace(')', ''),
            SIZE: `${p.size * 2}, ${p.size * 2}, ${p.size * 2}`,
            POSITION: `${p.x.toFixed(3)}, ${p.y.toFixed(3)}, 0`,
            ROTATION: '0, 0, 0',
            TIME: 0.3,
            OPACITY: p.opacity,
          }],
          Prop: [],
          Branch: null,
        },
        NAME: `Particle ${i}`,
        K_NAME: 'SKILL',
        KEY: 2,
        TOOL_TIP: 'Visual effect',
        COOLDOWN: 0,
      });
    }
  });

  return {
    name: 'image-moveset',
    base: 'custom',
    slots,
    settings: {
      resolution: res,
      particleSize,
      threshold,
      colorMode,
      singleColor,
    },
  };
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

// ---- Decode existing code ----

async function decodeExistingCode() {
  const code = importInput.value.trim();
  if (!code) return;

  if (!serverReady) {
    alert('Server not ready yet. Please wait a moment.');
    return;
  }

  try {
    const res = await fetch('/api/decode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    const data = await res.json();

    if (data.error) {
      alert('Failed to decode code: ' + data.error);
      return;
    }

    exportFormat.value = 'json';
    output.value = JSON.stringify({ slots: data.slots }, null, 2);
    output.scrollTop = 0;
  } catch (e) {
    alert('Failed to decode code: ' + e.message);
  }
}
