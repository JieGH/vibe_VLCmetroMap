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

function listFiles(dir, base = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    // Follow symlinks: public/basemap is one in a development checkout.
    const isDir = entry.isDirectory() || (entry.isSymbolicLink() && fs.statSync(full).isDirectory());
    return isDir ? listFiles(full, rel) : [{ rel, full }];
  });
}

const etagOf = (parts) => `"${crypto.createHash('sha1').update(parts).digest('base64url').slice(0, 22)}"`;

// Reads dist/ once. Text files are held in memory as identity, brotli and gzip;
// everything else (the 36 MB PMTiles archive) is streamed from disk.
function loadAssets(root) {
  const assets = new Map();
  for (const { rel, full } of listFiles(root)) {
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
      const variants = { identity: { body: raw, etag: etagOf(raw) } };
      const br = zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
      const gz = zlib.gzipSync(raw, { level: 9 });
      if (br.length < raw.length) variants.br = { body: br, etag: etagOf(`br${variants.identity.etag}`) };
      if (gz.length < raw.length) variants.gzip = { body: gz, etag: etagOf(`gzip${variants.identity.etag}`) };
      asset.variants = variants;
    } else {
      asset.etag = etagOf(`${rel}:${stat.size}:${stat.mtimeMs}`);
    }
    assets.set(rel, asset);
  }
  return assets;
}

const etagMatches = (header, etag) =>
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

