// Netlify & Cloudflare Workers serverless function for receiving normal user access telemetry
// and reporting major runtime incidents to Telegram, while filtering out automated bots and crawlers.
import { escapeHtml, extractClientInfo } from './feedback.js';

export const BOT_UA_REGEX = /(bot|spider|crawl|slurp|mediapartners|googlebot|bingbot|yandex|duckduckbot|baiduspider|sogou|exabot|facebot|ia_archiver|semrush|ahrefs|mj12bot|dotbot|petalbot|headlesschrome|phantomjs|selenium|puppeteer|playwright|cypress|python|curl|wget|httpclient|postman|go-http|java|zgrab|censys|shodan|nmap)/i;

// In-memory rate limiting / IP deduplication so user's Telegram isn't spammed
// by rapid reloads from the same human IP (1 notification per IP per hour)
const recentVisits = new Map();
const recentStationVisits = new Map();
const DEDUPE_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const STATION_DEDUPE_MS = 10 * 60 * 1000; // 10 minutes per IP:station

function isRateLimited(ip) {
  if (!ip || ip === 'Unknown') return false;
  const now = Date.now();

  // Clean old entries if map grows
  if (recentVisits.size > 500) {
    for (const [key, timestamp] of recentVisits.entries()) {
      if (now - timestamp > DEDUPE_WINDOW_MS) {
        recentVisits.delete(key);
      }
    }
  }

  const lastSeen = recentVisits.get(ip);
  if (lastSeen && now - lastSeen < DEDUPE_WINDOW_MS) {
    return true;
  }
  recentVisits.set(ip, now);
  return false;
}

function isStationRateLimited(key) {
  if (!key || key.startsWith('Unknown:')) return false;
  const now = Date.now();

  if (recentStationVisits.size > 500) {
    for (const [k, timestamp] of recentStationVisits.entries()) {
      if (now - timestamp > STATION_DEDUPE_MS) {
        recentStationVisits.delete(k);
      }
    }
  }

  const lastSeen = recentStationVisits.get(key);
  if (lastSeen && now - lastSeen < STATION_DEDUPE_MS) {
    return true;
  }
  recentStationVisits.set(key, now);
  return false;
}

export function isBot(userAgent) {
  if (!userAgent || typeof userAgent !== 'string') return true;
  return BOT_UA_REGEX.test(userAgent);
}

export const DEV_IPS = new Set([
  '79.117.186.128',
  '127.0.0.1',
  '::1',
]);

export function isDevRequest(clientInfo, data) {
  const ip = clientInfo?.ip || '';
  if (DEV_IPS.has(ip) || ip.startsWith('79.117.186.')) {
    return true;
  }
  if (data?.isDev) {
    return true;
  }
  // Author dev fingerprint: iPhone 440x956 (dpr: 3) + Europe/Madrid + en-GB
  const screen = String(data?.screen || '');
  const tz = String(data?.timezone || '');
  const lang = String(data?.language || data?.languages || '');
  if (screen.includes('440x956') && tz === 'Europe/Madrid' && lang.includes('en-GB')) {
    return true;
  }
  return false;
}

export function formatVisitTelegramMessage({ clientInfo, data, timestamp }) {
  const geoParts = [clientInfo?.city, clientInfo?.region, clientInfo?.country].filter(Boolean);
  const geoStr = geoParts.length > 0 ? ` (${escapeHtml(geoParts.join(', '))})` : '';
  const ipStr = clientInfo?.ip ? `<code>${escapeHtml(clientInfo.ip)}</code>${geoStr}` : '<code>Unknown</code>';

  const lines = [
    `👤 <b>Normal User Visit Detected</b>\n`,
    `📍 <b>Location & IP:</b> ${ipStr}`,
  ];

  if (data?.station) {
    lines.push(`🚉 <b>Station Accessed:</b> <b>${escapeHtml(data.station)}</b>`);
  } else {
    lines.push(`🚉 <b>Station Accessed:</b> <i>(Browsing Map)</i>`);
  }

  if (data?.platform) {
    lines.push(`📱 <b>Platform:</b> ${escapeHtml(data.platform)}`);
  }
  if (data?.screen) {
    lines.push(`🖥 <b>Screen:</b> <code>${escapeHtml(data.screen)}</code>`);
  }
  if (data?.language || data?.languages) {
    lines.push(`🗣 <b>Language:</b> <code>${escapeHtml(data.languages || data.language)}</code>`);
  }
  if (data?.timezone) {
    lines.push(`🕒 <b>Timezone:</b> <code>${escapeHtml(data.timezone)}</code>`);
  }
  if (data?.referrer && data.referrer !== 'Direct') {
    lines.push(`🔗 <b>Referrer:</b> ${escapeHtml(data.referrer)}`);
  }
  if (data?.path) {
    lines.push(`🧭 <b>Path / Mode:</b> <code>${escapeHtml(data.path)}</code>`);
  }
  lines.push(`⏱ <b>Time:</b> <code>${escapeHtml(timestamp)}</code>`);

  return lines.join('\n');
}

