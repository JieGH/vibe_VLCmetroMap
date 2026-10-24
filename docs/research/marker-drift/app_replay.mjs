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
//   LINE_IDS=3,9 Lines to measure (default: all). Not LINES: zsh treats
//                that as its terminal-height variable and mangles it
//   TAP=90       Tap a Station on those Lines every N seconds, round-robin,
//                panel left open until the next tap (default: 0, no taps)
//   SYNC=app     'app' = Strategic Hubs + Major Stations (default), 'all' =
//                every captured Station, 'none' = taps only
//   OUT=f.jsonl  Write every episode (jump, slide, hold) as JSONL
//   POS=f.jsonl  Write the drawn and raw position of every Vehicle each second
//   TAPSET=all   Which Stations get tapped: 'all' (default), 'sync' (only the
//                Stations a Network Sync refreshes: their data is 0-120s old at
//                the tap), 'other' (only Stations outside the sync: never
//                fetched, or last fetched by an earlier tap)
//   SEED=n       Taps land at random phases (seeded): each gap is TAP x U(0.5, 1.5).
//                Without it taps sit on a fixed grid that can lock to the
//                120s sync grid and hide every stale-Station tap. (default: 0 =
//                fixed grid)
//   TRACE=L-v    Print one Vehicle's raw and drawn position every second (e.g. 10-10075)
//   MOVES=f.jsonl  Write every refresh x Vehicle: how far its raw estimate moved
//   SYNC_EXTRA=190,197  Add these Station ids to the Network Sync (what-if)
//   SYNC_EVERY=120  Network Sync period in seconds (default 120)
//   NOTTL=1      Syncs ignore the 60s memory pause (with SYNC=all and
//                SYNC_EVERY=30 this is the 'oracle': every Station as fresh
//                as the capture allows)
//   SNAP=before  'before' = latest snapshot at or before the fetch (default,
//                up to one 30s capture pass staler than the app would get),
//                'nearest' = closest snapshot either side (unbiased, +-15s)
//
// Corrections against the real code (2026-10-24, L8/L10 tap study):
//  - fetchedAt is the moment the response lands (fetch + RTT), as in
//    arrivalStore. It used to be the snapshot's capture time, up to 30s
//    older, which made the 60s memory pause expire early. With the real
//    stamp a panel poll 60s after a tap finds the entry 59.5s old and
//    does NOT fetch: a panel open on one Station refreshes every 120s,
//    not 60s.
//  - a Network Sync dispatches 4 requests at a time (native), ~RTT each,
//    not one every 400ms.
//  - every refresh records what the Station held before (age or never), and
//    for each Vehicle in the reply how far its raw estimate moved, so a slide
//    can be traced to its refresh.

import fs from 'fs';
import engine from '../../../src/services/trainPositionEngine.js';
import arrivalStore, { STRATEGIC_HUBS, MAJOR_STATIONS } from '../../../src/services/arrivalStore.js';

const file = process.argv[2];
const LINES = process.env.LINE_IDS ? new Set(process.env.LINE_IDS.split(',')) : null;
const TAP_MS = Number(process.env.TAP || 0) * 1000;
const SYNC = process.env.SYNC || 'app';
const OUT = process.env.OUT || null;

