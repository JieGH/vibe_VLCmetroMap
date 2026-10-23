// Reproducible latency measurements for the live map website.
//
// Every number it prints is taken against a server you name with --base, so a
// before/after comparison is only valid if both runs used the same host, the
// same port and the same mode flags. Measure against the machine's LAN address
// (http://192.168.x.x:4173), not localhost, so the network path is real.
//
// Usage:
//   node scripts/measure_latency.cjs proxy   --base URL [--rounds 3] [--out f.json]
//       GET {base}/api/metro/horarios-prevision-3/{id} for every Major Station
//       (the Strategic Hubs are the first four of them), --rounds times over.
//   node scripts/measure_latency.cjs fgv     [--rounds 3] [--out f.json]
//       The same requests straight to FGV, so the proxy's overhead is visible.
//   node scripts/measure_latency.cjs browser --base URL [--reps 3] [--stale] [--out f.json]
//       Headless Chromium: FCP/LCP, time until the style is ready, first
//       basemap tile, first live Vehicle, and the full first Network Sync.
//       Each rep is a cold load (fresh context) then a warm reload (same
//       context, so sessionStorage Arrival Memory survives). --stale adds a
//       reload after the memory has aged past its 60 s pause.
//   node scripts/measure_latency.cjs render  --base URL [--cpu 4] [--window 15] [--out f.json]
//       CPU-throttled steady-state render profile: main-thread time per
//       animation frame, long tasks, React commits, CDP task/script time.
//
// Request volume stays small on purpose: FGV is someone else's server. proxy
// and fgv send ~60 requests per run at concurrency 3; one browser rep sends ~20.
//
// The browser modes need Playwright. It is not a dependency of this repo: the
// script uses `playwright-core`/`playwright` if resolvable, else any copy in
// the npx cache (run `npx playwright --version` once to create one).

const fs = require('fs');
const os = require('os');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const live = require('../src/data/live_stations.json');

const FGV_PREVISION_URL = 'https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3';
// The app abandons an attempt after 4 s (arrivalStore.js); a request with no
// answer by then is what this script calls a hang.
const HANG_MS = 4000;
const CONCURRENCY = 3;
const SYNC_TIMEOUT_MS = 90000;

// Major Stations already include the Strategic Hubs; dedupe defensively.
const STATIONS = [...new Map([...live.strategicHubs, ...live.majorStations].map(s => [s.id, s])).values()];
const MAJOR_IDS = live.majorStations.map(s => s.id);

// ── CLI ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  const opts = { mode, rounds: 3, reps: 3, cpu: 4, window: 15, stale: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--stale') opts.stale = true;
    else if (a === '--base') opts.base = rest[++i].replace(/\/$/, '');
    else if (a === '--out') opts.out = rest[++i];
    else if (['--rounds', '--reps', '--cpu', '--window'].includes(a)) opts[a.slice(2)] = Number(rest[++i]);
    else throw new Error(`Unknown argument ${a}`);
  }
  return opts;
}

// ── Statistics ───────────────────────────────────────────────────────────────

function pct(sorted, p) {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function summarise(values) {
  const s = values.filter(v => v !== null && v !== undefined && Number.isFinite(v)).sort((a, b) => a - b);
  if (s.length === 0) return { n: 0 };
  const r = (v) => Math.round(v * 100) / 100;
  return {
    n: s.length, min: r(s[0]), p50: r(pct(s, 50)), p90: r(pct(s, 90)), p95: r(pct(s, 95)),
    p99: r(pct(s, 99)), max: r(s[s.length - 1]), mean: r(s.reduce((a, b) => a + b, 0) / s.length),
  };
}

const median = (values) => summarise(values).p50 ?? null;

// ── proxy / fgv ──────────────────────────────────────────────────────────────

async function timedGet(url) {
  const t0 = performance.now();
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(HANG_MS),
    });
    const body = await res.json().catch(() => null);
    const ms = performance.now() - t0;
    const ok = res.ok && body && Array.isArray(body.previsiones);
    return { ms, status: res.status, kind: ok ? 'ok' : 'error' };
  } catch (err) {
    const ms = performance.now() - t0;
    const timedOut = err && (err.name === 'TimeoutError' || err.name === 'AbortError');
    return { ms, status: null, kind: timedOut ? 'hang' : 'error', error: String(err.name || err) };
  }
}

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }));
  return results;
}

