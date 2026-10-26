import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasMapSelection } from './selectionFocus';

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
  it('draws the selected focus node above spawned walk-radius nodes', () => {
    const selected = zOf(/\.station-focus-node:not\(\.spawned-station-node\)[^{]*\{[^}]*z-index:\s*(\d+)/);
    const spawned = zOf(/\.spawned-station-node[^{]*\{[^}]*z-index:\s*(\d+)/);
    expect(selected).toBeGreaterThan(spawned);
  });
});
