/**
 * jjs — Image/Video to JJS custom moveset converter
 *
 * Fully client-side. Uses a bundled zstd-codec library for encode/decode
 * in the browser — no backend required. Works on Cloudflare Pages,
 * GitHub Pages, or any static host.
 *
 * Import in-game: Private Server → Free Build → Place Character Block →
 * Configure → Import/Clipboard → paste code.
 */

const mediaInput = document.getElementById('mediaInput');
const resolutionInput = document.getElementById('resolution');
const blockSizeInput = document.getElementById('blockSize');
const gapInput = document.getElementById('gap');
const thresholdInput = document.getElementById('threshold');
const colorModeInput = document.getElementById('colorMode');
const singleColorRow = document.getElementById('singleColorRow');
const singleColorInput = document.getElementById('singleColor');
const durationInput = document.getElementById('duration');
const fpsInput = document.getElementById('fps');
const videoSettingsRow = document.getElementById('videoSettingsRow');
const regenBtn = document.getElementById('regenBtn');
const origCanvas = document.getElementById('origCanvas');
const blockCanvas = document.getElementById('blockCanvas');
const blockCountEl = document.getElementById('blockCount');
const mediaInfoEl = document.getElementById('mediaInfo');
const exportFormat = document.getElementById('exportFormat');
const output = document.getElementById('output');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const importInput = document.getElementById('importInput');
const decodeBtn = document.getElementById('decodeBtn');
const zstdStatus = document.getElementById('zstdStatus');

const resVal = document.getElementById('resVal');
const sizeVal = document.getElementById('sizeVal');
const gapVal = document.getElementById('gapVal');
const threshVal = document.getElementById('threshVal');
const durVal = document.getElementById('durVal');
const fpsVal = document.getElementById('fpsVal');

let media = null;        // HTMLImageElement or HTMLVideoElement
let mediaType = null;    // 'image' or 'video'
let blocks = [];         // flattened block list with time stamps
let zstdReady = false;
let getZstdCodec = null; // Promise that resolves to the codec object

// ---- UI wiring ----

resolutionInput.addEventListener('input', () => {
  resVal.textContent = resolutionInput.value;
});
blockSizeInput.addEventListener('input', () => {
  sizeVal.textContent = blockSizeInput.value;
});
gapInput.addEventListener('input', () => {
  gapVal.textContent = gapInput.value;
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
      const code = await encodeCode(parsed.slots || parsed);
      if (code) output.value = code;
    } else {
      const decoded = await decodeCode(output.value);
      if (decoded) output.value = JSON.stringify({ slots: decoded }, null, 2);
    }
  } catch (e) {
    console.error(e);
    alert('Conversion failed: ' + e.message);
  }
});

// ---- zstd library loading ----

function updateZstdStatus(ready, message) {
  zstdReady = ready;
  if (ready) {
    zstdStatus.textContent = 'zstd ready — generating real JJS import codes.';
    zstdStatus.style.color = '#00ff9d';
    regenBtn.disabled = false;
    regenBtn.textContent = 'Regenerate Moveset';
    if (media) generateMoveset();
  } else {
    zstdStatus.textContent = message || 'zstd library not available.';
    zstdStatus.style.color = '#ff6b6b';
    regenBtn.disabled = true;
    regenBtn.textContent = 'zstd not loaded';
  }
}

async function loadZstdLibrary() {
  // The bundled library exposes window.ZstdCodec.ZstdCodec.run(callback)
  if (typeof window.ZstdCodec !== 'undefined' && typeof window.ZstdCodec.ZstdCodec?.run === 'function') {
    getZstdCodec = new Promise((resolve) => {
      window.ZstdCodec.ZstdCodec.run((zstd) => resolve(zstd));
    });
    updateZstdStatus(true);
    return;
  }

  // Fallback: try loading from local bundle
  try {
    const script = document.createElement('script');
    script.src = 'js/zstd-codec.bundle.js';
    script.onload = () => {
      setTimeout(() => {
        if (typeof window.ZstdCodec !== 'undefined' && typeof window.ZstdCodec.ZstdCodec?.run === 'function') {
          getZstdCodec = new Promise((resolve) => {
            window.ZstdCodec.ZstdCodec.run((zstd) => resolve(zstd));
          });
          updateZstdStatus(true);
        } else {
          updateZstdStatus(false, 'zstd library loaded but API not found');
        }
      }, 500);
    };
    script.onerror = () => {
      updateZstdStatus(false, 'Failed to load zstd library. Check that js/zstd-codec.bundle.js exists.');
    };
    document.head.appendChild(script);
  } catch (e) {
    updateZstdStatus(false, 'Failed to load zstd library: ' + e.message);
  }
}