const TICK_MS = 250;
const CACHE_TTL_MS = 60000;          // arrivalStore CACHE_TTL_MS
const PANEL_POLL_MS = 60000;         // StationPanel's interval
const RTT_MS = 500;                  // FGV median answer ~0.4s, p90 ~0.9s
const SYNC_CONCURRENCY = 4;          // native build
const SYNC_EVERY_MS = Number(process.env.SYNC_EVERY || 120) * 1000;
const NOTTL = process.env.NOTTL === '1';
const SNAP = process.env.SNAP || 'before';
const TAPSET = process.env.TAPSET || 'all';
const SEED = Number(process.env.SEED || 0);
let rngState = SEED * 2654435761 >>> 0;
const rand = () => { rngState = (rngState + 0x6D2B79F5) >>> 0; let t = rngState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const tapGap = () => (SEED ? TAP_MS * (0.5 + rand()) : TAP_MS);
const POS = process.env.POS || null;
const MOVES = process.env.MOVES || null;
const TRACE = process.env.TRACE ? `live-${process.env.TRACE}` : null;
// Propagation Lag plus the 10s Arrival Countdown Lead, as arrivalStore applies.
const TRAM_LINES = new Set(['4', '6', '8', '10']);
const lagMs = (line) => (TRAM_LINES.has(line) ? 10000 : 15000) + 10000;

// Faster than any timetabled segment (16.9 m/s), so drawn motion above it is
// the marker catching up, not a train running.
const SLIDE_METRES_PER_SECOND = Number(process.env.SLIDE || 20);
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

const refreshes = []; // { at, sid, reason, vehicles, priorAgeS, moves }
const pickSnap = (list, now) => {
  if (SNAP !== 'nearest') return list.findLast(s => s.t <= now);
  let best = null;
  for (const s of list) if (!best || Math.abs(s.t - now) < Math.abs(best.t - now)) best = s;
  return best;
};
const rawNow = (now) => new Map(engine.getLiveVehiclesFromMemory(now).map(v => [v.id, v]));
const fetchStation = (sid, now, reason) => {
  const snap = pickSnap(snaps.get(sid) || [], now);
  const name = apiNames.get(sid);
  if (!snap || !name) return;
  const landed = now + RTT_MS;
  const prior = arrivalStore.memory.get(String(sid));
  const before = rawNow(landed);
  arrivalStore.memory.set(String(sid), {
    stationId: sid,
    stationName: name,
    fetchedAt: landed,
    arrivals: snap.rows.map(r => ({
      line: String(r.line),
      destination: r.dest,
      targetTimestamp: snap.t + r.s * 1000 - lagMs(String(r.line)),
      isLive: true,
      vehicleId: String(r.v),
    })),
  });
  const after = rawNow(landed);
  // How far each Vehicle in the reply moved, along its travel direction. A
  // Vehicle the Station listed before and no longer lists (it has arrived)
  // counts too: losing that Sighting can move the estimate as much as
  // gaining one.
  const listed = new Set(snap.rows.map(r => `live-${r.line}-${r.v}`));
  const dropped = new Set((prior?.arrivals || []).map(a => `live-${a.line}-${a.vehicleId}`).filter(id => !listed.has(id)));
  const moves = new Map();
  for (const id of new Set([...listed, ...dropped])) {
    const a = after.get(id);
    const b = before.get(id);
    if (!a) continue;
    moves.set(id, b ? {
      metres: Math.round((a.distanceAlongTrack - b.distanceAlongTrack) * (a.isForward ? 1 : -1)),
      flipped: a.isForward !== b.isForward, dropped: dropped.has(id),
      anchorBefore: b.targetStation, anchorAfter: a.targetStation,
      unheardBefore: b.secondsUnheard, sightingsBefore: b.sightingCount, sightingsAfter: a.sightingCount,
      toTargetBefore: b.secondsToTarget, toTargetAfter: a.secondsToTarget,
    } : { metres: null, appeared: true, anchorAfter: a.targetStation, sightingsAfter: a.sightingCount, toTargetAfter: a.secondsToTarget });
  }
  refreshes.push({
    at: now, sid, name, reason, vehicles: new Set([...listed, ...dropped].map(id => id.slice(5))), moves,
    priorAgeS: prior ? Math.round((now - prior.fetchedAt) / 1000) : null,
    snapAgeS: Math.round((now - snap.t) / 1000),
  });
};
const isStale = (sid, now) => {
  const entry = arrivalStore.memory.get(String(sid));
  return !entry || now - entry.fetchedAt >= CACHE_TTL_MS;
};

const syncSids = SYNC === 'all' ? [...snaps.keys()]
  : SYNC === 'none' ? []
  : [...new Set([...STRATEGIC_HUBS, ...MAJOR_STATIONS].map(s => Number(s.id)).concat((process.env.SYNC_EXTRA || '').split(',').filter(Boolean).map(Number)))].filter(sid => snaps.has(sid));
const syncSet = new Set([...STRATEGIC_HUBS, ...MAJOR_STATIONS].map(s => Number(s.id)));
const tapSids = [...snaps.keys()]
  .filter(sid => !LINES || [...linesAt.get(sid)].some(l => LINES.has(l)))
  .filter(sid => TAPSET === 'all' || (TAPSET === 'sync') === syncSet.has(sid))
  .sort((a, b) => a - b);

// Catch-up policy experiments (prototype only; the app uses whatever
// trainPositionEngine.catchUpRate returns):
//   POLICY=const:25            fixed rate
//   POLICY=speed:k,floor,cap   k x the Vehicle's running speed, clamped
//   POLICY=ease:T,floor,cap    running speed + gap/T, clamped
//   RESYNC=800,1500           gap in metres past which the marker goes straight there, forward then backward (one number sets both)
if (process.env.POLICY) {
  const [kind, argStr] = process.env.POLICY.split(':');
  const a = argStr.split(',').map(Number);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  if (kind === 'const') engine.catchUpRate = () => a[0];
  if (kind === 'speed') engine.catchUpRate = (v) => clamp(a[0] * (v.runningSpeed || 7.5), a[1], a[2]);
  if (kind === 'ease') engine.catchUpRate = (v, gap) => clamp((v.runningSpeed || 7.5) + gap / a[0], a[1], a[2]);
}
if (process.env.RESYNC) {
  const [fwd, back] = process.env.RESYNC.split(',').map(Number);
  engine.resyncForwardMetres = fwd;
  engine.resyncBackwardMetres = back ?? fwd;
}

// What the map draws, and the raw walk it was drawn from.
const rawById = new Map();
const realSmooth = engine.smoothVehicle.bind(engine);
engine.smoothVehicle = (vehicle, now) => {
  if (vehicle.isLive) rawById.set(vehicle.id, vehicle);
  return realSmooth(vehicle, now);
};

const perLine = new Map();
const stats = (line) => {
  if (!perLine.has(line)) perLine.set(line, { vehicles: new Set(), vehicleTicks: 0, jumps: 0, resyncs: 0, popins: 0, backward: 0, slides: [], holds: [], offsetSum: 0, excess8: 0, excess15: 0 });
  return perLine.get(line);
};
const episodes = [];
const posRows = [];
const state = new Map(); // id -> { d, isForward, slide, hold }
const everSeen = new Set();

const recentRefreshes = (vehicleKey, at) =>
  refreshes.filter(r => r.at <= at && r.at >= at - 3000 && r.vehicles.has(vehicleKey));
const triggerFor = (vehicleKey, at) => {
  const recent = recentRefreshes(vehicleKey, at);
  if (recent.some(r => r.reason === 'tap')) return 'tap';
  if (recent.some(r => r.reason === 'panel-poll')) return 'panel-poll';
  if (recent.length) return 'sync';
  return 'no-refresh';
};
// The refresh behind an episode, for the causal table.
const causeFor = (vehicleKey, at) => {
  const recent = recentRefreshes(vehicleKey, at);
  const r = recent.find(x => x.reason === 'tap') || recent.find(x => x.reason === 'panel-poll') || recent[0];
  if (!r) return null;
  return { reason: r.reason, station: r.name, sid: r.sid, priorAgeS: r.priorAgeS, snapAgeS: r.snapAgeS, move: r.moves.get(`live-${vehicleKey}`) || null };
};

let nextSync = t0;
let nextTap = TAP_MS ? t0 + 60000 + (SEED ? rand() * TAP_MS : 0) : Infinity;
let tapIndex = 0;
let openPanel = null; // { sid, nextPoll }

for (let now = t0 + 30000; now <= tEnd; now += TICK_MS) {
  if (now >= nextSync) {
    syncSids.forEach((sid, i) => {
      const at = now + Math.floor(i / SYNC_CONCURRENCY) * RTT_MS;
      if (at <= tEnd && (NOTTL || isStale(sid, at))) fetchStation(sid, at, 'sync');
    });
    nextSync += SYNC_EVERY_MS;
  }
  if (now >= nextTap && tapSids.length) {
    const sid = SEED ? tapSids[Math.floor(rand() * tapSids.length)] : tapSids[tapIndex++ % tapSids.length];
    if (isStale(sid, now)) fetchStation(sid, now, 'tap');
    openPanel = { sid, nextPoll: now + PANEL_POLL_MS };
    nextTap += tapGap();
  }
  if (openPanel && now >= openPanel.nextPoll) {
    if (isStale(openPanel.sid, now)) fetchStation(openPanel.sid, now, 'panel-poll');
    openPanel.nextPoll += PANEL_POLL_MS;
  }

  const logSec = (now - t0) % 1000 === 0;
  const logPos = POS && logSec;
  const drawn = engine.getAllVehicles(now).filter(v => v.isLive);
  // Mirror the engine: a Vehicle off the map loses its render state.
  const onMap = new Set(drawn.map(v => v.id));
  for (const id of state.keys()) if (!onMap.has(id)) state.delete(id);
  for (const v of drawn) {
    if (LINES && !LINES.has(v.line)) continue;
    const s = stats(v.line);
    s.vehicles.add(v.id);
    s.vehicleTicks++;
    const raw = rawById.get(v.id);
    if (raw) s.offsetSum += Math.abs(raw.distanceAlongTrack - v.distanceAlongTrack);

    if (logPos) posRows.push(JSON.stringify({ t: Math.round((now - t0) / 1000), id: v.id, line: v.line, fw: v.isForward, d: Math.round(v.distanceAlongTrack), raw: raw ? Math.round(raw.distanceAlongTrack) : null }));
    if (TRACE && v.id === TRACE && logSec) console.log(`${Math.round((now - t0) / 1000)}s raw=${raw ? Math.round(raw.distanceAlongTrack) : '-'} drawn=${Math.round(v.distanceAlongTrack)} ${v.isForward ? 'fwd' : 'rev'} ${raw ? raw.status : ''} next=${raw ? raw.targetStation : ''} in ${raw ? raw.secondsToTarget : ''}s sightings=${raw ? raw.sightingCount : ''} unheard=${raw ? raw.secondsUnheard : ''}s`);
    const prev = state.get(v.id);
    const vehicleKey = v.id.replace(/^live-/, '');
    if (prev && prev.isForward === v.isForward) {
      const delta = (v.distanceAlongTrack - prev.d) * (v.isForward ? 1 : -1);
      const at = Math.round((now - t0) / 1000);
      if (Math.abs(delta) > RESYNC_METRES) {
        s.resyncs++;
        episodes.push({ kind: 'resync', line: v.line, id: v.id, at, metres: Math.round(delta), trigger: triggerFor(vehicleKey, now), refresh: causeFor(vehicleKey, now) });
      } else {
        if (delta < 0) s.backward += -delta;
        if (Math.abs(delta) > JUMP_METRES) {
          s.jumps++;
          episodes.push({ kind: 'jump', line: v.line, id: v.id, at, metres: Math.round(delta), trigger: triggerFor(vehicleKey, now), refresh: causeFor(vehicleKey, now), status: v.status, target: v.targetStation });
        }
      }

      // Slides: drawn motion faster than any train, sustained.
      // 'model-speed' when the raw walk itself runs that fast (a Segment
      // whose running time is too short for its length), 'catch-up' when the
      // marker is closing on an estimate that leapt ahead of it.
      const speed = Math.abs(delta) / (TICK_MS / 1000);
      const rawSpeed = raw && prev.rawD !== undefined ? Math.abs(raw.distanceAlongTrack - prev.rawD) / (TICK_MS / 1000) : 0;
      // Cap-independent: seconds the marker is drawn moving well faster than
      // the estimate it follows, i.e. visibly catching up.
      if (Math.abs(delta) <= RESYNC_METRES && raw && prev.rawD !== undefined) {
        const excess = speed - rawSpeed;
        if (excess > 8) s.excess8 += TICK_MS / 1000;
        if (excess > 15) s.excess15 += TICK_MS / 1000;
      }
      if (speed > SLIDE_METRES_PER_SECOND && Math.abs(delta) <= RESYNC_METRES) {
        prev.slide ??= { start: now, metres: 0, modelTicks: 0, ticks: 0, trigger: triggerFor(vehicleKey, now), cause: causeFor(vehicleKey, now) };
        prev.slide.metres += Math.abs(delta);
        prev.slide.ticks++;
        if (rawSpeed > SLIDE_METRES_PER_SECOND) prev.slide.modelTicks++;
      } else if (prev.slide) {
        if (now - prev.slide.start >= MIN_SLIDE_MS) {
          const e = { kind: 'slide', line: v.line, id: v.id, at: Math.round((prev.slide.start - t0) / 1000), seconds: (now - prev.slide.start) / 1000, metres: Math.round(prev.slide.metres), trigger: prev.slide.trigger, cause: prev.slide.modelTicks * 2 > prev.slide.ticks ? 'model-speed' : 'catch-up', refresh: prev.slide.cause, startT: prev.slide.start, target: v.targetStation };
          s.slides.push(e);
          episodes.push(e);
        }
        prev.slide = null;
      }

      // Holds: the marker stands still between platforms because the
      // estimate fell behind it.
      const behind = raw && (raw.distanceAlongTrack - v.distanceAlongTrack) * (v.isForward ? 1 : -1) < -1;
      if (delta === 0 && behind) {
        prev.hold ??= { start: now, trigger: triggerFor(vehicleKey, now), cause: causeFor(vehicleKey, now) };
      } else if (prev.hold) {
        if (now - prev.hold.start >= MIN_HOLD_MS) {
          const e = { kind: 'hold', line: v.line, id: v.id, at: Math.round((prev.hold.start - t0) / 1000), seconds: (now - prev.hold.start) / 1000, trigger: prev.hold.trigger, refresh: prev.hold.cause, target: v.targetStation };
          s.holds.push(e);
          episodes.push(e);
        }
        prev.hold = null;
      }
      prev.d = v.distanceAlongTrack;
      if (raw) prev.rawD = raw.distanceAlongTrack;
    } else {
      // Direction flips and returns after an absence are re-identifications:
      // the engine drops a Vehicle's render state while it is off the map, so
      // it reappears wherever the new estimate puts it.
      if (!prev && everSeen.has(v.id)) s.popins++;
      everSeen.add(v.id);
      state.set(v.id, { d: v.distanceAlongTrack, isForward: v.isForward, slide: null, hold: null });
    }
  }
}

const minutes = (tEnd - t0 - 30000) / 60000;
const taps = refreshes.filter(r => r.reason === 'tap').length;
const polls = refreshes.filter(r => r.reason === 'panel-poll').length;
console.log(`capture ${minutes.toFixed(1)} min, sync=${SYNC} (${syncSids.length} Stations), taps=${taps}${TAP_MS ? ` every ${TAP_MS / 1000}s` : ''}, panel polls=${polls}, syncs=${refreshes.filter(r => r.reason === 'sync').length}`);
console.log('line  vehicles  jumps/min  resyncs  popins  backward  slides(n, mean s, mean m, by trigger)            holds>=20s(n, max s)  mean offset  catch-up s (>8, >15 m/s over estimate)');
for (const [line, s] of [...perLine].sort((a, b) => Number(a[0]) - Number(b[0]))) {
  const byTrigger = {};
  for (const e of s.slides) byTrigger[`${e.cause}/${e.trigger}`] = (byTrigger[`${e.cause}/${e.trigger}`] || 0) + 1;
  const meanS = s.slides.length ? (s.slides.reduce((a, e) => a + e.seconds, 0) / s.slides.length).toFixed(1) : '-';
  const meanM = s.slides.length ? Math.round(s.slides.reduce((a, e) => a + e.metres, 0) / s.slides.length) : '-';
  const maxHold = s.holds.length ? Math.max(...s.holds.map(h => h.seconds)) : '-';
  console.log(
    `L${line.padEnd(4)} ${String(s.vehicles.size).padStart(8)}  ${(s.jumps / minutes).toFixed(2).padStart(9)}  ${String(s.resyncs).padStart(7)}  ${String(s.popins).padStart(6)}  ${String(Math.round(s.backward)).padStart(6)} m  ` +
    `${String(s.slides.length).padStart(3)}, ${String(meanS).padStart(4)}, ${String(meanM).padStart(4)}, ${JSON.stringify(byTrigger).padEnd(60)}  ` +
    `${String(s.holds.length).padStart(3)}, ${String(maxHold).padStart(5)}  ${String(Math.round(s.offsetSum / Math.max(1, s.vehicleTicks))).padStart(6)} m  ${String(Math.round(s.excess8)).padStart(5)} ${String(Math.round(s.excess15)).padStart(5)}`
  );
}
if (MOVES) {
  const out = [];
  for (const r of refreshes) for (const [id, m] of r.moves) out.push(JSON.stringify({ at: Math.round((r.at - t0) / 1000), reason: r.reason, station: r.name, priorAgeS: r.priorAgeS, id, ...m }));
  fs.writeFileSync(MOVES, out.join('\n') + '\n');
}
if (POS) fs.writeFileSync(POS, posRows.join('\n') + '\n');
if (OUT) fs.writeFileSync(OUT, episodes.map(e => JSON.stringify(e)).join('\n') + '\n');
// Sighting order filter (issue #84): how often it dropped a Sighting, per Line.
// An evaluation is one Vehicle placed in one second; a pair is one Vehicle x
// Station that was ever dropped.
if (engine.orderFilterStats && engine.orderFilterStats.size) {
  console.log('\norder filter: line  evaluations  with a drop  Vehicle|Station pairs dropped');
  for (const [line, st] of [...engine.orderFilterStats].sort((a, b) => Number(a[0]) - Number(b[0]))) {
    if (LINES && !LINES.has(line)) continue;
    const byStation = {};
    for (const pair of st.dropped.keys()) { const n = pair.split('|')[1]; byStation[n] = (byStation[n] || 0) + 1; }
    console.log(`L${line.padEnd(3)} ${String(st.evaluations).padStart(11)}  ${String(st.withDrop).padStart(11)}  ${JSON.stringify(byStation)}`);
  }
}
