/**
 * jjs — Image/Video to JJS custom moveset converter
 *
 * Frontend: media upload, particle-grid generation, preview.
 * Backend (Node.js): zstd encode/decode for real JJS Skill Builder import codes.
 *
 * Import in-game: Private Server → Free Build → Place Character Block →
 * Configure → Import/Clipboard → paste code.
 */

const mediaInput = document.getElementById('mediaInput');
const resolutionInput = document.getElementById('resolution');
const particleSizeInput = document.getElementById('particleSize');
const thresholdInput = document.getElementById('threshold');
const colorModeInput = document.getElementById('colorMode');
const singleColorRow = document.getElementById('singleColorRow');
const singleColorInput = document.getElementById('singleColor');
const durationInput = document.getElementById('duration');
const fpsInput = document.getElementById('fps');
const videoSettingsRow = document.getElementById('videoSettingsRow');
const regenBtn = document.getElementById('regenBtn');
const origCanvas = document.getElementById('origCanvas');
const particleCanvas = document.getElementById('particleCanvas');
const particleCountEl = document.getElementById('particleCount');
const mediaInfoEl = document.getElementById('mediaInfo');
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
const durVal = document.getElementById('durVal');
const fpsVal = document.getElementById('fpsVal');

let media = null;        // HTMLImageElement or HTMLVideoElement
let mediaType = null;    // 'image' or 'video'
let particles = [];      // flattened particle list with time stamps
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
durationInput.addEventListener('input', () => {
  durVal.textContent = durationInput.value;
});
fpsInput.addEventListener('input', () => {
  fpsVal.textContent = fpsInput.value;
});

colorModeInput.addEventListener('change', () => {
  if (colorModeInput.value === 'single') {
    singleColorRow.style.display = 'flex';
  } else {
    singleColorRow.style.display = 'none';
  }
});

mediaInput.addEventListener('change', handleMediaSelect);
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
    await fetch('/api/decode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'KLUv/SC2XQQAMkgbGVBZBzBSojMUqD' }),
    });
    serverReady = true;
    serverStatus.textContent = 'Server ready — generating real JJS import codes.';
    serverStatus.style.color = '#00ff9d';
    regenBtn.disabled = false;
    if (media) generateMoveset();
  } catch (e) {
    serverReady = false;
    serverStatus.textContent = 'Server not available — codes will not generate.';
    serverStatus.style.color = '#ff6b6b';
    setTimeout(checkServer, 1000);
  }
}
checkServer();

// ---- Media handling ----

function handleMediaSelect(e) {
  const file = e.target.files[0];
  if (!file) return;

  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith('video/');
  mediaType = isVideo ? 'video' : 'image';

  // Show/hide video-specific settings
  if (isVideo) {
    videoSettingsRow.style.display = 'block';
  } else {
    videoSettingsRow.style.display = 'none';
  }

  if (isVideo) {
    const vid = document.createElement('video');
    vid.preload = 'metadata';
    vid.src = url;
    vid.onloadedmetadata = () => {
      media = vid;
      mediaInfoEl.textContent = `Video: ${vid.videoWidth}×${vid.videoHeight}, ${vid.duration.toFixed(2)}s`;
      drawOriginalFrame(0);
      if (serverReady) {
        regenBtn.disabled = false;
        generateMoveset();
      }
    };
    vid.onerror = () => {
      alert('Failed to load video file.');
      URL.revokeObjectURL(url);
    };
  } else {
    const img = new Image();
    img.onload = () => {
      media = img;
      mediaInfoEl.textContent = `Image: ${img.width}×${img.height}`;
      drawOriginal();
      URL.revokeObjectURL(url);
      if (serverReady) {
        regenBtn.disabled = false;
        generateMoveset();
      }
    };
    img.onerror = () => {
      alert('Failed to load image file.');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }
}

function drawOriginal() {
  const canvas = origCanvas;
  const ctx = canvas.getContext('2d');

  const maxDisp = 400;
  const scale = Math.min(maxDisp / media.width, maxDisp / media.height, 1);
  canvas.width = media.width * scale;
  canvas.height = media.height * scale;

  ctx.drawImage(media, 0, 0, canvas.width, canvas.height);
}

function drawOriginalFrame(time) {
  const canvas = origCanvas;
  const ctx = canvas.getContext('2d');
  const vid = media;

  // Seek to the frame
  vid.currentTime = time;
  vid.onseeked = () => {
    const maxDisp = 400;
    const scale = Math.min(maxDisp / vid.videoWidth, maxDisp / vid.videoHeight, 1);
    canvas.width = vid.videoWidth * scale;
    canvas.height = vid.videoHeight * scale;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
  };
}

// ---- Core conversion ----

async function generateMoveset() {
  if (!media || !serverReady) return;

  const res = parseInt(resolutionInput.value, 10);
  const particleSize = parseInt(particleSizeInput.value, 10);
  const threshold = parseInt(thresholdInput.value, 10);
  const colorMode = colorModeInput.value;
  const singleColor = singleColorInput.value;
  const duration = parseFloat(durationInput.value);
  const fps = parseInt(fpsInput.value, 10);

  if (mediaType === 'image') {
    particles = sampleImageToParticles(media, res, threshold, colorMode, singleColor, duration);
  } else {
    particles = await sampleVideoToParticles(media, res, threshold, colorMode, singleColor, duration, fps);
  }

  drawParticlePreview(particles, particleSize, mediaType === 'video' ? media.duration : duration);
  particleCountEl.textContent = `Particles: ${particles.length}`;

  const moveset = buildMoveset(particles, res, particleSize, threshold, colorMode, singleColor, mediaType, duration);

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

function sampleImageToParticles(image, res, threshold, colorMode, singleColor, duration) {
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

      particles.push({
        id: `${gx},${gy}`,
        x: gx / (res - 1),
        y: gy / (res - 1),
        color,
        size: particleSize,
        opacity: a / 255,
        time: duration,   // all particles appear at once
      });
    }
  }

  return particles;
}

