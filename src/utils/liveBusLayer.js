// Live bus markers on the map (issue #151). One DOM Marker per tracked bus, moved by a requestAnimationFrame
// loop exactly like the train markers: setLngLat only, no React state per frame. The loop runs only while
// some marker is still easing and parks itself once every bus sits on its latest fix (battery). Easing is
// busMarkerMotion; this file is only the DOM.
import { Marker } from 'maplibre-gl';
import { createBusMotion } from './busMarkerMotion';
import { LINE19_COLOR } from './busRouteLayer';
import { isFixDimmed, liveFixAgeSeconds } from './liveBusInfo';

export const NEXT_COLOR = '#4CAF50'; // matches the board row's green "N stops away"
export const LIVE_BUS_COLOR = LINE19_COLOR; // the one EMT red every bus badge uses (BusBadge.jsx)

// Live bus marker: a 20px white disc with a line-colour ring and the bold line number (no bus icon),
// a pulsing "live" halo behind it and a large WHITE heading arrow outside it (dark outline so it reads on
// light and dark basemaps). Only the arrow rotates, so the number stays upright. Unmistakably unlike the
// small rectangular EMT stop chips, and drawn above them (z-index 70 vs 26/50 for stops).
const SHADOW = 'drop-shadow(0 0 1px rgba(0,0,0,0.95)) drop-shadow(0 0 1px rgba(0,0,0,0.95)) drop-shadow(0 1px 2px rgba(0,0,0,0.6))';
// Line number size inside the 16px ring interior: 12px fits '19' cleanly; 3+ characters step down.
export function busNumberFontPx(text) {
  return String(text ?? '').length >= 3 ? 9 : 12;
}

function buildElement(doc, bus) {
  const fontPx = busNumberFontPx(bus.linea);
  const el = doc.createElement('div');
  el.className = 'live-bus-fleet-marker';
  el.style.cssText = 'z-index: 70; cursor: pointer;';
  el.title = `EMT ${bus.linea || ''}`.trim();
  // The visual lives in the inner element so Text Size zoom (index.css) never touches the map transform.
  const inner = doc.createElement('div');
  inner.className = 'live-bus-fleet-inner';
  inner.style.cssText = 'position:relative;width:42px;height:42px;display:flex;align-items:center;justify-content:center;';
  const halo = doc.createElement('div');
  halo.className = 'live-bus-fleet-halo';
  halo.style.cssText = `position:absolute;left:50%;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:${LIVE_BUS_COLOR};pointer-events:none;`;
  const arrow = doc.createElement('div');
  arrow.className = 'live-bus-fleet-arrow';
  arrow.style.cssText = 'position:absolute;inset:0;display:none;transform-origin:50% 50%;transition:transform 0.4s linear;pointer-events:none;';
  const tip = doc.createElement('div');
  tip.className = 'live-bus-fleet-chevron';
  tip.style.cssText = `position:absolute;left:50%;top:1px;margin-left:-7px;width:14px;height:10px;background:#ffffff;clip-path:polygon(50% 0,100% 100%,50% 68%,0 100%);`;
  // clip-path would also clip the filter, so the outline sits on a wrapper
  const tipWrap = doc.createElement('div');
  tipWrap.className = 'live-bus-fleet-chevron-wrap';
  tipWrap.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;filter:${SHADOW};`;
  tipWrap.appendChild(tip);
  arrow.appendChild(tipWrap);
  const badge = doc.createElement('div');
  badge.className = 'live-bus-fleet-badge';
  badge.style.cssText = `position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;width:20px;height:20px;border-radius:50%;background:#ffffff;color:${LIVE_BUS_COLOR};border:2px solid ${LIVE_BUS_COLOR};box-shadow:0 0 0 1px rgba(0,0,0,0.35),0 2px 5px rgba(0,0,0,0.65);font:900 ${fontPx}px/1 var(--font-ui);user-select:none;`;
  const num = doc.createElement('span');
  num.className = 'live-bus-fleet-line';
  num.textContent = String(bus.linea || '');
  badge.appendChild(num);
  // "Next bus for the selected stop": a thicker animated green ring (the board row's green) plus a small
  // chip under the disc. Hidden unless this is that bus; unlike the selection ring it never scales the bus.
  const nextRing = doc.createElement('div');
  nextRing.className = 'live-bus-fleet-next-ring';
  nextRing.style.cssText = `position:absolute;left:50%;top:50%;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;box-sizing:border-box;border:2.5px solid ${NEXT_COLOR};pointer-events:none;box-shadow:0 0 0 1px rgba(0,0,0,0.45);`;
  nextRing.style.display = 'none';
  const nextChip = doc.createElement('div');
  nextChip.className = 'live-bus-fleet-next-chip';
  nextChip.style.cssText = `position:absolute;left:50%;top:50%;margin-top:16px;transform:translateX(-50%);padding:1px 5px;border-radius:7px;background:${NEXT_COLOR};color:#06240a;font:800 10px/1.2 var(--font-ui);white-space:nowrap;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,0.6);`;
  nextChip.style.display = 'none';
  inner.appendChild(halo);
  inner.appendChild(arrow);
  inner.appendChild(badge);
  inner.appendChild(nextRing);
  inner.appendChild(nextChip);
  el.appendChild(inner);
  return { el, arrow, inner, badge, halo, nextRing, nextChip };
}

