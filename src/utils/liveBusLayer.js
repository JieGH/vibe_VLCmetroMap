// Live bus markers on the map (issue #151). One DOM Marker per tracked bus, moved by a requestAnimationFrame
// loop exactly like the train markers: setLngLat only, no React state per frame. The loop runs only while
// some marker is still easing and parks itself once every bus sits on its latest fix (battery). Easing is
// busMarkerMotion; this file is only the DOM.
import { Marker } from 'maplibre-gl';
import { createBusMotion } from './busMarkerMotion';
import { LINE19_COLOR } from './busRouteLayer';

export const LIVE_BUS_COLOR = LINE19_COLOR; // the one EMT red every bus badge uses (BusBadge.jsx)

// Live bus marker: a 40px white disc with a thick line-colour ring and the bold line number (no bus icon),
// a pulsing "live" halo behind it and a large WHITE heading arrow outside it (dark outline so it reads on
// light and dark basemaps). Only the arrow rotates, so the number stays upright. Unmistakably unlike the
// small rectangular EMT stop chips, and drawn above them (z-index 70 vs 26/50 for stops).
const SHADOW = 'drop-shadow(0 0 1px rgba(0,0,0,0.95)) drop-shadow(0 0 1px rgba(0,0,0,0.95)) drop-shadow(0 1px 2px rgba(0,0,0,0.6))';
function buildElement(doc, bus) {
  const el = doc.createElement('div');
  el.className = 'live-bus-fleet-marker';
  el.style.cssText = 'z-index: 70; cursor: pointer;';
  el.title = `EMT ${bus.linea || ''}`.trim();
  // The visual lives in the inner element so Text Size zoom (index.css) never touches the map transform.
  const inner = doc.createElement('div');
  inner.className = 'live-bus-fleet-inner';
  inner.style.cssText = 'position:relative;width:84px;height:84px;display:flex;align-items:center;justify-content:center;';
  const halo = doc.createElement('div');
  halo.className = 'live-bus-fleet-halo';
  halo.style.cssText = `position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:${LIVE_BUS_COLOR};pointer-events:none;`;
  const arrow = doc.createElement('div');
  arrow.className = 'live-bus-fleet-arrow';
  arrow.style.cssText = 'position:absolute;inset:0;display:none;transform-origin:50% 50%;transition:transform 0.4s linear;pointer-events:none;';
  const tip = doc.createElement('div');
  tip.className = 'live-bus-fleet-chevron';
  tip.style.cssText = `position:absolute;left:50%;top:2px;margin-left:-13px;width:26px;height:20px;background:#ffffff;clip-path:polygon(50% 0,100% 100%,50% 68%,0 100%);`;
  // clip-path would also clip the filter, so the outline sits on a wrapper
  const tipWrap = doc.createElement('div');
  tipWrap.className = 'live-bus-fleet-chevron-wrap';
  tipWrap.style.cssText = `position:absolute;left:0;top:0;width:100%;height:100%;filter:${SHADOW};`;
  tipWrap.appendChild(tip);
  arrow.appendChild(tipWrap);
  const badge = doc.createElement('div');
  badge.className = 'live-bus-fleet-badge';
  badge.style.cssText = `position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;width:40px;height:40px;border-radius:50%;background:#ffffff;color:${LIVE_BUS_COLOR};border:4px solid ${LIVE_BUS_COLOR};box-shadow:0 0 0 1.5px rgba(0,0,0,0.35),0 4px 10px rgba(0,0,0,0.65);font:900 17px/1 var(--font-ui);user-select:none;`;
  const num = doc.createElement('span');
  num.className = 'live-bus-fleet-line';
  num.textContent = String(bus.linea || '');
  badge.appendChild(num);
  inner.appendChild(halo);
  inner.appendChild(arrow);
  inner.appendChild(badge);
  el.appendChild(inner);
  return { el, arrow, inner, badge };
}

const RING = `0 0 0 3px #ffffff, 0 0 0 6px ${LIVE_BUS_COLOR}, 0 6px 14px rgba(0,0,0,0.7)`;
const BASE_SHADOW = '0 0 0 1.5px rgba(0,0,0,0.35),0 4px 10px rgba(0,0,0,0.65)';


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

  function applySelection(id, m) {
    const on = id != null && id === selectedId;
    m.el.style.zIndex = on ? '80' : '70';
    m.inner.style.transform = on ? 'scale(1.25)' : '';
    m.badge.style.boxShadow = on ? RING : BASE_SHADOW;
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
      if (known) { known.bus = bus; continue; }
      const { el, arrow, inner, badge } = buildElement(doc, bus);
      const entry = { marker: null, arrow, el, inner, badge, lng: null, lat: null, rot: null, bus };
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
    }
    paint(t);
    if (frame == null && markers.size > 0 && !motion.isSettled(t)) frame = raf(loop);
  }

  /** Ring the bus whose details are open (null clears). */
  function setSelected(id) {
    selectedId = id ?? null;
    markers.forEach((m, key) => applySelection(key, m));
  }

  function destroy() {
    if (frame != null) caf(frame);
    frame = null;
    markers.forEach((m) => m.marker.remove());
    markers.clear();
    motion.clear();
  }

  return { setBuses, setSelected, destroy, count: () => markers.size, markerFor: (id) => markers.get(id)?.marker };
}