async function measureHttp(label, urlFor, rounds) {
  const samples = [];
  const startedAt = Date.now();
  for (let round = 1; round <= rounds; round++) {
    const done = await pool(STATIONS, CONCURRENCY, async (st) => ({ id: st.id, round, ...(await timedGet(urlFor(st.id))) }));
    samples.push(...done);
  }
  const answered = samples.filter(s => s.kind === 'ok').map(s => s.ms);
  const withHangs = samples.map(s => (s.kind === 'hang' ? HANG_MS : s.ms));
  const hangs = samples.filter(s => s.kind === 'hang').length;
  const errors = samples.filter(s => s.kind === 'error').length;
  return {
    mode: label,
    startedAt: new Date(startedAt).toISOString(),
    stations: STATIONS.length, rounds, requests: samples.length, concurrency: CONCURRENCY,
    hangThresholdMs: HANG_MS,
    answeredMs: summarise(answered),
    // Hangs counted at the threshold: what a caller waiting HANG_MS experiences.
    allWithHangsAtThresholdMs: summarise(withHangs),
    hangs, hangRate: hangs / samples.length,
    errors, errorRate: errors / samples.length,
    samples,
  };
}

// ── Playwright resolution ────────────────────────────────────────────────────

function loadPlaywright() {
  for (const name of ['playwright-core', 'playwright']) {
    try { return require(name); } catch { /* try the next */ }
  }
  const npx = path.join(os.homedir(), '.npm', '_npx');
  if (fs.existsSync(npx)) {
    for (const dir of fs.readdirSync(npx)) {
      for (const name of ['playwright-core', 'playwright']) {
        const p = path.join(npx, dir, 'node_modules', name);
        if (fs.existsSync(p)) return require(p);
      }
    }
  }
  throw new Error('Playwright not found. Run `npx playwright --version` once, or install playwright-core.');
}

const CHROMIUM_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

// Runs in the page before any app code. Everything is timed with
// performance.now(), i.e. relative to navigation start.
function initScript({ majorIds, withFrames, withReact }) {
  const P = (window.__perf = {
    fetches: [], fcp: null, lcp: null, styleAt: null, vehicleAt: null, fullSyncAt: null, freshSyncAt: null,
    hydratedIds: [], frames: [], longTasks: [], commits: [],
  });
  try {
    const mem = JSON.parse(sessionStorage.getItem('metrovalencia_arrival_memory') || '{}');
    P.hydratedIds = Object.keys(mem).map(Number);
  } catch { /* no memory */ }

  // fullSyncAt: every Major Station is known, from memory or the network.
  // freshSyncAt: every Major Station answered over the network in this load.
  const covered = new Set(P.hydratedIds);
  const answered = new Set();
  const checkFullSync = () => {
    if (P.fullSyncAt === null && majorIds.every(id => covered.has(id))) P.fullSyncAt = performance.now();
    if (P.freshSyncAt === null && majorIds.every(id => answered.has(id))) P.freshSyncAt = performance.now();
  };

  checkFullSync();

  const realFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const m = /\/api\/metro\/horarios-prevision-3\/(\d+)/.exec(url);
    if (!m) return realFetch(input, init);
    const rec = { id: Number(m[1]), start: performance.now(), end: null, status: null, error: false };
    P.fetches.push(rec);
    return realFetch(input, init).then((res) => {
      rec.end = performance.now(); rec.status = res.status;
      covered.add(rec.id); answered.add(rec.id); checkFullSync();
      return res;
    }, (err) => { rec.end = performance.now(); rec.error = true; throw err; });
  };

  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') P.fcp = e.startTime;
    }).observe({ type: 'paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) P.lcp = e.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) P.longTasks.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  } catch { /* observer type unsupported */ }

  // Station markers are 10 px, Vehicle markers 28 px; a live Vehicle has a
  // solid border, a Simulated Train a dashed one (MapView.jsx createVehicleMarker).
  const poll = setInterval(() => {
    if (P.styleAt === null && document.querySelector('.ml-station-marker-wrapper')) P.styleAt = performance.now();
    if (P.vehicleAt === null) {
      for (const el of document.querySelectorAll('.maplibregl-marker > div')) {
        if (el.style.width === '28px' && el.style.borderTopStyle === 'solid') { P.vehicleAt = performance.now(); break; }
      }
    }
    if (P.vehicleAt !== null && P.styleAt !== null && P.fullSyncAt !== null) clearInterval(poll);
  }, 25);

  if (withFrames) {
    // Wrap every rAF callback (the app's loop and MapLibre's render loop) and
    // sum their script time per frame, grouped by the frame timestamp.
    const realRaf = window.requestAnimationFrame.bind(window);
    let cur = null;
    window.requestAnimationFrame = (cb) => realRaf((ts) => {
      const t0 = performance.now();
      try { cb(ts); } finally {
        const d = performance.now() - t0;
        if (!cur || cur.ts !== ts) { cur = { ts, cbMs: 0 }; P.frames.push(cur); }
        cur.cbMs += d;
      }
    });
  }
  if (withReact) {
    let id = 0;
    window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      supportsFiber: true, renderers: new Map(), isDisabled: false,
      inject(r) { this.renderers.set(++id, r); return id; },
      onScheduleFiberRoot() {}, onPostCommitFiberRoot() {}, onCommitFiberUnmount() {}, checkDCE() {},
      onCommitFiberRoot() { P.commits.push(performance.now()); },
    };
  }
}