const RING = `0 0 0 1.5px #ffffff, 0 0 0 3px ${LIVE_BUS_COLOR}, 0 3px 7px rgba(0,0,0,0.7)`;
const BASE_SHADOW = '0 0 0 1px rgba(0,0,0,0.35),0 2px 5px rgba(0,0,0,0.65)';


/**
 * @param {object} map MapLibre map
 * @param {{ onSelect?: Function, MarkerClass?: Function, doc?: Document, raf?: Function, caf?: Function, now?: () => number }} [opts]
 */
export function createLiveBusLayer(map, opts = {}) {
  const {
    onSelect = null,
    MarkerClass = Marker,
    doc = typeof document !== 'undefined' ? document : null,
    raf = (fn) => requestAnimationFrame(fn),
    caf = (id) => cancelAnimationFrame(id),
    now = Date.now,
  } = opts;
  const motion = createBusMotion();
  /** @type {Map<string, {marker: object, arrow: object, lng: number, lat: number, rot: number|null, bus: object}>} */
  const markers = new Map();
  let frame = null;
  let selectedId = null;
  let next = null; // { id, label }: the bus the stop board row refers to

  function applySelection(id, m) {
    const on = id != null && id === selectedId;
    m.el.style.zIndex = on ? '80' : '70';
    m.inner.style.transform = on ? 'scale(1.25)' : '';
    m.badge.style.boxShadow = on ? RING : BASE_SHADOW;
  }

  function applyNext(id, m) {
    const on = next != null && next.id === id;
    m.nextRing.style.display = on ? 'block' : 'none';
    m.nextChip.style.display = on ? 'block' : 'none';
    if (on) m.nextChip.textContent = next.label || '';
  }

  // Fix older than 60 s (still shown until the tracker hides it at 120 s): dimmed, no pulsing halo.
  function applyFreshness(m, t) {
    const dim = isFixDimmed(liveFixAgeSeconds(m.bus, t));
    // filter, not opacity: MapLibre's Marker rewrites element.style.opacity itself
    m.el.style.filter = dim ? 'opacity(0.55)' : '';
    m.halo.style.display = dim ? 'none' : '';
  }

  function paint(t) {
    markers.forEach((m, id) => {
      const s = motion.sample(id, t);
      if (!s) return;
      if (m.lng !== s.lonLat[0] || m.lat !== s.lonLat[1]) {
        m.lng = s.lonLat[0];
        m.lat = s.lonLat[1];
        m.marker.setLngLat(s.lonLat);
      }
      if (s.headingDeg != null && m.rot !== s.headingDeg) {
        m.rot = s.headingDeg;
        m.arrow.style.display = 'block';
        m.arrow.style.transform = `rotate(${s.headingDeg}deg)`;
      }
    });
  }

  function loop() {
    frame = null;
    const t = now();
    paint(t);
    if (!motion.isSettled(t)) frame = raf(loop);
  }

  function setBuses(buses) {
    const t = now();
    motion.update(buses, t);
    const alive = new Set(motion.ids());
    markers.forEach((m, id) => {
      if (!alive.has(id)) { m.marker.remove(); markers.delete(id); }
    });
    for (const bus of buses) {
      if (!alive.has(bus.id)) continue;
      const known = markers.get(bus.id);
      if (known) { known.bus = bus; applyFreshness(known, t); continue; }
      const { el, arrow, inner, badge, halo, nextRing, nextChip } = buildElement(doc, bus);
      const entry = { marker: null, arrow, el, inner, badge, halo, nextRing, nextChip, lng: null, lat: null, rot: null, bus };
      if (onSelect) {
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          onSelect(entry.bus);
        });
      }
      const start = motion.sample(bus.id, t);
      entry.marker = new MarkerClass({ element: el, anchor: 'center' }).setLngLat(start.lonLat).addTo(map);
      entry.lng = start.lonLat[0];
      entry.lat = start.lonLat[1];
      markers.set(bus.id, entry);
      applySelection(bus.id, entry);
      applyNext(bus.id, entry);
      applyFreshness(entry, t);
    }
    paint(t);
    if (frame == null && markers.size > 0 && !motion.isSettled(t)) frame = raf(loop);
  }

  /** Ring the bus whose details are open (null clears). */
  function setSelected(id) {
    selectedId = id ?? null;
    markers.forEach((m, key) => applySelection(key, m));
  }

  /** Emphasise the bus the stop board row refers to ({ id, label }); null clears. */
  function setNextBus(info) {
    next = info && info.id != null ? { id: info.id, label: info.label || '' } : null;
    markers.forEach((m, key) => applyNext(key, m));
  }

  function destroy() {
    if (frame != null) caf(frame);
    frame = null;
    markers.forEach((m) => m.marker.remove());
    markers.clear();
    motion.clear();
  }

  return { setBuses, setSelected, setNextBus, destroy, count: () => markers.size, markerFor: (id) => markers.get(id)?.marker };
}