// Initialize zstd on page load
loadZstdLibrary();

// ---- zstd encode/decode ----

async function withCodec(fn) {
  const zstd = await getZstdCodec;
  return fn(zstd);
}

async function zstdCompress(data, level) {
  return withCodec((zstd) => {
    const codec = zstd.Simple();
    try {
      const input = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      const compressed = codec.compress(input, level);
      return compressed;
    } finally {
      codec.delete ? codec.delete() : null;
    }
  });
}

async function zstdDecompress(data) {
  return withCodec((zstd) => {
    const codec = zstd.Simple();
    try {
      return codec.decompress(data);
    } finally {
      codec.delete ? codec.delete() : null;
    }
  });
}

async function encodeCode(slots) {
  if (!zstdReady) throw new Error('zstd library not ready');

  // Each slot's DATA must be a JSON string (double-encoded)
  const encodeSlots = slots.map(s => ({
    ...s,
    DATA: typeof s.DATA === 'string' ? s.DATA : JSON.stringify(s.DATA),
  }));
  const json = JSON.stringify(encodeSlots, { separators: [',', ':'] });
  const compressed = await zstdCompress(json, 19);

  // base64 encode
  const bytes = new Uint8Array(compressed);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decodeCode(code) {
  if (!zstdReady) throw new Error('zstd library not ready');

  let b64 = code.trim();
  if (b64.startsWith('jjs:')) b64 = b64.slice(4);

  const binary = atob(b64);
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  const decompressed = await zstdDecompress(bytes);
  const json = new TextDecoder().decode(decompressed);
  const slots = JSON.parse(json);

  // Expand inner DATA strings into nested objects
  return slots.map(slot => {
    const expanded = { ...slot };
    if (typeof expanded.DATA === 'string') {
      try {
        expanded.DATA = JSON.parse(expanded.DATA);
      } catch (e) {
        // keep as string
      }
    }
    return expanded;
  });
}

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
      if (zstdReady) {
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
      if (zstdReady) {
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
  if (!media || !zstdReady) return;

  const res = parseInt(resolutionInput.value, 10);
  const blockSize = parseInt(blockSizeInput.value, 10);
  const gap = parseInt(gapInput.value, 10);
  const threshold = parseInt(thresholdInput.value, 10);
  const colorMode = colorModeInput.value;
  const singleColor = singleColorInput.value;
  const duration = parseFloat(durationInput.value);
  const fps = parseInt(fpsInput.value, 10);

  if (mediaType === 'image') {
    blocks = sampleImageToBlocks(media, res, threshold, colorMode, singleColor, duration);
  } else {
    blocks = await sampleVideoToBlocks(media, res, threshold, colorMode, singleColor, duration, fps);
  }

  drawBlockPreview(blocks, blockSize, gap, mediaType === 'video' ? media.duration : duration);
  blockCountEl.textContent = `Blocks: ${blocks.length}`;

  const moveset = buildMoveset(blocks, res, blockSize, gap, threshold, colorMode, singleColor, mediaType, duration);

  const json = JSON.stringify(moveset, null, 2);
  const code = await encodeCode(moveset.slots);

  output.value = exportFormat.value === 'code' ? code : json;
}

function sampleImageToBlocks(image, res, threshold, colorMode, singleColor, duration) {
  const off = document.createElement('canvas');
  off.width = image.width;
  off.height = image.height;
  const octx = off.getContext('2d');
  octx.drawImage(image, 0, 0);

  const imageData = octx.getImageData(0, 0, image.width, image.height);
  const data = imageData.data;

  const stepX = image.width / res;
  const stepY = image.height / res;

  const blocks = [];

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

      blocks.push({
        id: `${gx},${gy}`,
        gx,
        gy,
        x: gx / (res - 1),
        y: gy / (res - 1),
        color,
        size: blockSize,
        opacity: a / 255,
        time: duration,
      });
    }
  }

  return blocks;
}