async function waitFor(page, predicate, timeoutMs, everyMs = 250) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try { if (await page.evaluate(predicate)) return true; } catch { /* navigating */ }
    await new Promise(r => setTimeout(r, everyMs));
  }
  return false;
}

// ── browser ──────────────────────────────────────────────────────────────────

async function loadOnce(page, base, navigate, expectFetch) {
  const tileResponses = [];
  const apiResponses = [];
  const onResponse = (res) => {
    const u = res.url();
    const t = Date.now();
    if (u.includes('/basemap/valencia.pmtiles')) tileResponses.push(t);
    if (u.includes('/api/metro/')) apiResponses.push(t);
  };
  page.on('response', onResponse);
  await navigate();
  const synced = await waitFor(page, expectFetch
    ? () => window.__perf && window.__perf.freshSyncAt !== null
    : () => window.__perf && window.__perf.fullSyncAt !== null, SYNC_TIMEOUT_MS);
  // A little longer so the vehicle poll and trailing paints settle.
  await new Promise(r => setTimeout(r, 500));
  const p = await page.evaluate(() => ({
    perf: window.__perf,
    origin: performance.timeOrigin,
    nav: (() => {
      const n = performance.getEntriesByType('navigation')[0];
      return n ? { ttfb: n.responseStart, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd } : null;
    })(),
  }));
  page.off('response', onResponse);
  const P = p.perf;
  const rel = (t) => Math.round(t - p.origin);
  const fetches = P.fetches.map(f => ({
    id: f.id, start: Math.round(f.start), end: f.end === null ? null : Math.round(f.end),
    status: f.status, error: f.error,
  }));
  const okFetches = fetches.filter(f => f.status === 200).sort((a, b) => a.end - b.end);
  // The first basemap tile is the first response after the archive header, which
  // MapLibre/PMTiles reads first.
  const tiles = tileResponses.map(rel).sort((a, b) => a - b);
  const r = (v) => (v === null || v === undefined ? null : Math.round(v));
  return {
    synced,
    ttfbMs: r(p.nav && p.nav.ttfb), dclMs: r(p.nav && p.nav.dcl), loadEventMs: r(p.nav && p.nav.load),
    fcpMs: r(P.fcp), lcpMs: r(P.lcp),
    styleReadyMs: r(P.styleAt),
    firstBasemapResponseMs: tiles[0] ?? null,
    lastBasemapResponseMs: tiles[tiles.length - 1] ?? null,
    basemapRequests: tiles.length,
    firstApiRequestMs: fetches.length ? Math.min(...fetches.map(f => f.start)) : null,
    firstApiOkMs: okFetches.length ? okFetches[0].end : null,
    firstLiveVehicleMs: r(P.vehicleAt),
    fullSyncMs: r(P.fullSyncAt),
    networkSyncMs: r(P.freshSyncAt),
    hydratedStations: P.hydratedIds.length,
    apiRequests: fetches.length,
    apiFailedAttempts: fetches.filter(f => f.error || (f.status !== null && f.status !== 200)).length,
    apiTimeline: fetches,
  };
}

