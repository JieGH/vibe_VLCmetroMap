// Replay a whole-network capture the way the app actually fetches, and
// measure what the map draws, per Line.
//
// replay.mjs refreshes every captured Station on one cadence. The app does
// not: a Network Sync refreshes only the Strategic Hubs and Major Stations
// every 120s (skipping any fetched in the last 60s), and every other Station
// is fetched only when someone taps it — once on open if its data is over 60s
// old, then every 60s while its panel stays open. A Station outside the sync
// can sit unfetched for minutes, so the first tap lands a prediction far from
// what the map was drawing. That is the case this harness exists to measure.
//
// Usage: npx vite-node docs/research/marker-drift/app_replay.mjs capture.jsonl
// Env:
//   LINES=3,9    Lines to measure (default: all)
//   TAP=90       Tap a Station on those Lines every N seconds, round-robin,
//                panel left open until the next tap (default: 0, no taps)
//   SYNC=app     'app' = Strategic Hubs + Major Stations (default), 'all' =
//                every captured Station, 'none' = taps only
//   OUT=f.jsonl  Write every episode (jump, slide, hold) as JSONL
//
// A fetch returns the latest captured snapshot at or before that moment, so
// data can be up to one capture pass (30s) staler than the app would get.

import fs from 'fs';
import engine from '../../../src/services/trainPositionEngine.js';
import arrivalStore, { STRATEGIC_HUBS, MAJOR_STATIONS } from '../../../src/services/arrivalStore.js';

const file = process.argv[2];
const LINES = process.env.LINES ? new Set(process.env.LINES.split(',')) : null;
const TAP_MS = Number(process.env.TAP || 0) * 1000;
const SYNC = process.env.SYNC || 'app';
const OUT = process.env.OUT || null;

const TICK_MS = 250;
const SYNC_INTERVAL_MS = 120000;     // NETWORK_SYNC_INTERVAL_MS
const CACHE_TTL_MS = 60000;          // arrivalStore CACHE_TTL_MS
const PANEL_POLL_MS = 60000;         // StationPanel's interval
const SYNC_SPACING_MS = 400;         // ~4 in flight at ~0.4s each
// Propagation Lag plus the 10s Arrival Countdown Lead, as arrivalStore applies.
const TRAM_LINES = new Set(['4', '6', '8', '10']);
const lagMs = (line) => (TRAM_LINES.has(line) ? 10000 : 15000) + 10000;

// Faster than any timetabled segment (16.9 m/s), so drawn motion above it is
// the marker catching up, not a train running.
const SLIDE_METRES_PER_SECOND = 20;
const MIN_SLIDE_MS = 1000;
const MIN_HOLD_MS = 20000;
const JUMP_METRES = 25;
const RESYNC_METRES = 1500;

const rows = fs.readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => !r.err);

// snapshots per Station: one per capture pass
const snaps = new Map();
for (const r of rows) {
  if (!snaps.has(r.sid)) snaps.set(r.sid, new Map());
  const pass = Math.floor(r.t / 15000);
  const m = snaps.get(r.sid);
  if (!m.has(pass)) m.set(pass, { t: r.t, rows: [] });
  m.get(pass).rows.push(r);
}
for (const [sid, m] of snaps) snaps.set(sid, [...m.values()].sort((a, b) => a.t - b.t));
const apiNames = new Map(rows.map(r => [r.sid, r.name]));
const linesAt = new Map();
for (const r of rows) {
  if (!linesAt.has(r.sid)) linesAt.set(r.sid, new Set());
  linesAt.get(r.sid).add(String(r.line));
}

const t0 = Math.min(...rows.map(r => r.t));
const tEnd = Math.max(...rows.map(r => r.t));

const refreshes = []; // { at, sid, reason, vehicles }
const fetchStation = (sid, now, reason) => {
  const snap = (snaps.get(sid) || []).findLast(s => s.t <= now);
  const name = apiNames.get(sid);
  if (!snap || !name) return;
  arrivalStore.memory.set(String(sid), {
    stationId: sid,
    stationName: name,
    fetchedAt: snap.t,
    arrivals: snap.rows.map(r => ({
      line: String(r.line),
      destination: r.dest,
      targetTimestamp: snap.t + r.s * 1000 - lagMs(String(r.line)),
      isLive: true,
      vehicleId: String(r.v),
    })),
  });
  refreshes.push({ at: now, sid, reason, vehicles: new Set(snap.rows.map(r => `${r.line}-${r.v}`)) });
};
const isStale = (sid, now) => {
  const entry = arrivalStore.memory.get(String(sid));
  return !entry || now - entry.fetchedAt >= CACHE_TTL_MS;
};