export function formatStationAccessTelegramMessage({ clientInfo, data, timestamp }) {
  const geoParts = [clientInfo?.city, clientInfo?.region, clientInfo?.country].filter(Boolean);
  const geoStr = geoParts.length > 0 ? ` (${escapeHtml(geoParts.join(', '))})` : '';
  const ipStr = clientInfo?.ip ? `<code>${escapeHtml(clientInfo.ip)}</code>${geoStr}` : '<code>Unknown</code>';

  const lines = [
    `🚉 <b>Station Accessed by User</b>\n`,
    `📍 <b>Station:</b> <b>${escapeHtml(data?.station || 'Unknown')}</b>`,
  ];

  if (data?.lines && Array.isArray(data.lines) && data.lines.length > 0) {
    lines.push(`🚇 <b>Lines:</b> ${escapeHtml(data.lines.join(', '))}`);
  }
  if (data?.zone) {
    lines.push(`🏷 <b>Zone:</b> ${escapeHtml(data.zone)}`);
  }
  lines.push(`👤 <b>User:</b> ${ipStr}`);
  if (data?.platform) {
    lines.push(`📱 <b>Platform:</b> ${escapeHtml(data.platform)}`);
  }
  lines.push(`⏱ <b>Time:</b> <code>${escapeHtml(timestamp)}</code>`);

  return lines.join('\n');
}

export function formatIncidentTelegramMessage({ clientInfo, data, timestamp }) {
  const geoParts = [clientInfo?.city, clientInfo?.region, clientInfo?.country].filter(Boolean);
  const geoStr = geoParts.length > 0 ? ` (${escapeHtml(geoParts.join(', '))})` : '';
  const ipStr = clientInfo?.ip ? `<code>${escapeHtml(clientInfo.ip)}</code>${geoStr}` : '<code>Unknown</code>';

  const lines = [
    `🚨 <b>MAJOR INCIDENT REPORT - Xarxa Web</b>\n`,
    `⚠️ <b>Error:</b> <code>${escapeHtml(data?.error || 'Unknown runtime error')}</code>`,
  ];

  if (data?.source) {
    lines.push(`📍 <b>Source:</b> <code>${escapeHtml(data.source)}</code>`);
  }
  if (data?.url) {
    lines.push(`🔗 <b>URL:</b> <code>${escapeHtml(data.url)}</code>`);
  }
  lines.push(`👤 <b>Client:</b> ${ipStr}`);
  if (data?.userAgent) {
    lines.push(`📱 <b>User-Agent:</b> <code>${escapeHtml(data.userAgent.slice(0, 150))}</code>`);
  }
  if (data?.stack) {
    lines.push(`\n📄 <b>Stack Trace:</b>\n<pre>${escapeHtml(data.stack.slice(0, 800))}</pre>`);
  }
  lines.push(`⏱ <b>Time:</b> <code>${escapeHtml(timestamp)}</code>`);

  return lines.join('\n');
}

const TROUBLE_APIS = { bus: 'EMT bus (SAE)', train: 'FGV metro' };
const TROUBLE_KINDS = new Set(['blocked', 'rate-limited', 'server-error', 'unreachable']);
const TROUBLE_REPEAT_MS = 10 * 60 * 1000;
const recentTrouble = new Map();

const count = (n) => (Number.isFinite(Number(n)) ? Math.max(0, Math.min(Math.trunc(Number(n)), 100000)) : '?');

/** One alert per API and kind per 10 minutes (per server instance), so a block does not flood the chat. */
export function isTroubleThrottled(key, now = Date.now()) {
  if (recentTrouble.size > 100) {
    for (const [k, at] of recentTrouble.entries()) if (now - at > TROUBLE_REPEAT_MS) recentTrouble.delete(k);
  }
  const last = recentTrouble.get(key);
  if (last !== undefined && now - last < TROUBLE_REPEAT_MS) return true;
  recentTrouble.set(key, now);
  return false;
}

