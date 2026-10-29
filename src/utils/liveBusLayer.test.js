import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLiveBusLayer, busNumberFontPx } from './liveBusLayer';

const makeEl = () => {
  const el = { innerHTML: '', textContent: '', style: {}, className: '', children: [], listeners: {}, dataset: {} };
  el.appendChild = (c) => { el.children.push(c); };
  el.addEventListener = (t, fn) => { el.listeners[t] = fn; };
  el.setAttribute = () => {};
  return el;
};

class FakeMarker {
  constructor({ element }) { this.element = element; this.setLngLat = vi.fn(() => this); this.addTo = vi.fn(() => this); this.remove = vi.fn(); }
  getElement() { return this.element; }
}

let frames;
const raf = (fn) => { frames.push(fn); return frames.length; };
const caf = vi.fn();
const stepFrame = () => { const f = frames.splice(0); f.forEach((fn) => fn()); };

const bus = (id, ll, heading = 90) => ({ id, directionKey: null, alongM: null, snappedLonLat: ll, fixTimeMs: 1, prevFixTimeMs: null, headingDeg: heading, stale: false, linea: '19' });

describe('liveBusLayer', () => {
  let doc;
  beforeEach(() => {
    frames = [];
    doc = { createElement: makeEl };
  });
  const make = (extra = {}) => createLiveBusLayer({}, { MarkerClass: FakeMarker, doc, raf, caf, now: () => 0, ...extra });

  it('adds one marker per bus and removes it when the bus is gone', () => {
    const layer = make();
    layer.setBuses([bus('a', [-0.37, 39.47]), bus('b', [-0.36, 39.47])]);
    expect(layer.count()).toBe(2);
    layer.setBuses([bus('a', [-0.37, 39.47])]);
    expect(layer.count()).toBe(1);
    layer.setBuses([]);
    expect(layer.count()).toBe(0);
  });

  it('runs no animation loop when there are no buses, and stops once settled', () => {
    const layer = make();
    layer.setBuses([]);
    expect(frames).toHaveLength(0);
    layer.setBuses([bus('a', [-0.37, 39.47])]);
    stepFrame();
    stepFrame();
    expect(frames).toHaveLength(0); // settled: no further frames
  });

  it('wires the tap handler with the bus and stops propagation', () => {
    const onSelect = vi.fn();
    const layer = make({ onSelect });
    layer.setBuses([bus('a', [-0.37, 39.47])]);
    const el = layer.markerFor('a').getElement();
    const stopPropagation = vi.fn();
    el.listeners.click({ stopPropagation });
    expect(stopPropagation).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
  });

  it('destroy removes markers and cancels the loop', () => {
    const layer = make();
    layer.setBuses([bus('a', [-0.37, 39.47]), bus('b', [-0.3, 39.4])]);
    const m = layer.markerFor('a');
    layer.destroy();
    expect(m.remove).toHaveBeenCalled();
    expect(layer.count()).toBe(0);
  });

  it('builds a distinct round marker: halo, rotating chevron, upright body with the line number only', () => {
    const layer = make();
    layer.setBuses([bus('a', [-0.37, 39.47])]);
    const inner = layer.markerFor('a').getElement().children[0];
    expect(inner.children.map((c) => c.className)).toEqual(['live-bus-fleet-halo', 'live-bus-fleet-arrow', 'live-bus-fleet-badge', 'live-bus-fleet-next-ring', 'live-bus-fleet-next-chip']);
    const body = inner.children[2];
    expect(body.style.cssText).toContain('border-radius:50%');
    expect(body.children.map((c) => c.className)).toEqual(['live-bus-fleet-line']);
    expect(body.children[0].textContent).toBe('19');
    // 20px white disc, thick red ring, red number; the arrow is white with a dark outline; above the stop chips
    expect(body.style.cssText).toContain('width:20px');
    expect(body.style.cssText).toContain('background:#ffffff');
    expect(body.style.cssText).toContain('font:900 12px');
    expect(body.style.cssText).toContain('border:2px solid #D62828');
    const chevron = inner.children[1].children[0].children[0];
    expect(chevron.style.cssText).toContain('background:#ffffff');
    expect(inner.children[1].children[0].style.cssText).toContain('drop-shadow');
    expect(layer.markerFor('a').getElement().style.cssText).toContain('z-index: 70');
    // the heading rotates the arrow only, never the body
    stepFrame();
    expect(inner.children[1].style.transform).toBe('rotate(90deg)');
    expect(body.style.transform).toBeUndefined();
  });

  it('shows the arrow from the route bearing when the tracker has no heading yet', () => {
    const layer = make();
    layer.setBuses([{ ...bus('a', [-0.37, 39.47], null), directionKey: 'to-malvarosa', alongM: 500, snappedLonLat: [-0.3769, 39.4672] }]);
    const arrow = layer.markerFor('a').getElement().children[0].children[1];
    expect(arrow.style.display).toBe('block');
    expect(arrow.style.transform).toMatch(/^rotate\(-?[\d.]+deg\)$/);
  });

  it('hides the arrow when neither a heading nor a route is known', () => {
    const layer = make();
    layer.setBuses([bus('a', [-0.37, 39.47], null)]);
    expect(layer.markerFor('a').getElement().children[0].children[1].style.display).not.toBe('block');
  });

  it('rings and raises the selected bus only, and clears it', () => {
    const layer = make();
    layer.setBuses([bus('a', [-0.37, 39.47]), bus('b', [-0.36, 39.47])]);
    layer.setSelected('a');
    const a = layer.markerFor('a').getElement();
    const b = layer.markerFor('b').getElement();
    expect(a.style.zIndex).toBe('80');
    expect(a.children[0].style.transform).toBe('scale(1.25)');
    expect(a.children[0].children[2].style.boxShadow).toContain('#ffffff');
    expect(b.style.zIndex).toBe('70');
    layer.setSelected(null);
    expect(a.style.zIndex).toBe('70');
    expect(a.children[0].style.transform).toBe('');
  });
  it('applies a selection made before the marker existed', () => {
    const layer = make();
    layer.setSelected('a');
    layer.setBuses([bus('a', [-0.37, 39.47])]);
    expect(layer.markerFor('a').getElement().style.zIndex).toBe('80');
  });

  it('dims a bus whose fix is over 60 s old and hides its halo; a fresh fix restores it', () => {
    let t = 0;
    const layer = make({ now: () => t });
    t = 80000;
    layer.setBuses([{ ...bus('a', [-0.37, 39.47]), fixTimeMs: 0 }, { ...bus('b', [-0.36, 39.47]), fixTimeMs: 70000 }]);
    const a = layer.markerFor('a').getElement();
    const b = layer.markerFor('b').getElement();
    expect(a.style.filter).toBe('opacity(0.55)');
    expect(a.children[0].children[0].style.display).toBe('none');
    expect(b.style.filter).toBe('');
    expect(b.children[0].children[0].style.display).toBe('');
    t = 100000;
    layer.setBuses([{ ...bus('a', [-0.37, 39.47]), fixTimeMs: 99000 }]);
    expect(a.style.filter).toBe('');
    expect(a.children[0].children[0].style.display).toBe('');
  });

  it('does not dim exactly 60 s', () => {
    const layer = make({ now: () => 60000 });
    layer.setBuses([{ ...bus('a', [-0.37, 39.47]), fixTimeMs: 0 }]);
    expect(layer.markerFor('a').getElement().style.filter).toBe('');
  });

  it('emphasises only the next bus for the stop, with its label chip, and clears it', () => {
    const layer = make();
    layer.setBuses([bus('a', [-0.37, 39.47]), bus('b', [-0.36, 39.47])]);
    layer.setNextBus({ id: 'b', label: '3 stops away' });
    const inner = (id) => layer.markerFor(id).getElement().children[0];
    const [ringB, chipB] = [inner('b').children[3], inner('b').children[4]];
    expect(ringB.style.display).toBe('block');
    expect(chipB.style.display).toBe('block');
    expect(chipB.textContent).toBe('3 stops away');
    expect(inner('a').children[3].style.display).toBe('none');
    expect(inner('a').children[4].style.display).toBe('none');
    layer.setNextBus({ id: 'a', label: 'Next stop' });
    expect(inner('b').children[3].style.display).toBe('none');
    expect(inner('a').children[4].textContent).toBe('Next stop');
    layer.setNextBus(null);
    expect(inner('a').children[3].style.display).toBe('none');
  });

  it('applies a next-bus emphasis set before the marker existed, and keeps it separate from the selection ring', () => {
    const layer = make();
    layer.setNextBus({ id: 'a', label: 'Next stop' });
    layer.setBuses([bus('a', [-0.37, 39.47])]);
    const inner = layer.markerFor('a').getElement().children[0];
    expect(inner.children[3].style.display).toBe('block');
    expect(inner.children[2].style.boxShadow).not.toContain('#ffffff');
  });

  it('number font: big for 1-2 characters, smaller for 3+ so it never touches the ring', () => {
    expect(busNumberFontPx('19')).toBe(12);
    expect(busNumberFontPx('7')).toBe(12);
    expect(busNumberFontPx('192')).toBe(9);
  });
});
