// Smooth bus marker motion (issue #151, spec #146, ADR-0014). PURE: no timers, no DOM, no React.
//
// The Bus GPS Stream moves in ~30 s steps, so drawing each fix as it lands would make a bus jump 80 m
// (median) every half minute. Instead each new fix becomes a target and the marker travels to it over
// the fix interval (clamped), which is what the ADR asks for. Rules, from the marker-drift research
// (docs/research/marker-drift.md: a marker that only moves forward, never overshoots, snaps only on
// re-identification):
//  - A new ease starts from where the marker is NOW, never from the old fix, so a fix landing mid-ease
//    does not jump.
//  - Position moves along the route shape (pointAtAlongM) when the tracker has an alongM, else in a
//    straight line between the two snapped points.
//  - Never backwards: a fix behind the marker holds it until the bus passes that point.
//  - Linear speed, no overshoot, clamped to the target; once there it holds on the latest fix.
//  - A gap above MAX_SNAP_GAP_M is a re-identification or a glitch, not travel: snap.
//  - Heading is the tracker's (successive fixes); null holds the last one, and before any exists it falls
//    back to the route bearing at the bus's position. The returned heading is
//    unwrapped (may exceed 360 or go negative) so a CSS rotation takes the short way round north.

import { directionById, pointAtAlongM, distanceM } from './busRoute';

export const MIN_EASE_MS = 20000;
export const MAX_EASE_MS = 45000;
export const DEFAULT_EASE_MS = 30000;
export const MAX_SNAP_GAP_M = 1500;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

export function createBusMotion() {
  /** @type {Map<string, object>} */
  const states = new Map();

  function current(st, nowMs) {
    const t = st.dur > 0 ? clamp((nowMs - st.start) / st.dur, 0, 1) : 1;
    if (t >= 1) return { lonLat: st.to.lonLat, along: st.to.along };
    if (st.direction && st.from.along != null && st.to.along != null) {
      const along = lerp(st.from.along, st.to.along, t);
      return { lonLat: pointAtAlongM(st.direction, along).lonLat, along };
    }
    return {
      lonLat: [lerp(st.from.lonLat[0], st.to.lonLat[0], t), lerp(st.from.lonLat[1], st.to.lonLat[1], t)],
      along: null,
    };
  }

  function applyHeading(st, headingDeg) {
    if (!Number.isFinite(headingDeg)) return;
    if (st.heading == null) { st.heading = headingDeg; return; }
    const delta = ((((headingDeg - st.heading) % 360) + 540) % 360) - 180;
    st.heading += delta;
  }

  function durationFor(bus) {
    const gap = Number.isFinite(bus.prevFixTimeMs) && Number.isFinite(bus.fixTimeMs) ? bus.fixTimeMs - bus.prevFixTimeMs : NaN;
    return clamp(Number.isFinite(gap) && gap > 0 ? gap : DEFAULT_EASE_MS, MIN_EASE_MS, MAX_EASE_MS);
  }

  function place(bus, direction) {
    const point = { lonLat: [...bus.snappedLonLat], along: direction && Number.isFinite(bus.alongM) ? bus.alongM : null };
    return {
      id: bus.id, dirKey: bus.directionKey ?? null, direction, fixTimeMs: bus.fixTimeMs,
      from: point, to: point, start: 0, dur: 0, heading: null,
    };
  }

  function update(buses, nowMs) {
    const seen = new Set();
    for (const bus of buses) {
      if (bus.stale || !bus.snappedLonLat) continue;
      seen.add(bus.id);
      const direction = bus.directionKey ? directionById(bus.directionKey) : null;
      const st = states.get(bus.id);
      if (!st) {
        const fresh = place(bus, direction);
        applyHeading(fresh, bus.headingDeg);
        states.set(bus.id, fresh);
        continue;
      }
      applyHeading(st, bus.headingDeg);
      if (bus.fixTimeMs === st.fixTimeMs) continue;
      st.fixTimeMs = bus.fixTimeMs;

      const cur = current(st, nowMs);
      const target = { lonLat: [...bus.snappedLonLat], along: direction && Number.isFinite(bus.alongM) ? bus.alongM : null };
      const sameRoute = direction && st.direction && st.dirKey === (bus.directionKey ?? null) && cur.along != null && target.along != null;

      st.direction = direction;
      st.dirKey = bus.directionKey ?? null;
      st.start = nowMs;
      if (sameRoute) {
        if (target.along < cur.along) {
          // Behind the marker: hold here until the bus passes this point.
          st.from = cur;
          st.to = cur;
          st.dur = MIN_EASE_MS;
        } else if (target.along - cur.along > MAX_SNAP_GAP_M) {
          st.from = target; st.to = target; st.dur = 0;
        } else {
          st.from = cur; st.to = target; st.dur = durationFor(bus);
        }
      } else if (distanceM(cur.lonLat, target.lonLat) > MAX_SNAP_GAP_M) {
        st.from = target; st.to = target; st.dur = 0;
      } else {
        st.from = { lonLat: cur.lonLat, along: null };
        st.to = { lonLat: target.lonLat, along: null };
        st.dur = durationFor(bus);
      }
    }
    for (const id of [...states.keys()]) if (!seen.has(id)) states.delete(id);
  }

  /** { lonLat, headingDeg|null } of a bus at nowMs, or null if it is not shown. */
  function sample(id, nowMs) {
    const st = states.get(id);
    if (!st) return null;
    const cur = current(st, nowMs);
    // No tracker heading yet (first fix): use the route direction at the bus's position so it always has an arrow.
    if (st.heading == null && st.direction && cur.along != null) {
      st.heading = pointAtAlongM(st.direction, cur.along).bearingDeg;
    }
    return { lonLat: cur.lonLat, headingDeg: st.heading };
  }

  function isSettled(nowMs) {
    for (const st of states.values()) if (nowMs < st.start + st.dur) return false;
    return true;
  }

  return { update, sample, isSettled, ids: () => [...states.keys()], clear: () => states.clear() };
}
