import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import HubChips from './HubChips';
import { COMMON_STOPS, COMMON_STOP_NAMES } from '../utils/commonStops';

describe('commonStops', () => {
  it('resolves every popular stop in order', () => {
    expect(COMMON_STOPS.map((s) => s.properties.name)).toEqual(COMMON_STOP_NAMES);
  });
});

describe('HubChips', () => {
  it('renders a chip per hub and marks the selected one', () => {
    const html = renderToStaticMarkup(<HubChips hubs={COMMON_STOPS} selectedName="Colón" />);
    for (const n of COMMON_STOP_NAMES) expect(html).toContain(n);
    expect(html.match(/data-selected="true"/g)).toHaveLength(1);
  });
  it('leads with a dismissible chip per active line', () => {
    const html = renderToStaticMarkup(<HubChips hubs={COMMON_STOPS} activeLines={['3', '1']} />);
    expect(html.match(/hub-chip-line"/g)).toHaveLength(2);
    expect(html.indexOf('>1<')).toBeLessThan(html.indexOf('>3<'));
    expect(html.indexOf('hub-chip-line')).toBeLessThan(html.indexOf('Grau'));
  });
  it('renders nothing when empty', () => {
    expect(renderToStaticMarkup(<HubChips />)).toBe('');
  });
});
