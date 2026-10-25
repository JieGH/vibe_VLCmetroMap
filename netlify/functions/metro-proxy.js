// Replaces the dev-only Vite proxy (vite.config.js) in production. FGV's CORS
// policy admits only FGV's own sites, so the browser build reaches FGV's live
// feed through this same-origin route instead. See ADR-0005.
//
// FGV does not answer connections from Netlify's servers (observed
// 2026-10-20: every request ends in `fetch failed` after ~11 s, from a US
// datacenter, while the same URL answers in 0.4 s from Spain). So when FGV is
// unreachable the public website uses the relay the app used before ADR-0005,
// and reshapes its rows into FGV's shape so the app has one format to parse.
// The native app is unaffected: it calls FGV directly from the phone, and
// `npm run dev` proxies to FGV from a Spanish connection.
//
// METRO_SOURCE (a Netlify environment variable) picks what this function does:
//   relay (default)  the relay only. What the public website needs today.
//   auto             FGV first, the relay if FGV is unreachable. For a host
//                    that FGV does answer.
//   fgv              FGV only, no fallback.
const FGV_BASE = 'https://www.fgv.es/fgv/app/es/api/v1/V';
const RELAY_BASE = 'https://metroapi.alexbadi.es';
// The app abandons a request after 4 s, so FGV gets only part of that.
const FGV_TIMEOUT_MS = 1500;
const RELAY_TIMEOUT_MS = 2000;
// With METRO_SOURCE=fgv there is no fallback to wait for, so FGV gets the whole budget and a hedge: about 1 in 20
// requests to FGV never answer (ADR-0006), and a second attempt after 1200 ms catches that tail. The first answer wins.
const FGV_ONLY_DEADLINE_MS = 3500;
const FGV_ONLY_HEDGE_MS = 1200;
// After FGV fails, skip it for a while so only the first request pays the wait.
const FGV_RETRY_AFTER_MS = 5 * 60 * 1000;
const STATION_PATH = /^\/(?:horarios-prevision-3\/(\d+)|prevision\/(\d+)\/parse)$/;

const sourceMode = () => {
  const mode = process.env.METRO_SOURCE;
  return mode === 'auto' || mode === 'fgv' ? mode : 'relay';
};

let fgvBlockedUntil = 0;
export const resetFgvBlock = () => { fgvBlockedUntil = 0; };

const reply = (body, status, contentType) =>
  new Response(body, { status, headers: { 'Content-Type': contentType || 'application/json' } });

// The relay returns one flat row per train; FGV groups trains under each Line.
function regroupByLine(relayBody) {
  const lines = new Map();
  for (const row of relayBody.previsiones || []) {
    const line = String(row.line ?? row.line_id);
    if (!lines.has(line)) lines.set(line, { line, line_id: line, trains: [] });
    const train = { destino: row.destino, seconds: row.seconds, vehicle: row.vehicle };
    if (row.trainTimestamp !== undefined) train.trainTimestamp = row.trainTimestamp;
    lines.get(line).trains.push(train);
  }
  return { previsiones: [...lines.values()] };
}

async function viaRelay(stationId) {
  const upstream = await fetch(`${RELAY_BASE}/prevision/${stationId}/parse`, {
    headers: {
      // The relay requires a contact= User-Agent, which a browser cannot send.
      'User-Agent': 'vib-metro-valencia/1.0 (Web; contact=dev@example.com)',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
  });
  if (!upstream.ok) return reply(await upstream.text(), upstream.status, upstream.headers.get('content-type'));
  return reply(JSON.stringify(regroupByLine(await upstream.json())), 200);
}

// Runs `start()`, and a second copy of it if the first has not settled after `hedgeMs`. The first fulfilled answer
// wins; it rejects only when every attempt has.
function hedged(start, hedgeMs) {
  return new Promise((resolve, reject) => {
    let pending = 1;
    let settled = false;
    const onOk = (value) => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const onFail = (err) => { pending -= 1; if (pending === 0 && !settled) { clearTimeout(timer); reject(err); } };
    const timer = setTimeout(() => { if (!settled) { pending += 1; start().then(onOk, onFail); } }, hedgeMs);
    start().then(onOk, onFail);
  });
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/metro/, '');
  const match = path.match(STATION_PATH);
  const stationId = match?.[1] || match?.[2];

  // Only the per-station arrivals route is forwarded, and only as a read. Anything else would make this an open
  // relay to the rest of FGV's API (ADR-0006: "it cannot be turned into an open relay").
  if (req.method !== 'GET' && req.method !== 'HEAD') return reply(JSON.stringify({ error: 'Method not allowed' }), 405);
  if (!stationId) return reply(JSON.stringify({ error: 'Not found' }), 404);

  const mode = sourceMode();

  if (mode !== 'relay' && Date.now() >= fgvBlockedUntil) {
    try {
      const callFgv = (deadlineMs) => fetch(`${FGV_BASE}/horarios-prevision-3/${stationId}`, {
        method: req.method,
        headers: { 'Accept': req.headers.get('accept') || 'application/json' },
        signal: AbortSignal.timeout(deadlineMs),
      });
      const upstream = mode === 'fgv'
        ? await hedged(() => callFgv(FGV_ONLY_DEADLINE_MS), FGV_ONLY_HEDGE_MS)
        : await callFgv(FGV_TIMEOUT_MS);
      return reply(await upstream.text(), upstream.status, upstream.headers.get('content-type'));
    } catch {
      if (mode === 'fgv') return reply(JSON.stringify({ error: 'FGV unreachable' }), 502);
      fgvBlockedUntil = Date.now() + FGV_RETRY_AFTER_MS;
    }
  }

  try {
    return await viaRelay(stationId);
  } catch {
    return reply(JSON.stringify({ error: 'FGV and relay unreachable' }), 502);
  }
};

export const config = { path: '/api/metro/*' };
