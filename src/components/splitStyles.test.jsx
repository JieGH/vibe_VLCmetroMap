import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { SPLIT_HEADER, SPLIT_TICK, badgeGridStyle, splitHeaderBoxStyle, timeUnitStyle } from './splitStyles';
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

describe('#113 split-view minute tick', () => {
  it('tick is at least the digit size, tight, no extra line height, inherits the number colour', () => {
    expect(parseFloat(SPLIT_TICK.fontSize)).toBeGreaterThanOrEqual(1);
    expect(parseFloat(SPLIT_TICK.fontSize)).toBeLessThanOrEqual(1.3);
    expect(SPLIT_TICK).toMatchObject({ marginLeft: 0, lineHeight: 0, color: 'inherit' });
  });

  it('timeUnitStyle: tick only for compact minutes; seconds and detail views keep the unit style', () => {
    expect(timeUnitStyle({ compact: true, unit: 'min', baseFontSize: '0.70rem' })).toEqual(SPLIT_TICK);
    const sec = timeUnitStyle({ compact: true, unit: 'sec', baseFontSize: '0.70rem' });
    expect(sec).toEqual({ fontSize: '0.70rem', marginLeft: 2, color: 'var(--text-secondary)' });
    expect(timeUnitStyle({ compact: false, unit: 'min', baseFontSize: '0.70rem' })).toEqual(sec);
  });

  it('renders ′ with the tick style in compact mode and "min" in detail mode, both columns', () => {
    const tick = 'font-size:1.2em;line-height:0;margin-left:0;color:inherit';
    const bus = renderToStaticMarkup(<ConnectingBusSection feeders={feeders} compact theme="dark" />);
    const metro = renderToStaticMarkup(<CompactMetroSection nearbyMetro={nearbyMetro} compact isPinMode theme="dark" />);
    for (const html of [bus, metro]) {
      expect(html).toContain(tick);
      expect(html).toContain('′');
    }
    const busFull = renderToStaticMarkup(<ConnectingBusSection feeders={feeders} theme="dark" />);
    expect(busFull).toContain('min');
    expect(busFull).not.toContain('′');
    expect(busFull).not.toContain(tick);
  });
});

describe('metro walk radius wording', () => {
  it('"Also within N min walk" shows the minutes of the 320 m metro radius (5, rounded up)', () => {
    const html = renderToStaticMarkup(<CompactMetroSection stationName="Colón" arrivals={[{ line: '3', destination: 'A', seconds: 120 }]} nearbyMetro={nearbyMetro} theme="dark" />);
    expect(html).toContain('Also within 5 min walk');
  });
});

describe('split-view station line badges', () => {
  const station = (lines) => [{ name: 'Marítim', walkMin: 3, lines, arrivals: [{ line: '7', destination: 'T', seconds: 120 }] }];
  const render = (lines, compact = true) =>
    renderToStaticMarkup(<CompactMetroSection nearbyMetro={station(lines)} compact={compact} isPinMode theme="dark" />);

  it('badgeGridStyle: 1-2 lines in a row, 3-4 in a 2x2 grid, 5 or more in a 3x3 grid, never stacked outside the split view', () => {
    expect(badgeGridStyle(true, 1).display).toBe('flex');
    expect(badgeGridStyle(true, 2).display).toBe('flex');
    expect(badgeGridStyle(true, 3)).toMatchObject({ display: 'grid', gridTemplateColumns: 'repeat(2, 16px)' });
    expect(badgeGridStyle(true, 4)).toMatchObject({ display: 'grid', gridTemplateColumns: 'repeat(2, 16px)' });
    expect(badgeGridStyle(true, 5)).toMatchObject({ display: 'grid', gridTemplateColumns: 'repeat(3, 16px)' });
    expect(badgeGridStyle(true, 9)).toMatchObject({ gridTemplateColumns: 'repeat(3, 16px)' });
    expect(badgeGridStyle(false, 6).display).toBe('flex');
  });

  it('renders the grid in the compact split view and a row otherwise', () => {
    expect(render(['5', '7', '6', '8'])).toContain('grid-template-columns:repeat(2, 16px)');
    expect(render(['5', '7', '6', '8', '3'])).toContain('grid-template-columns:repeat(3, 16px)');
    expect(render(['5', '7'])).not.toContain('grid-template-columns');
    expect(render(['5', '7', '6', '8'], false)).not.toContain('grid-template-columns');
  });
});
