const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { constants } = require('zlib');

const PORT = 8765;
const PUBLIC_DIR = path.join(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

// zstd compression params matching JJS format: level 19, content size on, checksum off
const ZSTD_PARAMS = {
  [constants.ZSTD_c_compressionLevel]: 19,
  [constants.ZSTD_c_checksumFlag]: 0,
  [constants.ZSTD_c_contentSizeFlag]: 1,
};

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Server error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

function encodeCode(slots) {
  // Each slot's DATA must be a JSON string (double-encoded)
  const encodeSlots = slots.map(s => ({
    ...s,
    DATA: typeof s.DATA === 'string' ? s.DATA : JSON.stringify(s.DATA),
  }));
  const json = JSON.stringify(encodeSlots, { separators: [',', ':'] });
  const compressed = zlib.zstdCompressSync(
    Buffer.from(json, 'utf8'),
    { params: ZSTD_PARAMS, pledgedSrcSize: json.length }
  );
  return compressed.toString('base64');
}

function decodeCode(code) {
  let b64 = code.trim();
  if (b64.startsWith('jjs:')) b64 = b64.slice(4);
  const compressed = Buffer.from(b64, 'base64');
  const data = zlib.zstdDecompressSync(compressed);
  const slots = JSON.parse(data.toString('utf8'));
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

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: encode slots to JJS code
  if (url.pathname === '/api/encode' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { slots } = JSON.parse(body);
        if (!Array.isArray(slots)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'slots must be an array' }));
          return;
        }
        const code = encodeCode(slots);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // API: decode JJS code to slots
  if (url.pathname === '/api/decode' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try {
        const { code } = JSON.parse(body);
        if (!code) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'code is required' }));
          return;
        }
        const slots = decodeCode(code);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ slots }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // Static file serving
  let filePath = path.join(PUBLIC_DIR, url.pathname === '/' ? '/index.html' : url.pathname);
  serveFile(res, filePath);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`JJS converter server running at http://0.0.0.0:${PORT}`);
});
