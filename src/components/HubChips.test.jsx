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
  it('renders a dismissible chip per active line', () => {
    const html = renderToStaticMarkup(<HubChips activeLines={['3', '1']} />);
    expect(html.match(/hub-chip-line"/g)).toHaveLength(2);
    expect(html.indexOf('>1<')).toBeLessThan(html.indexOf('>3<'));
  });
  it('renders nothing when empty', () => {
    expect(renderToStaticMarkup(<HubChips />)).toBe('');
    expect(renderToStaticMarkup(<HubChips activeLines={[]} />)).toBe('');
  });
});
