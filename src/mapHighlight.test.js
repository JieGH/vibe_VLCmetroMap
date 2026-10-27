import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { getAllBusStops, getStopDisplayCoordinates } from './data/emtData';

const css = readFileSync(new URL('./index.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const mapView = readFileSync(new URL('./components/MapView.jsx', import.meta.url), 'utf8');

const bodyOf = (selector) => {
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1].split(',').map((s) => s.trim()).includes(selector)) return m[2];
  }
  return '';
};

describe('selected marker highlight (#92)', () => {
  it.each(['.metro-station-badge.is-selected', '.emt-stop-badge.is-selected'])(
    '%s is magnified 1.35x, elevated to z-index 50, white-rimmed and pulsing',
    (selector) => {
      const rule = bodyOf(selector);
      expect(rule).toMatch(/transform:\s*scale\(1\.35\)/);
      expect(rule).toMatch(/z-index:\s*50/);
      expect(rule).toMatch(/border:\s*1\.5px solid #ffffff/);
      expect(rule).toMatch(/opacity:\s*1(\.0)?\s*!important/);
      expect(rule).toMatch(/animation:\s*\w+/);
    }
  );

  it('the pulse keyframes keep the 1.35x base scale and only grow from it', () => {
    for (const name of ['metroStationPulse', 'busStopPulse']) {
      const block = css.match(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?\\})\\s*\\}`))?.[1] ?? '';
      expect(block).toContain('scale(1.35)');
      expect(block).toContain('scale(1.42)');
    }
  });
});

describe('selected marker is the topmost symbol (#99)', () => {
  const z = (selector) => Number(bodyOf(selector).match(/z-index:\s*(\d+)/)?.[1]);

  it('selected badges (50) sit above the unselected metro (27) and EMT (26) markers', () => {
    expect(z('.emt-stop-badge.is-selected')).toBeGreaterThan(27);
    expect(mapView).toMatch(/isSelectedStation \? '50' : '27'/);
  });

  it('the selected focus node (1300) is above the spawned nodes (1150) and the plain focus node (1200)', () => {
    expect(z('.station-focus-node:not(.spawned-station-node)')).toBe(1300);
    expect(z('.bus-focus-node:not(.spawned-bus-node)')).toBe(1300);
    expect(z('.station-focus-node')).toBe(1200);
    expect(z('.spawned-station-node')).toBe(1150);
  });

  it('fade applies to everything else at 0.35-0.45 and is scoped to data-has-selection only', () => {
    const rule = bodyOf('.map-container[data-has-selection="true"] .metro-station-badge:not(.is-selected)');
    const opacity = Number(rule.match(/opacity:\s*([\d.]+)/)?.[1]);
    expect(opacity).toBeGreaterThanOrEqual(0.35);
    expect(opacity).toBeLessThanOrEqual(0.45);
    // the fade never exists outside the attribute, so deselecting (attribute removed) restores markers
    expect(css).not.toMatch(/(^|\})\s*\.(metro-station-badge|emt-stop-badge):not\(\.is-selected\)\s*\{[^}]*opacity:\s*0\.[34]/);
  });
});

describe('stop display offsets are display-only (#106)', () => {
  it('keeps real coordinates on the stop objects and never moves a drawn stop beyond 12 m', () => {
    const stops = getAllBusStops();
    const before = JSON.stringify(stops.slice(0, 50).map((s) => s.coordinates));
    let moved = 0;
    for (const s of stops) {
      const [lng, lat] = getStopDisplayCoordinates(s);
      const [rl, rt] = s.coordinates;
      const dx = (lng - rl) * 111320 * Math.cos((rt * Math.PI) / 180);
      const dy = (lat - rt) * 110540;
      const d = Math.hypot(dx, dy);
      expect(d).toBeLessThanOrEqual(12.5);
      if (d > 0.01) moved += 1;
    }
    expect(moved).toBeGreaterThan(0);
    expect(JSON.stringify(stops.slice(0, 50).map((s) => s.coordinates))).toBe(before);
  });
});