const syncSids = SYNC === 'all' ? [...snaps.keys()]
  : SYNC === 'none' ? []
  : [...new Set([...STRATEGIC_HUBS, ...MAJOR_STATIONS].map(s => Number(s.id)))].filter(sid => snaps.has(sid));
const tapSids = [...snaps.keys()]
  .filter(sid => !LINES || [...linesAt.get(sid)].some(l => LINES.has(l)))
  .sort((a, b) => a - b);

// What the map draws, and the raw walk it was drawn from.
const rawById = new Map();
const realSmooth = engine.smoothVehicle.bind(engine);
engine.smoothVehicle = (vehicle, now) => {
  if (vehicle.isLive) rawById.set(vehicle.id, vehicle);
  return realSmooth(vehicle, now);
};

const perLine = new Map();
const stats = (line) => {
  if (!perLine.has(line)) perLine.set(line, { vehicles: new Set(), vehicleTicks: 0, jumps: 0, resyncs: 0, backward: 0, slides: [], holds: [], offsetSum: 0 });
  return perLine.get(line);
};
const episodes = [];
const state = new Map(); // id -> { d, isForward, slide, hold }

const triggerFor = (vehicleKey, at) => {
  const recent = refreshes.filter(r => r.at <= at && r.at >= at - 3000 && r.vehicles.has(vehicleKey));
  if (recent.some(r => r.reason === 'tap')) return 'tap';
  if (recent.some(r => r.reason === 'panel-poll')) return 'panel-poll';
  if (recent.length) return 'sync';
  return 'no-refresh';
};

let nextSync = t0;
let nextTap = TAP_MS ? t0 + 60000 : Infinity;
let tapIndex = 0;
let openPanel = null; // { sid, nextPoll }

