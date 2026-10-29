// Live bus markers on the map (issue #151). One DOM Marker per tracked bus, moved by a requestAnimationFrame
// loop exactly like the train markers: setLngLat only, no React state per frame. The loop runs only while
// some marker is still easing and parks itself once every bus sits on its latest fix (battery). Easing is
// busMarkerMotion; this file is only the DOM.
import { Marker } from 'maplibre-gl';
import { createBusMotion } from './busMarkerMotion';
import { LINE19_COLOR } from './busRouteLayer';

export const LIVE_BUS_COLOR = LINE19_COLOR; // the one EMT red every bus badge uses (BusBadge.jsx)

// Live bus marker: a plain round badge in the line colour with the line number, a soft
// pulsing "live" halo behind it and a heading chevron outside it. Only the chevron rotates, so the number
// always stays upright. Visibly unlike the small rectangular EMT stop badges.
function buildElement(doc, bus) {
  const el = doc.createElement('div');
  el.className = 'live-bus-fleet-marker';
  el.style.cssText = 'z-index: 24; cursor: pointer;';
  el.title = `EMT ${bus.linea || ''}`.trim();
  // The visual lives in the inner element so Text Size zoom (index.css) never touches the map transform.
  const inner = doc.createElement('div');
  inner.className = 'live-bus-fleet-inner';
  inner.style.cssText = 'position:relative;width:60px;height:60px;display:flex;align-items:center;justify-content:center;';
  const halo = doc.createElement('div');
  halo.className = 'live-bus-fleet-halo';
  halo.style.cssText = `position:absolute;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;border-radius:50%;background:${LIVE_BUS_COLOR};pointer-events:none;`;
  const arrow = doc.createElement('div');
  arrow.className = 'live-bus-fleet-arrow';
  arrow.style.cssText = 'position:absolute;inset:0;display:none;transform-origin:50% 50%;transition:transform 0.4s linear;pointer-events:none;';
  const tip = doc.createElement('div');
  tip.className = 'live-bus-fleet-chevron';
  tip.style.cssText = `position:absolute;left:50%;top:0;margin-left:-9px;width:0;height:0;border-left:9px solid transparent;border-right:9px solid transparent;border-bottom:13px solid ${LIVE_BUS_COLOR};filter:drop-shadow(0 0 1.5px #fff) drop-shadow(0 1px 2px rgba(0,0,0,0.55));`;
  arrow.appendChild(tip);
  const badge = doc.createElement('div');
  badge.className = 'live-bus-fleet-badge';
  badge.style.cssText = `position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;box-sizing:border-box;width:32px;height:32px;border-radius:50%;background:${LIVE_BUS_COLOR};color:#fff;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5);font:800 14px/1 var(--font-ui);user-select:none;`;
  const num = doc.createElement('span');
  num.className = 'live-bus-fleet-line';
  num.textContent = String(bus.linea || '');
  badge.appendChild(num);
  inner.appendChild(halo);
  inner.appendChild(arrow);
  inner.appendChild(badge);
  el.appendChild(inner);
  return { el, arrow };
}

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
      const { el, arrow } = buildElement(doc, bus);
      const entry = { marker: null, arrow, lng: null, lat: null, rot: null, bus };
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
    }
    paint(t);
    if (frame == null && markers.size > 0 && !motion.isSettled(t)) frame = raf(loop);
  }

  function destroy() {
    if (frame != null) caf(frame);
    frame = null;
    markers.forEach((m) => m.marker.remove());
    markers.clear();
    motion.clear();
  }

  return { setBuses, destroy, count: () => markers.size, markerFor: (id) => markers.get(id)?.marker };
}
