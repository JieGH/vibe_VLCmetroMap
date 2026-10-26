import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { SPLIT_HEADER, splitHeaderBoxStyle } from './splitStyles';
import ConnectingBusSection from './ConnectingBusSection';
import CompactMetroSection from './CompactMetroSection';

const feeders = [{ stopCode: 'P-2261', stopName: 'X', walkMin: 2, lines: ['6'], arrivals: [{ line: '6', destination: 'T', dueSeconds: 300, minutes: 5 }] }];
const nearbyMetro = [{ name: 'Xàtiva', walkMin: 3, lines: ['3'], arrivals: [{ line: '3', destination: 'A', seconds: 420 }] }];

describe('#112 split-view headers', () => {
  it('are smaller than the old 0.74rem / 15px / 0.60rem / 0.58rem values', () => {
    expect(parseFloat(SPLIT_HEADER.titleFontSize)).toBeLessThan(0.74 * 0.9);
    expect(parseFloat(SPLIT_HEADER.titleFontSize)).toBeGreaterThan(0.74 * 0.8);
    expect(SPLIT_HEADER.metroBadge.size).toBeLessThan(15);
    expect(parseFloat(SPLIT_HEADER.emtBadge.fontSize)).toBeLessThan(0.58);
  });

  it('compact header is sticky, opaque and keeps the separator', () => {
    const s = splitHeaderBoxStyle(true);
    expect(s).toMatchObject({ position: 'sticky', top: 0, background: 'var(--bg-panel-solid)' });
    expect(s.borderBottom).toContain('1px solid');
    expect(splitHeaderBoxStyle(false).position).toBeUndefined();
  });

  it('both columns render the same sticky header box in compact mode only', () => {
    const bus = renderToStaticMarkup(<ConnectingBusSection feeders={feeders} compact theme="dark" />);
    const metro = renderToStaticMarkup(<CompactMetroSection nearbyMetro={nearbyMetro} compact isPinMode theme="dark" />);
    for (const html of [bus, metro]) {
      expect(html).toContain('position:sticky;top:0');
      expect(html).toContain('background:var(--bg-panel-solid)');
      expect(html).toContain('padding:1px 4px 4px');
    }
    const busFull = renderToStaticMarkup(<ConnectingBusSection feeders={feeders} theme="dark" />);
    expect(busFull).not.toContain('position:sticky');
  });
});
