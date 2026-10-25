import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import WalkBanner from './WalkBanner';

const station = { properties: { name: 'Colón' }, geometry: { type: 'Point', coordinates: [-0.3709, 39.4701] } };
// ~ 0.0045 deg lat is about 500 m
const at = (dLat) => ({ coordinates: [-0.3709, 39.4701 + dLat] });

describe('WalkBanner', () => {
  it('shows minutes, station and distance in the short tone', () => {
    const html = renderToStaticMarkup(<WalkBanner station={station} userLocation={at(0.0028)} onDismiss={() => {}} />);
    expect(html).toContain('data-tone="short"');
    expect(html).toContain('5 min walk');
    expect(html).toContain('Colón');
    expect(html).toContain('311 m');
    expect(html).toContain('aria-label="Close"');
  });
  it('uses medium and long tones for longer walks', () => {
    expect(renderToStaticMarkup(<WalkBanner station={station} userLocation={at(0.01)} />)).toContain('data-tone="medium"');
    expect(renderToStaticMarkup(<WalkBanner station={station} userLocation={at(0.03)} />)).toContain('data-tone="long"');
  });
  it('renders nothing without a fix', () => {
    expect(renderToStaticMarkup(<WalkBanner station={station} userLocation={null} />)).toBe('');
  });
});