for (let now = t0 + 30000; now <= tEnd; now += TICK_MS) {
  if (now >= nextSync) {
    syncSids.forEach((sid, i) => {
      const at = now + i * SYNC_SPACING_MS;
      if (at <= tEnd && isStale(sid, at)) fetchStation(sid, at, 'sync');
    });
    nextSync += SYNC_INTERVAL_MS;
  }
  if (now >= nextTap && tapSids.length) {
    const sid = tapSids[tapIndex++ % tapSids.length];
    if (isStale(sid, now)) fetchStation(sid, now, 'tap');
    openPanel = { sid, nextPoll: now + PANEL_POLL_MS };
    nextTap += TAP_MS;
  }
  if (openPanel && now >= openPanel.nextPoll) {
    if (isStale(openPanel.sid, now)) fetchStation(openPanel.sid, now, 'panel-poll');
    openPanel.nextPoll += PANEL_POLL_MS;
  }

  const drawn = engine.getAllVehicles(now).filter(v => v.isLive);
  for (const v of drawn) {
    if (LINES && !LINES.has(v.line)) continue;
    const s = stats(v.line);
    s.vehicles.add(v.id);
    s.vehicleTicks++;
    const raw = rawById.get(v.id);
    if (raw) s.offsetSum += Math.abs(raw.distanceAlongTrack - v.distanceAlongTrack);

    const prev = state.get(v.id);
    const vehicleKey = v.id.replace(/^live-/, '');
    if (prev && prev.isForward === v.isForward) {
      const delta = (v.distanceAlongTrack - prev.d) * (v.isForward ? 1 : -1);
      const at = Math.round((now - t0) / 1000);
      if (Math.abs(delta) > RESYNC_METRES) {
        s.resyncs++;
        episodes.push({ kind: 'resync', line: v.line, id: v.id, at, metres: Math.round(delta), trigger: triggerFor(vehicleKey, now) });
      } else {
        if (delta < 0) s.backward += -delta;
        if (Math.abs(delta) > JUMP_METRES) {
          s.jumps++;
          episodes.push({ kind: 'jump', line: v.line, id: v.id, at, metres: Math.round(delta), trigger: triggerFor(vehicleKey, now), status: v.status, target: v.targetStation });
        }
      }

      // Slides: drawn motion faster than any train, sustained.
      // 'model-speed' when the raw walk itself runs that fast (a Segment
      // whose running time is too short for its length), 'catch-up' when the
      // marker is closing on an estimate that leapt ahead of it.
      const speed = Math.abs(delta) / (TICK_MS / 1000);
      const rawSpeed = raw && prev.rawD !== undefined ? Math.abs(raw.distanceAlongTrack - prev.rawD) / (TICK_MS / 1000) : 0;
      if (speed > SLIDE_METRES_PER_SECOND && Math.abs(delta) <= RESYNC_METRES) {
        prev.slide ??= { start: now, metres: 0, modelTicks: 0, ticks: 0, trigger: triggerFor(vehicleKey, now) };
        prev.slide.metres += Math.abs(delta);
        prev.slide.ticks++;
        if (rawSpeed > SLIDE_METRES_PER_SECOND) prev.slide.modelTicks++;
      } else if (prev.slide) {
        if (now - prev.slide.start >= MIN_SLIDE_MS) {
          const e = { kind: 'slide', line: v.line, id: v.id, at: Math.round((prev.slide.start - t0) / 1000), seconds: (now - prev.slide.start) / 1000, metres: Math.round(prev.slide.metres), trigger: prev.slide.trigger, cause: prev.slide.modelTicks * 2 > prev.slide.ticks ? 'model-speed' : 'catch-up', target: v.targetStation };
          s.slides.push(e);
          episodes.push(e);
        }
        prev.slide = null;
      }

      // Holds: the marker stands still between platforms because the
      // estimate fell behind it.
      const behind = raw && (raw.distanceAlongTrack - v.distanceAlongTrack) * (v.isForward ? 1 : -1) < -1;
      if (delta === 0 && behind) {
        prev.hold ??= { start: now, trigger: triggerFor(vehicleKey, now) };
      } else if (prev.hold) {
        if (now - prev.hold.start >= MIN_HOLD_MS) {
          const e = { kind: 'hold', line: v.line, id: v.id, at: Math.round((prev.hold.start - t0) / 1000), seconds: (now - prev.hold.start) / 1000, trigger: prev.hold.trigger, target: v.targetStation };
          s.holds.push(e);
          episodes.push(e);
        }
        prev.hold = null;
      }
      prev.d = v.distanceAlongTrack;
      if (raw) prev.rawD = raw.distanceAlongTrack;
    } else {
      state.set(v.id, { d: v.distanceAlongTrack, isForward: v.isForward, slide: null, hold: null });
    }
  }
}

const minutes = (tEnd - t0 - 30000) / 60000;
const taps = refreshes.filter(r => r.reason === 'tap').length;
console.log(`capture ${minutes.toFixed(1)} min, sync=${SYNC} (${syncSids.length} Stations), taps=${taps}${TAP_MS ? ` every ${TAP_MS / 1000}s` : ''}`);
console.log('line  vehicles  jumps/min  resyncs  backward  slides(n, mean s, mean m, by trigger)            holds>=20s(n, max s)  mean offset');
for (const [line, s] of [...perLine].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const byTrigger = {};
  for (const e of s.slides) byTrigger[`${e.cause}/${e.trigger}`] = (byTrigger[`${e.cause}/${e.trigger}`] || 0) + 1;
  const meanS = s.slides.length ? (s.slides.reduce((a, e) => a + e.seconds, 0) / s.slides.length).toFixed(1) : '-';
  const meanM = s.slides.length ? Math.round(s.slides.reduce((a, e) => a + e.metres, 0) / s.slides.length) : '-';
  const maxHold = s.holds.length ? Math.max(...s.holds.map(h => h.seconds)) : '-';
  console.log(
    `L${line.padEnd(4)} ${String(s.vehicles.size).padStart(8)}  ${(s.jumps / minutes).toFixed(2).padStart(9)}  ${String(s.resyncs).padStart(7)}  ${String(Math.round(s.backward)).padStart(6)} m  ` +
    `${String(s.slides.length).padStart(3)}, ${String(meanS).padStart(4)}, ${String(meanM).padStart(4)}, ${JSON.stringify(byTrigger).padEnd(60)}  ` +
    `${String(s.holds.length).padStart(3)}, ${String(maxHold).padStart(5)}  ${String(Math.round(s.offsetSum / Math.max(1, s.vehicleTicks))).padStart(6)} m`
  );
}
if (OUT) fs.writeFileSync(OUT, episodes.map(e => JSON.stringify(e)).join('\n') + '\n');