export function createApp({ root, fetch, now = () => Date.now() } = {}) {
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
      // How long ago FGV answered: the client anchors Target Arrival Timestamps on it.
      ...(upstream.status === 200 && { 'X-Prevision-Age-Ms': Math.max(0, Math.round(now() - upstream.fetchedAt)) }),
    });
    res.end(upstream.body);
  }

  function handleFeedback(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendText(res, 405, '{"error":"method not allowed"}');
    }
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 64 * 1024) req.destroy();
    });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        if (!payload.message || typeof payload.message !== 'string' || !payload.message.trim()) {
          return sendText(res, 400, '{"error":"message is required"}');
        }

        const cleanMsg = payload.message.trim().slice(0, 1000);
        const timestamp = new Date().toISOString();

        const forwarded = req.headers['x-forwarded-for'];
        const clientIp =
          req.headers['cf-connecting-ip'] ||
          req.headers['x-real-ip'] ||
          (forwarded ? String(forwarded).split(',')[0].trim() : null) ||
          req.socket?.remoteAddress ||
          'Local';
        const country = req.headers['cf-ipcountry'] || req.headers['x-country'] || null;
        const city = req.headers['cf-ipcity'] || null;
        const geoParts = [city, country].filter(Boolean);
        const geoStr = geoParts.length > 0 ? ` (${geoParts.join(', ')})` : '';

        console.log('\n================== [FEEDBACK RECEIVED] ==================');
        console.log(`Time:     ${timestamp}`);
        console.log(`IP:       ${clientIp}${geoStr}`);
        console.log(`Message:  ${cleanMsg}`);
        if (payload.email) console.log(`Email:    ${payload.email}`);
        if (payload.metadata) console.log(`Metadata: ${JSON.stringify(payload.metadata)}`);
        console.log('=========================================================\n');

        try {
          const entry = JSON.stringify({
            timestamp,
            ip: clientIp,
            geo: geoParts.length ? geoParts.join(', ') : null,
            message: cleanMsg,
            email: payload.email || null,
            metadata: payload.metadata || null,
          }) + '\n';
          fs.appendFileSync(path.resolve('feedback.log.jsonl'), entry, 'utf-8');
        } catch {
          // Fallback if read-only filesystem
        }

        // Never fire real external notifications during tests
        if (process.env.NODE_ENV === 'test' || process.env.VITEST) {
          return void res.end(JSON.stringify({ success: true, message: 'Feedback received', clientIp }));
        }

        const token = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID || '5007040501';
        if (token && chatId && typeof globalThis.fetch === 'function') {
          const esc = (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '');
          const safeMsg = esc(cleanMsg);
          const safeEmail = esc(payload.email || '');
          const metadata = payload.metadata;
          const versionStr = metadata?.appVersion
            ? `v${metadata.appVersion}${metadata.gitSha ? ` (${metadata.gitSha})` : ''}`
            : '';

          const lines = [
            `📬 <b>New Feedback on Xarxa</b>\n`,
            `💬 <b>Message:</b>`,
            `${safeMsg}\n`,
            `👤 <b>User & Device Info:</b>`,
            `• <b>IP:</b> <code>${esc(clientIp)}</code>${geoStr}`,
          ];
          if (metadata?.platform) lines.push(`• <b>Platform:</b> ${esc(metadata.platform)}`);
          if (metadata?.device && metadata.device !== 'Unknown') lines.push(`• <b>Device:</b> ${esc(metadata.device)}`);
          if (metadata?.screen) lines.push(`• <b>Screen:</b> <code>${esc(metadata.screen)}</code>`);
          if (metadata?.timezone) lines.push(`• <b>Timezone:</b> <code>${esc(metadata.timezone)}</code>`);
          if (metadata?.language) lines.push(`• <b>Language:</b> <code>${esc(metadata.language)}</code>`);
          if (versionStr) lines.push(`• <b>Version:</b> <code>${esc(versionStr)}</code>`);
          if (safeEmail) lines.push(`• <b>Contact:</b> <code>${safeEmail}</code>`);
          lines.push(`⏱ <b>Time:</b> <code>${esc(timestamp)}</code>`);

          const text = lines.join('\n');
          globalThis.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
          }).catch(() => {});
        }

        return sendText(res, 200, JSON.stringify({
          success: true,
          message: 'Feedback received',
          receivedMessage: cleanMsg,
          clientIp,
        }));
      } catch {
        return sendText(res, 400, '{"error":"invalid json"}');
      }
    });
  }

  const recentVisits = new Map();
  const recentStationVisits = new Map();
  const DEDUPE_WINDOW_MS = 60 * 60 * 1000;
  const STATION_DEDUPE_MS = 10 * 60 * 1000;
  const BOT_UA_REGEX = /(bot|spider|crawl|slurp|mediapartners|googlebot|bingbot|yandex|duckduckbot|baiduspider|sogou|exabot|facebot|ia_archiver|semrush|ahrefs|mj12bot|dotbot|petalbot|headlesschrome|phantomjs|selenium|puppeteer|playwright|cypress|python|curl|wget|httpclient|postman|go-http|java|zgrab|censys|shodan|nmap)/i;

  function handleTelemetry(req, res) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return sendText(res, 405, '{"error":"method not allowed"}');
    }

    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 50000) req.destroy();
    });

    req.on('end', () => {
      try {
        const payload = JSON.parse(raw);
        const userAgent = payload?.userAgent || req.headers['user-agent'] || '';

        // Bot filter
        if (BOT_UA_REGEX.test(userAgent)) {
          return sendText(res, 200, '{"ok":true,"filtered":"bot"}');
        }

        const clientIp = getClientIp(req);

        // Developer / author filter (IP & fingerprint)
        const screen = String(payload?.screen || '');
        const tz = String(payload?.timezone || '');
        const lang = String(payload?.language || payload?.languages || '');
        const isDev = payload?.isDev ||
          clientIp === '79.117.186.128' ||
          clientIp.startsWith('79.117.186.') ||
          (screen.includes('440x956') && tz === 'Europe/Madrid' && lang.includes('en-GB'));

        if (isDev) {
          return sendText(res, 200, '{"ok":true,"filtered":"dev"}');
        }
        const now = Date.now();
        const esc = (s) => (s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : '');
        const timestamp = new Date().toISOString();

        if (payload?.type === 'station_access') {
          const stationKey = `${clientIp}:${payload?.station}`;
          const lastSt = recentStationVisits.get(stationKey);
          if (lastSt && now - lastSt < STATION_DEDUPE_MS) {
            return sendText(res, 200, '{"ok":true,"throttled":true}');
          }
          recentStationVisits.set(stationKey, now);

          if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
            const token = process.env.TELEGRAM_BOT_TOKEN;
            const chatId = process.env.TELEGRAM_CHAT_ID || '5007040501';

            if (token && chatId) {
              const text = [
                `🚉 <b>Station Accessed by User</b>\n`,
                `📍 <b>Station:</b> <b>${esc(payload.station)}</b>`,
                payload.lines && Array.isArray(payload.lines) && payload.lines.length > 0 ? `🚇 <b>Lines:</b> ${esc(payload.lines.join(', '))}` : '',
                payload.zone ? `🏷 <b>Zone:</b> ${esc(payload.zone)}` : '',
                `👤 <b>User IP:</b> <code>${esc(clientIp)}</code>`,
                payload.platform ? `📱 <b>Platform:</b> ${esc(payload.platform)}` : '',
                `⏱ <b>Time:</b> <code>${esc(timestamp)}</code>`,
              ].filter(Boolean).join('\n');

              globalThis.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
              }).catch(() => {});
            }
          }
          return sendText(res, 200, '{"ok":true}');
        }

        const lastSeen = recentVisits.get(clientIp);

        if (payload?.type !== 'incident' && lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) {
          return sendText(res, 200, '{"ok":true,"throttled":true}');
        }
        if (payload?.type !== 'incident') {
          recentVisits.set(clientIp, now);
        }

        if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
          const token = process.env.TELEGRAM_BOT_TOKEN;
          const chatId = process.env.TELEGRAM_CHAT_ID || '5007040501';

          if (token && chatId) {
            let text = '';
            if (payload?.type === 'incident') {
              text = [
                `🚨 <b>MAJOR INCIDENT REPORT - Xarxa Web</b>\n`,
                `⚠️ <b>Error:</b> <code>${esc(payload.error)}</code>`,
                `📍 <b>Source:</b> <code>${esc(payload.source)}</code>`,
                `🔗 <b>URL:</b> <code>${esc(payload.url)}</code>`,
                `👤 <b>Client IP:</b> <code>${esc(clientIp)}</code>`,
                `📱 <b>User-Agent:</b> <code>${esc((payload.userAgent || '').slice(0, 150))}</code>`,
                payload.stack ? `\n📄 <b>Stack Trace:</b>\n<pre>${esc(payload.stack.slice(0, 800))}</pre>` : '',
                `⏱ <b>Time:</b> <code>${esc(timestamp)}</code>`,
              ].filter(Boolean).join('\n');
            } else {
              text = [
                `👤 <b>Normal User Visit Detected</b>\n`,
                `📍 <b>Location & IP:</b> <code>${esc(clientIp)}</code>`,
                payload.station ? `🚉 <b>Station Accessed:</b> <b>${esc(payload.station)}</b>` : `🚉 <b>Station Accessed:</b> <i>(Browsing Map)</i>`,
                payload.platform ? `📱 <b>Platform:</b> ${esc(payload.platform)}` : '',
                payload.screen ? `🖥 <b>Screen:</b> <code>${esc(payload.screen)}</code>` : '',
                payload.languages || payload.language ? `🗣 <b>Language:</b> <code>${esc(payload.languages || payload.language)}</code>` : '',
                payload.timezone ? `🕒 <b>Timezone:</b> <code>${esc(payload.timezone)}</code>` : '',
                payload.referrer && payload.referrer !== 'Direct' ? `🔗 <b>Referrer:</b> ${esc(payload.referrer)}` : '',
                payload.path ? `🧭 <b>Path / Mode:</b> <code>${esc(payload.path)}</code>` : '',
                `⏱ <b>Time:</b> <code>${esc(timestamp)}</code>`,
              ].filter(Boolean).join('\n');
            }

            globalThis.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
            }).catch(() => {});
          }
        }

        return sendText(res, 200, '{"ok":true}');
      } catch {
        return sendText(res, 400, '{"error":"invalid json"}');
      }
    });
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
      if (etagMatches(req.headers['if-none-match'], etag)) {
        res.writeHead(304, headers);
        return res.end();
      }
      res.writeHead(200, { ...headers, 'Content-Length': body.length });
      return res.end(head ? undefined : body);
    }

    const headers = { ...base, ETag: asset.etag };
    if (etagMatches(req.headers['if-none-match'], asset.etag)) {
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
      if (pathname === '/api/feedback') {
        return void handleFeedback(req, res);
      }
      if (pathname === '/api/telemetry') {
        return void handleTelemetry(req, res);
      }
      const id = STATION_ROUTE.exec(pathname)?.[1];
      if (!id) return sendText(res, 404, '{"error":"not found"}');
      return void proxyPrevision(req, res, id).catch(() => {
        if (res.headersSent) res.destroy();
        else sendText(res, 502, '{"error":"proxy failed"}');
      });
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

  return { server: () => http.createServer(handler) };
}