async function sampleVideoToParticles(video, res, threshold, colorMode, singleColor, duration, fps) {
  const particles = [];
  const vid = video;

  // Clamp duration to video length
  const effectiveDuration = Math.min(duration, vid.duration);
  const frameInterval = 1.0 / fps;
  const numFrames = Math.ceil(effectiveDuration / frameInterval);

  const off = document.createElement('canvas');
  off.width = res;
  off.height = res;
  const octx = off.getContext('2d');

  for (let f = 0; f < numFrames; f++) {
    const t = f * frameInterval;
    if (t > effectiveDuration) break;

    // Seek video to this timestamp
    await seekAndDrawFrame(vid, t, off, octx, res, res);

    const imageData = octx.getImageData(0, 0, res, res);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < threshold) continue;

      const gx = ((i / 4) % res) / (res - 1);
      const gy = Math.floor((i / 4) / res) / (res - 1);

      let color;
      if (colorMode === 'single') {
        color = singleColor;
      } else if (colorMode === 'grayscale') {
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        color = `rgb(${gray},${gray},${gray})`;
      } else {
        color = `rgb(${r},${g},${b})`;
      }

      particles.push({
        id: `${gx.toFixed(3)},${gy.toFixed(3)},${t.toFixed(3)}`,
        x: gx,
        y: gy,
        color,
        size: particleSize,
        opacity: a / 255,
        time: t,   // when this particle appears in the moveset
      });
    }
  }

  return particles;
}

function seekAndDrawFrame(video, time, canvas, ctx, width, height) {
  return new Promise((resolve) => {
    let resolved = false;
    const onSeeked = () => {
      if (resolved) return;
      resolved = true;
      video.removeEventListener('seeked', onSeeked);
      ctx.drawImage(video, 0, 0, width, height);
      resolve();
    };
    video.addEventListener('seeked', onSeeked, { once: true });
    video.currentTime = time;
    // Fallback if seeked doesn't fire
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        video.removeEventListener('seeked', onSeeked);
        ctx.drawImage(video, 0, 0, width, height);
        resolve();
      }
    }, 100);
  });
}

function drawParticlePreview(particles, particleSize, totalTime) {
  const canvas = particleCanvas;
  const ctx = canvas.getContext('2d');

  const size = 400;
  canvas.width = size;
  canvas.height = size;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(0, 0, size, size);

  // If video, show particles at the midpoint time for preview
  const previewTime = totalTime / 2;

  particles.forEach(p => {
    // For preview, only show particles near the midpoint time
    if (mediaType === 'video' && Math.abs(p.time - previewTime) > 0.5) return;

    const px = Math.round(p.x * (size - particleSize));
    const py = Math.round(p.y * (size - particleSize));

    ctx.globalAlpha = p.opacity;
    ctx.fillStyle = p.color;
    ctx.fillRect(px, py, particleSize, particleSize);
    ctx.globalAlpha = 1.0;
  });
}

// ---- Build JJS slot structure ----

function buildMoveset(particles, res, particleSize, threshold, colorMode, singleColor, mediaType, duration) {
  const slots = [];

  // Group particles by time for video, or all at once for image
  const timeGroups = new Map();
  particles.forEach(p => {
    const key = p.time.toFixed(3);
    if (!timeGroups.has(key)) timeGroups.set(key, []);
    timeGroups.get(key).push(p);
  });

  // Build Line array with hitbox events at each timestamp
  const line = [];
  let eventId = 0;

  timeGroups.forEach((group, timeKey) => {
    const time = parseFloat(timeKey);
    group.forEach(p => {
      line.push({
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
        TIME: Math.round(time * 1000) / 1000,
        ID: `p${eventId++}`,
      });
    });
  });

  // Main skill slot
  slots.push({
    DATA: {
      Req: [],
      Line: line,
      Prop: [],
      Branch: null,
    },
    NAME: mediaType === 'video' ? 'Video Moveset' : 'Image Moveset',
    K_NAME: 'SKILL',
    KEY: 1,
    TOOL_TIP: `${mediaType} moveset generated from media`,
    COOLDOWN: mediaType === 'video' ? Math.ceil(duration) : 5,
  });

  return {
    name: `${mediaType}-moveset`,
    base: 'custom',
    mediaType,
    duration,
    slots,
    settings: {
      resolution: res,
      particleSize,
      threshold,
      colorMode,
      singleColor,
      duration,
      fps: mediaType === 'video' ? parseInt(fpsInput.value, 10) : null,
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