async function sampleVideoToBlocks(video, res, threshold, colorMode, singleColor, duration, fps) {
  const blocks = [];
  const vid = video;

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

    await seekAndDrawFrame(vid, t, off, octx, res, res);

    const imageData = octx.getImageData(0, 0, res, res);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];

      if (a < threshold) continue;

      const gx = ((i / 4) % res);
      const gy = Math.floor((i / 4) / res);

      let color;
      if (colorMode === 'single') {
        color = singleColor;
      } else if (colorMode === 'grayscale') {
        const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        color = `rgb(${gray},${gray},${gray})`;
      } else {
        color = `rgb(${r},${g},${b})`;
      }

      blocks.push({
        id: `${gx},${gy},${t.toFixed(3)}`,
        gx,
        gy,
        x: gx / (res - 1),
        y: gy / (res - 1),
        color,
        size: blockSize,
        opacity: a / 255,
        time: t,
      });
    }
  }

  return blocks;
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

function drawBlockPreview(blocks, blockSize, gap, totalTime) {
  const canvas = blockCanvas;
  const ctx = canvas.getContext('2d');

  const size = 400;
  canvas.width = size;
  canvas.height = size;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = '#0b0c10';
  ctx.fillRect(0, 0, size, size);

  const res = Math.ceil(Math.sqrt(blocks.length)) || 32;
  const tileSize = (size - (res - 1) * gap) / res;
  const stride = tileSize + gap;

  const previewTime = totalTime / 2;

  blocks.forEach(b => {
    if (mediaType === 'video' && Math.abs(b.time - previewTime) > 0.5) return;

    const px = Math.round(b.gx * stride);
    const py = Math.round(b.gy * stride);

    ctx.globalAlpha = b.opacity;
    ctx.fillStyle = b.color;
    ctx.fillRect(px, py, tileSize, tileSize);
    ctx.globalAlpha = 1.0;
  });
}

// ---- Build JJS slot structure ----

function buildMoveset(blocks, res, blockSize, gap, threshold, colorMode, singleColor, mediaType, duration) {
  const slots = [];

  const timeGroups = new Map();
  blocks.forEach(b => {
    const key = b.time.toFixed(3);
    if (!timeGroups.has(key)) timeGroups.set(key, []);
    timeGroups.get(key).push(b);
  });

  const line = [];
  let eventId = 0;

  timeGroups.forEach((group, timeKey) => {
    const time = parseFloat(timeKey);
    group.forEach(b => {
      line.push({
        K_NAME: 'HITBOX',
        PREVIEW: [0, 0.1],
        DAMAGE: 1,
        STUN_ANIM: true,
        HIT_USER: false,
        BLOCKABLE: false,
        SINGLE_TARGET: false,
        SIZE: `${blockSize}, ${blockSize}, ${blockSize}`,
        COLOR: b.color.replace('rgb(', '').replace(')', ''),
        POSITION: `${b.x.toFixed(3)}, ${b.y.toFixed(3)}, 0`,
        ROTATION: '0, 0, 0',
        TIME: Math.round(time * 1000) / 1000,
        ID: `b${eventId++}`,
      });
    });
  });

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
      blockSize,
      gap,
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

  if (!zstdReady) {
    alert('zstd library not ready yet. Please wait a moment.');
    return;
  }

  try {
    const decoded = await decodeCode(code);
    exportFormat.value = 'json';
    output.value = JSON.stringify({ slots: decoded }, null, 2);
    output.scrollTop = 0;
  } catch (e) {
    alert('Failed to decode code: ' + e.message);
  }
}