async function runBrowser(opts) {
  const pw = loadPlaywright();
  const browser = await pw.chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  const init = { majorIds: MAJOR_IDS, withFrames: false, withReact: false };
  const runs = [];
  try {
    for (let rep = 1; rep <= opts.reps; rep++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const page = await context.newPage();
      await page.addInitScript(initScript, init);
      const cold = await loadOnce(page, opts.base, () => page.goto(opts.base, { waitUntil: 'commit' }), true);
      const warm = await loadOnce(page, opts.base, () => page.reload({ waitUntil: 'commit' }), false);
      const run = { rep, cold, warm };
      if (opts.stale) {
        await new Promise(r => setTimeout(r, 65000));
        run.warmStale = await loadOnce(page, opts.base, () => page.reload({ waitUntil: 'commit' }), true);
      }
      runs.push(run);
      await context.close();
      console.error(`rep ${rep}/${opts.reps} done`);
    }
  } finally {
    await browser.close();
  }
  const kinds = ['cold', 'warm', ...(opts.stale ? ['warmStale'] : [])];
  const metrics = ['ttfbMs', 'fcpMs', 'lcpMs', 'loadEventMs', 'styleReadyMs', 'firstBasemapResponseMs', 'firstApiOkMs',
    'firstLiveVehicleMs', 'fullSyncMs', 'networkSyncMs', 'apiRequests', 'apiFailedAttempts'];
  const medians = {};
  for (const k of kinds) {
    medians[k] = {};
    for (const m of metrics) medians[k][m] = median(runs.map(r => r[k][m]));
  }
  return { mode: 'browser', base: opts.base, reps: opts.reps, viewport: '390x844', medians, runs };
}

// ── render profile ───────────────────────────────────────────────────────────

async function runRender(opts) {
  const pw = loadPlaywright();
  const browser = await pw.chromium.launch({ headless: true, args: CHROMIUM_ARGS });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: opts.cpu });
    await cdp.send('Performance.enable');
    await page.addInitScript(initScript, { majorIds: MAJOR_IDS, withFrames: true, withReact: true });
    const metricsNow = async () => {
      const { metrics } = await cdp.send('Performance.getMetrics');
      return Object.fromEntries(metrics.map(m => [m.name, m.value]));
    };
    const m0 = await metricsNow();
    await page.goto(opts.base, { waitUntil: 'commit' });
    const synced = await waitFor(page, () => window.__perf && window.__perf.freshSyncAt !== null, SYNC_TIMEOUT_MS);
    const m1 = await metricsNow();
    const boot = await page.evaluate(() => ({
      syncAt: window.__perf.freshSyncAt,
      commits: window.__perf.commits.length,
      longTasks: window.__perf.longTasks.length,
      longTaskMs: window.__perf.longTasks.reduce((a, t) => a + t.dur, 0),
      frames: window.__perf.frames.length,
      fetches: window.__perf.fetches.map(f => [f.id, Math.round(f.start), f.end === null ? null : Math.round(f.end), f.status, f.error]),
    }));
    // Steady state: reset the window, then let it run with no input.
    await page.evaluate(() => {
      const P = window.__perf;
      P.win = { frameIdx: P.frames.length, commitIdx: P.commits.length, ltIdx: P.longTasks.length, t0: performance.now() };
    });
    const w0 = await metricsNow();
    await new Promise(r => setTimeout(r, opts.window * 1000));
    const w1 = await metricsNow();
    const win = await page.evaluate(() => {
      const P = window.__perf;
      const w = P.win;
      return {
        elapsedMs: performance.now() - w.t0,
        frames: P.frames.slice(w.frameIdx),
        commits: P.commits.length - w.commitIdx,
        longTasks: P.longTasks.slice(w.ltIdx),
      };
    });
    const delta = (a, b, k) => Math.round((b[k] - a[k]) * 1000 * 10) / 10; // ms
    const cb = win.frames.map(f => f.cbMs);
    const gaps = win.frames.slice(1).map((f, i) => f.ts - win.frames[i].ts);
    const hasLiveMarkers = await page.evaluate(() => document.querySelectorAll('.maplibregl-marker').length);
    return {
      mode: 'render', base: opts.base, cpuThrottle: opts.cpu, windowSeconds: opts.window, synced,
      markersInDom: hasLiveMarkers,
      boot: {
        navToFullSyncMs: boot.syncAt === null ? null : Math.round(boot.syncAt), apiAttempts: boot.fetches.length,
        apiTimeline: boot.fetches, reactCommits: boot.commits, longTasks: boot.longTasks,
        longTaskTotalMs: Math.round(boot.longTaskMs), frames: boot.frames,
        cdpTaskMs: delta(m0, m1, 'TaskDuration'), cdpScriptMs: delta(m0, m1, 'ScriptDuration'),
        cdpLayoutMs: delta(m0, m1, 'LayoutDuration'), cdpStyleMs: delta(m0, m1, 'RecalcStyleDuration'),
      },
      steady: {
        elapsedMs: Math.round(win.elapsedMs), frames: win.frames.length,
        fps: Math.round((win.frames.length / (win.elapsedMs / 1000)) * 10) / 10,
        rafCallbackMsPerFrame: summarise(cb),
        frameIntervalMs: summarise(gaps),
        longTasks: win.longTasks.length,
        longTaskTotalMs: Math.round(win.longTasks.reduce((a, t) => a + t.dur, 0)),
        longTaskMaxMs: Math.round(Math.max(0, ...win.longTasks.map(t => t.dur))),
        reactCommits: win.commits,
        cdpTaskMs: delta(w0, w1, 'TaskDuration'), cdpScriptMs: delta(w0, w1, 'ScriptDuration'),
        cdpLayoutMs: delta(w0, w1, 'LayoutDuration'), cdpStyleMs: delta(w0, w1, 'RecalcStyleDuration'),
        mainThreadBusyPct: Math.round(((w1.TaskDuration - w0.TaskDuration) / (win.elapsedMs / 1000)) * 1000) / 10,
        cdpTaskMsPerFrame: Math.round((delta(w0, w1, 'TaskDuration') / Math.max(1, win.frames.length)) * 100) / 100,
      },
    };
  } finally {
    await browser.close();
  }
}

