// Which country the visitor's connection comes from, asked of our own /api/region on load and again every minute and on return to the tab. The FGV
// and EMT services can refuse addresses outside Spain, so a visitor on a VPN or abroad gets a heads-up before
// they wonder why the trains and buses are missing. Only the country code travels; no IP is stored.
import { useSyncExternalStore } from 'react';
import { Capacitor } from '@capacitor/core';

// Cloudflare reports XX for an unknown country; anything else that is not ES (T1 is Tor) is outside Spain.
export function isOutsideSpain(country) {
  return typeof country === 'string' && /^[A-Z]{2}$|^T1$/i.test(country) && !/^(ES|XX)$/i.test(country);
}

let country = null;
let started = false;
const listeners = new Set();

export async function fetchCountry(fetchFn = fetch) {
  const url = Capacitor.isNativePlatform() ? 'https://xarxa.net/api/region' : '/api/region';
  try {
    const res = await fetchFn(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = await res.json();
    return typeof body?.country === 'string' ? body.country : null;
  } catch {
    return null;
  }
}

// `npm run dev` has no /api/region, so ?region=US stands in for it there. Never read in a production build.
function devOverride() {
  if (!import.meta.env.DEV) return null;
  return new URLSearchParams(window.location.search).get('region');
}

async function refreshCountry() {
  const override = devOverride();
  const c = await (override ? Promise.resolve(override) : fetchCountry());
  // A failed lookup says nothing about the connection, so keep the last answer instead of clearing the notice.
  if (c === null && country !== null) return;
  if (c === country) return;
  country = c;
  listeners.forEach((fn) => fn());
}

// How often an open page re-asks. A VPN switched on mid-session has to be noticed without a reload.
export const RECHECK_MS = 60_000;

export function startRegionCheck() {
  if (started || typeof window === 'undefined') return;
  started = true;
  refreshCountry();
  setInterval(() => { if (document.visibilityState !== 'hidden') refreshCountry(); }, RECHECK_MS);
  // Coming back to the tab or the network returning is when a VPN toggle is most likely to have happened.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshCountry(); });
  window.addEventListener('online', refreshCountry);
  window.addEventListener('focus', refreshCountry);
}

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** Snapshot for components that re-render with a parent that already subscribes (useOutsideSpain). */
export const getOutsideSpain = () => isOutsideSpain(country);

/** True once the lookup has answered and the connection is outside Spain; false while unknown. */
export function useOutsideSpain() {
  return useSyncExternalStore(subscribe, getOutsideSpain, () => false);
}
