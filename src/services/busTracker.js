// Live bus tracker (issue #150, spec #146, ADR-0014). PURE: no timers, no network,
// no React. Feed it the records of busFleetService (shape
// { gid, linea, trayecto, lonLat, fixTimeMs, ageSeconds }) with update(records, nowMs)
// and it gives back the visible buses with a stable id, heading and a route snap.
//
// Identity (ADR-0014): `gid` changes at every layer rewrite, so a Track is rebuilt
// by matching each new Fix to a tracked bus of the same linea and exact trayecto,
// greedy global one-to-one by distance, within MATCH_GATE_M. A trayecto change (a
// terminus turnaround) starts a new Track. Heading is the bearing between
// successive Fixes, from a reference fix that is held until the bus has moved
// HEADING_MIN_MOVE_M. Snapping to the route shape is for the marker position only.
//
// Clocks: `nowMs` is the poll clock of the snapshot (the service anchors it per
// response). Fix age of a bus = the record's ageSeconds + poll time elapsed since
// the record arrived, so a device clock skew never enters. A Track is dropped when
// its last matched snapshot is more than DROP_AFTER_MS of poll time old.

import { distanceM, directionForTrayecto, projectOnShape, OFF_ROUTE_M } from '../utils/busRoute';

export const MATCH_GATE_M = 400;
export const DROP_AFTER_MS = 120000;
export const HIDE_AGE_S = 120;
export const HEADING_MIN_MOVE_M = 10;
/** Fewer than this share of the tracked buses is a rewrite in progress, not buses vanishing. */
export const PARTIAL_SHARE = 0.5;

const RAD = Math.PI / 180;
const TIE_EPS_M = 1e-6;

/** Initial great-circle bearing a -> b, degrees clockwise from north in [0, 360). */
export function bearingDeg(a, b) {
  const p1 = a[1] * RAD;
  const p2 = b[1] * RAD;
  const dl = (b[0] - a[0]) * RAD;
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return ((Math.atan2(y, x) / RAD) + 360) % 360;
}

function snapshotKey(records) {
  return records.map((r) => r.gid).sort((a, b) => a - b).join(',');
}

function snap(track, hint) {
  const direction = directionForTrayecto(track.trayecto);
  track.directionKey = direction ? direction.id : null;
  track.alongM = null;
  track.offsetM = null;
  track.snappedLonLat = [...track.lonLat];
  if (!direction) return;
  const proj = projectOnShape(direction, track.lonLat, hint == null ? {} : { hintAlongM: hint });
  if (!proj) return;
  track.offsetM = proj.offsetM;
  if (proj.offsetM > OFF_ROUTE_M) return;
  track.alongM = proj.alongM;
  track.snappedLonLat = [...proj.point];
}

export function createBusTracker() {
  let tracks = [];
  let nextId = 1;
  let lastKey = null;
  let lastNowMs = 0;

  function fixAgeS(t, nowMs) {
    return Math.max(0, t.ageSeconds0 + (nowMs - t.seenPollMs) / 1000);
  }

  function view(t, nowMs) {
    const age = fixAgeS(t, nowMs);
    return {
      id: t.id,
      sourceGid: t.gid,
      linea: t.linea,
      trayecto: t.trayecto,
      directionKey: t.directionKey,
      lonLat: [...t.lonLat],
      snappedLonLat: [...t.snappedLonLat],
      alongM: t.alongM,
      offsetM: t.offsetM,
      headingDeg: t.headingDeg,
      fixTimeMs: t.fixTimeMs,
      ageSeconds: Math.round(age),
      stale: age > HIDE_AGE_S,
    };
  }

  function getBuses(nowMs = lastNowMs, opts = {}) {
    const all = tracks.map((t) => view(t, nowMs));
    return opts.includeStale ? all : all.filter((b) => !b.stale);
  }

  function newTrack(r, nowMs) {
    const t = {
      id: `bus-${nextId++}`,
      linea: r.linea,
      trayecto: String(r.trayecto ?? '').trim(),
      refLonLat: [...r.lonLat],
      headingDeg: null,
    };
    t.lonLat = [...r.lonLat];
    t.gid = r.gid;
    t.fixTimeMs = r.fixTimeMs;
    t.ageSeconds0 = r.ageSeconds;
    t.seenPollMs = nowMs;
    t.lastMatchedMs = nowMs;
    snap(t, null);
    tracks.push(t);
  }

  function apply(t, r, nowMs) {
    t.gid = r.gid;
    t.ageSeconds0 = r.ageSeconds;
    t.seenPollMs = nowMs;
    t.lastMatchedMs = nowMs;
    if (r.fixTimeMs === t.fixTimeMs) return; // same fix: nothing moves
    const d = distanceM(t.refLonLat, r.lonLat);
    if (d >= HEADING_MIN_MOVE_M) {
      t.headingDeg = bearingDeg(t.refLonLat, r.lonLat);
      t.refLonLat = [...r.lonLat];
    }
    t.lonLat = [...r.lonLat];
    t.fixTimeMs = r.fixTimeMs;
    snap(t, t.alongM);
  }

  function match(records, nowMs) {
    const pairs = [];
    tracks.forEach((t) => {
      records.forEach((r, ri) => {
        if (r.linea !== t.linea || String(r.trayecto ?? '').trim() !== t.trayecto) return;
        if (r.fixTimeMs < t.fixTimeMs) return;
        const dist = distanceM(t.lonLat, r.lonLat);
        if (dist > MATCH_GATE_M) return;
        pairs.push({ t, r, ri, dist });
      });
    });
    pairs.sort((a, b) => {
      if (Math.abs(a.dist - b.dist) > TIE_EPS_M) return a.dist - b.dist;
      return (a.t.gid - b.t.gid) || (a.r.gid - b.r.gid) || (a.ri - b.ri);
    });
    const usedTracks = new Set();
    const usedRecs = new Set();
    for (const p of pairs) {
      if (usedTracks.has(p.t) || usedRecs.has(p.ri)) continue;
      usedTracks.add(p.t);
      usedRecs.add(p.ri);
      apply(p.t, p.r, nowMs);
    }
    records.forEach((r, ri) => {
      if (!usedRecs.has(ri)) newTrack(r, nowMs);
    });
  }

  function update(records, nowMs) {
    lastNowMs = nowMs;
    const recs = Array.isArray(records) ? records : [];
    const key = snapshotKey(recs);
    const isNewSnapshot = key !== lastKey;
    lastKey = key;
    const partial = recs.length === 0 || recs.length < tracks.length * PARTIAL_SHARE;
    if (isNewSnapshot && !partial) match(recs, nowMs);
    tracks = tracks.filter((t) => nowMs - t.lastMatchedMs <= DROP_AFTER_MS);
    return getBuses(nowMs);
  }

  function reset() {
    tracks = [];
    nextId = 1;
    lastKey = null;
    lastNowMs = 0;
  }

  return { update, getBuses, reset };
}
