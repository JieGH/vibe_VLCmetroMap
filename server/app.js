// Production server for self-hosting: serves the built app from dist/ with
// compression and caching, and proxies exactly one route to FGV. Zero
// dependencies, Node built-ins only. See docs/adr/0005 for why the proxy exists.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { createPrevisionClient } from './prevision.js';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/geo+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.pmtiles': 'application/vnd.pmtiles',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.geojson', '.svg', '.webmanifest']);
const IMMUTABLE = 'public, max-age=31536000, immutable';
const STATION_ROUTE = /^\/api\/metro\/horarios-prevision-3\/(\d+)$/;

function walk(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    // Follow symlinks: public/basemap is one in a development checkout.
    const isDir = entry.isDirectory() || (entry.isSymbolicLink() && fs.statSync(full).isDirectory());
    return isDir ? walk(full, rel) : [{ rel, full }];
  });
}

const tag = (parts) => `"${crypto.createHash('sha1').update(parts).digest('base64url').slice(0, 22)}"`;

// Reads dist/ once. Text files are held in memory as identity, brotli and gzip;
// everything else (the 36 MB PMTiles archive) is streamed from disk.
function loadAssets(root) {
  const assets = new Map();
  for (const { rel, full } of walk(root)) {
    const ext = path.extname(rel).toLowerCase();
    const stat = fs.statSync(full);
    const asset = {
      full,
      size: stat.size,
      type: TYPES[ext] || 'application/octet-stream',
      cacheControl: /^assets\/.+-[\w-]{8,}\.\w+$/.test(rel) ? IMMUTABLE : 'no-cache',
      variants: null,
    };
    if (COMPRESSIBLE.has(ext)) {
      const raw = fs.readFileSync(full);
      const variants = { identity: { body: raw, etag: tag(raw) } };
      const br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
      const gz = zlib.gzipSync(raw, { level: 9 });
      if (br.length < raw.length) variants.br = { body: br, etag: tag(`br${variants.identity.etag}`) };
      if (gz.length < raw.length) variants.gzip = { body: gz, etag: tag(`gzip${variants.identity.etag}`) };
      asset.variants = variants;
    } else {
      asset.etag = tag(`${rel}:${stat.size}:${stat.mtimeMs}`);
    }
    assets.set(rel, asset);
  }
  return assets;
}

const matches = (header, etag) =>
  header && header.split(',').some(t => t.trim().replace(/^W\//, '') === etag || t.trim() === '*');

// Single "bytes=a-b" range. Returns {start,end}, 'unsatisfiable', or null to
// ignore the header (malformed or multi-range: answer 200 with the whole file).
function parseRange(header, size) {
  const m = /^bytes=(\d*)-(\d*)$/.exec((header || '').trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let start, end;
  if (m[1] === '') {
    const n = Number(m[2]);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(size - n, 0);
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start >= size || start > end ? 'unsatisfiable' : { start, end };
}

const sendText = (res, status, body, type = 'application/json') => {
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(body);
};

export function createApp({ root, fetch, now } = {}) {
  const assets = loadAssets(root);
  const getPrevision = createPrevisionClient({ fetch, now });

  async function proxyPrevision(req, res, stationId) {
    if (req.method !== 'GET') return sendText(res, 405, '{"error":"method not allowed"}');
    const upstream = await getPrevision(stationId);
    // FGV's own Cache-Control is contradictory, and the client must never reuse a stale answer.
    res.writeHead(upstream.status, {
      'Content-Type': upstream.contentType,
      'Content-Length': Buffer.byteLength(upstream.body),
      'Cache-Control': 'no-store',
    });
    res.end(upstream.body);
  }

  function serveAsset(req, res, asset, acceptEncoding) {
    const head = req.method === 'HEAD';
    const base = { 'Content-Type': asset.type, 'Cache-Control': asset.cacheControl, 'Accept-Ranges': 'bytes' };

    if (asset.variants) {
      const enc = /\bbr\b/.test(acceptEncoding) && asset.variants.br ? 'br'
        : /\bgzip\b/.test(acceptEncoding) && asset.variants.gzip ? 'gzip' : 'identity';
      const { body, etag } = asset.variants[enc];
      const headers = { ...base, ETag: etag, Vary: 'Accept-Encoding' };
      delete headers['Accept-Ranges'];
      if (enc !== 'identity') headers['Content-Encoding'] = enc;
      if (matches(req.headers['if-none-match'], etag)) {
        res.writeHead(304, headers);
        return res.end();
      }
      res.writeHead(200, { ...headers, 'Content-Length': body.length });
      return res.end(head ? undefined : body);
    }

    const headers = { ...base, ETag: asset.etag };
    if (matches(req.headers['if-none-match'], asset.etag)) {
      res.writeHead(304, headers);
      return res.end();
    }
    const range = parseRange(req.headers.range, asset.size);
    if (range === 'unsatisfiable') {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${asset.size}` });
      return res.end();
    }
    const { start, end } = range || { start: 0, end: asset.size - 1 };
    res.writeHead(range ? 206 : 200, {
      ...headers,
      'Content-Length': end - start + 1,
      ...(range && { 'Content-Range': `bytes ${start}-${end}/${asset.size}` }),
    });
    if (head || asset.size === 0) return res.end();
    fs.createReadStream(asset.full, { start, end }).on('error', () => res.destroy()).pipe(res);
  }

  function handler(req, res) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      return sendText(res, 400, '{"error":"bad request"}');
    }
    if (pathname.includes('\0') || pathname.includes('\\') || pathname.split('/').includes('..')) {
      return sendText(res, 400, '{"error":"bad path"}');
    }

    if (pathname.startsWith('/api/')) {
      const id = STATION_ROUTE.exec(pathname)?.[1];
      if (!id) return sendText(res, 404, '{"error":"not found"}');
      return void proxyPrevision(req, res, id);
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return sendText(res, 405, '{"error":"method not allowed"}');
    }
    const rel = pathname.replace(/^\/+/, '') || 'index.html';
    let asset = assets.get(rel);
    // Unknown paths fall back to the app shell only for page navigations,
    // never for a missing script or image, which must stay a 404.
    if (!asset && !path.extname(rel) && (req.headers.accept || '').includes('text/html')) asset = assets.get('index.html');
    if (!asset) return sendText(res, 404, '{"error":"not found"}');
    serveAsset(req, res, asset, req.headers['accept-encoding'] || '');
  }

  return { handler, server: () => http.createServer(handler) };
}
