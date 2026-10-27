import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasMapSelection, fadesAllVehicles } from './selectionFocus';

const metro = { properties: { name: 'Xàtiva' } };

describe('hasMapSelection', () => {
  it('is true for a real metro station', () => {
    expect(hasMapSelection(metro, null)).toBe(true);
  });
  it('is true for a selected EMT bus stop', () => {
    expect(hasMapSelection(null, { stopCode: '2259' })).toBe(true);
  });
  it("is false for nothing, or for a ping / Where you're at pin", () => {
    expect(hasMapSelection(null, null)).toBe(false);
    expect(hasMapSelection({ isPin: true, properties: {} }, null)).toBe(false);
    expect(hasMapSelection({ properties: { name: 'Map Ping' } }, null)).toBe(false);
    expect(hasMapSelection({ properties: { name: "Where you're at" } }, null)).toBe(false);
  });
});

describe('selection CSS', () => {
  const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
  const zOf = (re) => Number(css.match(re)?.[1]);
  it('fades unselected markers while a selection exists', () => {
    expect(css).toMatch(/\[data-has-selection="true"\][^{]*\.metro-station-badge:not\(\.is-selected\)/);
    expect(css).toMatch(/\[data-has-selection="true"\][^{]*\.emt-stop-badge:not\(\.is-selected\)/);
  });
  it('draws the chosen focus node above the base markers (z-index 50)', () => {
    expect(zOf(/\.station-focus-node,\s*\.bus-focus-node\s*\{[^}]*z-index:\s*(\d+)/)).toBeGreaterThan(50);
  });
});

describe('fadesAllVehicles (#114)', () => {
  const metro = { properties: { name: 'Xàtiva', lines: ['3'] } };
  it('is true for an EMT stop with no metro station', () => {
    expect(fadesAllVehicles(null, { stopCode: '1802' })).toBe(true);
  });
  it('is true for a ping/hub with an EMT stop selected', () => {
    expect(fadesAllVehicles({ properties: { name: "Where you're at" } }, { stopCode: '1' })).toBe(true);
  });
  it('is false for a metro station (line rule applies) or no selection', () => {
    expect(fadesAllVehicles(metro, null)).toBe(false);
    expect(fadesAllVehicles(null, null)).toBe(false);
  });
});
