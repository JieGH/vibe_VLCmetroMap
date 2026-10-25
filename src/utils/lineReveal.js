import { getDistance } from './geoUtils';

// Which stations of a filtered Line show at which zoom, major first. Mirrors
// the native app's LineReveal: rank 0 is the Line's ends plus every
// interchange; ranks 1 and 2 fill the gaps, each time taking the station
// farthest from those already shown, so every level spreads evenly.
export const REVEAL_MAJOR = 0;
export const REVEAL_MID = 1;
export const REVEAL_MINOR = 2;

/** Zoom from which each rank is drawn while a Line filter is active. */
export const REVEAL_ZOOMS = [8, 11.2, 12.2];

/** The highest rank drawn at `zoom` (-1: none). */
export const allowedRank = (zoom) => {
  let rank = -1;
  REVEAL_ZOOMS.forEach((z, i) => { if (zoom >= z) rank = i; });
  return rank;
};

const linesOf = (st) => (st.properties?.lines || []).map(String);

/**
 * @param {Array} stations station Point features ({ geometry.coordinates: [lon, lat], properties.lines })
 * @param {string[]} filter active Line ids
 * @returns {Map<object, number>} rank per station feature on any filtered Line
 */
export const lineRanks = (stations, filter) => {
  const ids = (filter || []).map(String);
  const on = stations.filter((st) => linesOf(st).some((l) => ids.includes(l)));
  const out = new Map();
  if (on.length <= 2) { on.forEach((st) => out.set(st, REVEAL_MAJOR)); return out; }
  const d = (a, b) => getDistance(a.geometry.coordinates, b.geometry.coordinates);

  const major = new Set();
  ids.forEach((id) => {
    const s = on.filter((st) => linesOf(st).includes(id));
    if (s.length < 2) { s.forEach((st) => major.add(st)); return; }
    let best = [s[0], s[1]]; let bd = -1;
    for (let i = 0; i < s.length; i += 1) {
      for (let j = i + 1; j < s.length; j += 1) {
        const dist = d(s[i], s[j]);
        if (dist > bd) { bd = dist; best = [s[i], s[j]]; }
      }
    }
    best.forEach((st) => major.add(st));
  });
  on.filter((st) => linesOf(st).length > 1).forEach((st) => major.add(st));

  major.forEach((st) => out.set(st, REVEAL_MAJOR));
  const shown = [...major];
  const rest = on.filter((st) => !out.has(st));
  const firstHalf = Math.ceil(rest.length / 2);
  let picked = 0;
  while (rest.length > 0) {
    let bi = 0; let bs = -1;
    rest.forEach((c, i) => {
      const nearest = Math.min(...shown.map((s) => d(c, s)));
      if (nearest > bs) { bs = nearest; bi = i; }
    });
    const [next] = rest.splice(bi, 1);
    shown.push(next);
    out.set(next, picked < firstHalf ? REVEAL_MID : REVEAL_MINOR);
    picked += 1;
  }
  return out;
};