// ── reporting ────────────────────────────────────────────────────────────────

function printHttp(r) {
  const a = r.answeredMs; const h = r.allWithHangsAtThresholdMs;
  console.log(`\n${r.mode}: ${r.requests} requests, ${r.stations} stations x ${r.rounds} rounds, concurrency ${r.concurrency}`);
  console.log('                 n     p50     p90     p99     max   (ms)');
  console.log(`answered only  ${String(a.n).padStart(4)} ${String(a.p50).padStart(7)} ${String(a.p90).padStart(7)} ${String(a.p99).padStart(7)} ${String(a.max).padStart(7)}`);
  console.log(`hangs at ${HANG_MS}  ${String(h.n).padStart(4)} ${String(h.p50).padStart(7)} ${String(h.p90).padStart(7)} ${String(h.p99).padStart(7)} ${String(h.max).padStart(7)}`);
  console.log(`hangs (> ${HANG_MS} ms): ${r.hangs} (${(r.hangRate * 100).toFixed(1)}%)   errors: ${r.errors} (${(r.errorRate * 100).toFixed(1)}%)`);
}

function printBrowser(r) {
  const kinds = Object.keys(r.medians);
  console.log(`\nbrowser: ${r.reps} reps against ${r.base}, medians in ms`);
  console.log(['metric'.padEnd(26), ...kinds.map(k => k.padStart(10))].join(' '));
  for (const m of Object.keys(r.medians[kinds[0]])) {
    console.log([m.padEnd(26), ...kinds.map(k => String(r.medians[k][m]).padStart(10))].join(' '));
  }
}

function printRender(r) {
  console.log(`\nrender: CPU x${r.cpuThrottle}, ${r.windowSeconds} s steady state, ${r.markersInDom} markers in DOM`);
  console.log(JSON.stringify({ boot: r.boot, steady: r.steady }, null, 2));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let result;
  if (opts.mode === 'proxy') {
    if (!opts.base) throw new Error('proxy mode needs --base');
    result = await measureHttp('proxy', id => `${opts.base}/api/metro/horarios-prevision-3/${id}`, opts.rounds);
    printHttp(result);
  } else if (opts.mode === 'fgv') {
    result = await measureHttp('fgv', id => `${FGV_PREVISION_URL}/${id}`, opts.rounds);
    printHttp(result);
  } else if (opts.mode === 'browser') {
    if (!opts.base) throw new Error('browser mode needs --base');
    result = await runBrowser(opts);
    printBrowser(result);
  } else if (opts.mode === 'render') {
    if (!opts.base) throw new Error('render mode needs --base');
    result = await runRender(opts);
    printRender(result);
  } else {
    console.error('Usage: node scripts/measure_latency.cjs <proxy|fgv|browser|render> --base URL [options]');
    process.exit(2);
  }
  if (opts.out) {
    fs.mkdirSync(path.dirname(path.resolve(projectRoot, opts.out)), { recursive: true });
    fs.writeFileSync(path.resolve(projectRoot, opts.out), JSON.stringify(result, null, 2));
    console.log(`\nwrote ${opts.out}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
