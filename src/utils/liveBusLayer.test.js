import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLiveBusLayer } from './liveBusLayer';

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
    expect(inner.children.map((c) => c.className)).toEqual(['live-bus-fleet-halo', 'live-bus-fleet-arrow', 'live-bus-fleet-badge']);
    const body = inner.children[2];
    expect(body.style.cssText).toContain('border-radius:50%');
    expect(body.children.map((c) => c.className)).toEqual(['live-bus-fleet-line']);
    expect(body.children[0].textContent).toBe('19');
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
});