export function formatApiTroubleTelegramMessage({ clientInfo, data, timestamp }) {
  const name = TROUBLE_APIS[data?.api] || 'Unknown API';
  const geoParts = [clientInfo?.city, clientInfo?.region, clientInfo?.country].filter(Boolean);
  const geoStr = geoParts.length > 0 ? ` (${escapeHtml(geoParts.join(', '))})` : '';
  const ipStr = clientInfo?.ip ? `<code>${escapeHtml(clientInfo.ip)}</code>${geoStr}` : '<code>Unknown</code>';

  if (data?.recovered) {
    const secs = Math.round(Number(data.downForMs) / 1000);
    return [
      `✅ <b>${escapeHtml(name)} is answering again</b>\n`,
      Number.isFinite(secs) ? `⏳ <b>Trouble lasted:</b> ~${secs} s` : null,
      `👤 <b>Client:</b> ${ipStr}`,
      `⏱ <b>Time:</b> <code>${escapeHtml(timestamp)}</code>`,
    ].filter(Boolean).join('\n');
  }

  const kind = TROUBLE_KINDS.has(data?.kind) ? data.kind : 'unknown';
  const status = data?.status ? ` (HTTP ${count(data.status)})` : '';
  const verdict = kind === 'blocked'
    ? 'REFUSED this client (blocked / decoy page)'
    : kind === 'rate-limited' ? 'RATE-LIMITED this client (HTTP 429)' : `failing: ${kind}`;
  const lines = [
    `🛑 <b>${escapeHtml(name)} ${verdict}</b>${status}\n`,
    `📉 <b>Failures in a row:</b> ${count(data?.failuresInARow)}`,
    `📈 <b>Requests from this client:</b> ${count(data?.requestsLast10s)} in 10 s, ${count(data?.requestsLast60s)} in 60 s`,
    `👤 <b>Client:</b> ${ipStr}`,
  ];
  if (data?.platform) lines.push(`📱 <b>Platform:</b> ${escapeHtml(String(data.platform).slice(0, 40))}`);
  lines.push(`⏱ <b>Time:</b> <code>${escapeHtml(timestamp)}</code>`);
  return lines.join('\n');
}

async function forwardTelegram(env, messageHtml) {
  if (
    (typeof process !== 'undefined' && (process.env?.NODE_ENV === 'test' || process.env?.VITEST)) ||
    env?.NODE_ENV === 'test'
  ) {
    return;
  }

  const token = env?.TELEGRAM_BOT_TOKEN || (typeof process !== 'undefined' && process.env?.TELEGRAM_BOT_TOKEN);
  const chatId = env?.TELEGRAM_CHAT_ID || (typeof process !== 'undefined' && process.env?.TELEGRAM_CHAT_ID) || '5007040501';

  if (!token || !chatId) return;

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: messageHtml,
        parse_mode: 'HTML',
      }),
    });
  } catch (err) {
    console.error('[Telegram notification failed]', err?.message || err);
  }
}

export default async (req, env) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Allow': 'POST' },
    });
  }

  try {
    const data = await req.json();
    const clientInfo = extractClientInfo(req);
    const userAgent = data?.userAgent || req.headers?.get?.('user-agent') || req.headers?.['user-agent'] || '';

    // Filter strange bots and automated crawlers
    if (isBot(userAgent)) {
      return new Response(JSON.stringify({ ok: true, filtered: 'bot' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // An API refusing a client is exactly what the owner tests from their own device, so these skip the dev filter.
    if (data?.type === 'api_trouble') {
      const timestamp = new Date().toISOString();
      const key = `${data?.api}:${data?.recovered ? 'recovered' : data?.kind}`;
      if (!TROUBLE_APIS[data?.api] || isTroubleThrottled(key)) {
        return new Response(JSON.stringify({ ok: true, throttled: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      await forwardTelegram(env, formatApiTroubleTelegramMessage({ clientInfo, data, timestamp }));
      return new Response(JSON.stringify({ ok: true, type: 'api_trouble' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Filter author / developer visits and test traffic
    if (isDevRequest(clientInfo, data)) {
      return new Response(JSON.stringify({ ok: true, filtered: 'dev' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const timestamp = new Date().toISOString();

    if (data?.type === 'incident') {
      const incidentHtml = formatIncidentTelegramMessage({ clientInfo, data, timestamp });
      await forwardTelegram(env, incidentHtml);
      return new Response(JSON.stringify({ ok: true, type: 'incident' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (data?.type === 'station_access') {
      const stationKey = `${clientInfo.ip}:${data?.station}`;
      if (isStationRateLimited(stationKey)) {
        return new Response(JSON.stringify({ ok: true, throttled: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const stHtml = formatStationAccessTelegramMessage({ clientInfo, data, timestamp });
      await forwardTelegram(env, stHtml);
      return new Response(JSON.stringify({ ok: true, type: 'station_access' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Normal user visit
    if (isRateLimited(clientInfo.ip)) {
      return new Response(JSON.stringify({ ok: true, throttled: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const visitHtml = formatVisitTelegramMessage({ clientInfo, data, timestamp });
    await forwardTelegram(env, visitHtml);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'bad request', details: err?.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
