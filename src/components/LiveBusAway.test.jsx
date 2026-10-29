import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

const found = { current: null };
const empty = { current: false };
vi.mock('../services/useBusFleet', () => ({ useNearestApproachingBus: () => found.current, useClaimNextBus: () => {}, useLiveFleetEmpty: () => empty.current }));
import LiveBusAway from './LiveBusAway';

describe('LiveBusAway', () => {
  it('renders nothing when no bus is approaching (row looks as today)', () => {
    found.current = null;
    expect(renderToStaticMarkup(<LiveBusAway stopCode="18" />)).toBe('');
  });
  it('shows plural stops away with an accessible label', () => {
    found.current = { bus: { id: 'bus-1' }, stopsAway: 3, distanceM: 900 };
    const html = renderToStaticMarkup(<LiveBusAway stopCode="18" />);
    expect(html).toContain('data-testid="live-bus-away"');
    expect(html).toContain('3 stops away');
    expect(html).toContain('aria-label="Nearest line 19 bus: 3 stops away"');
  });
  it('handles singular and next stop', () => {
    found.current = { bus: { id: 'bus-1' }, stopsAway: 1, distanceM: 300 };
    expect(renderToStaticMarkup(<LiveBusAway stopCode="18" />)).toContain('1 stop away');
    found.current = { bus: { id: 'bus-1' }, stopsAway: 0, distanceM: 50 };
    expect(renderToStaticMarkup(<LiveBusAway stopCode="18" />)).toContain('Next stop');
  });
  it('reserves a quiet, text-free slot for line 19 rows when there is no bus', () => {
    found.current = null;
    const html = renderToStaticMarkup(<LiveBusAway stopCode="722" reserve />);
    expect(html).toContain('data-testid="live-bus-slot"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toMatch(/>[^<]+</);
  });
  it('does not reserve a slot when the row cannot be mapped to a direction', () => {
    found.current = null;
    expect(renderToStaticMarkup(<LiveBusAway stopCode="18" destination="Aeroport" reserve />)).toBe('');
  });
  it('the reserved slot has the same box with or without a bus', () => {
    const box = (h) => h.match(/(?:min-height|width):[^;"]+/g);
    found.current = null;
    const empty = renderToStaticMarkup(<LiveBusAway stopCode="722" reserve compact />);
    found.current = { bus: { id: 'bus-1' }, stopsAway: 3, distanceM: 900 };
    const full = renderToStaticMarkup(<LiveBusAway stopCode="722" reserve compact />);
    expect(box(empty)).toEqual(box(full));
    expect(full).toContain('3 stops away');
  });

  it('shows a quiet no-live-buses note in the reserved slot only when the fleet answered empty', () => {
    found.current = null;
    empty.current = false;
    expect(renderToStaticMarkup(<LiveBusAway stopCode="722" reserve />)).not.toContain('live-bus-empty');
    empty.current = true;
    const html = renderToStaticMarkup(<LiveBusAway stopCode="722" reserve />);
    expect(html).toContain('data-testid="live-bus-empty"');
    expect(html).toContain('No live buses now');
    // same box as the silent slot
    expect(html).toContain('min-height:14px');
    // never while a bus is tracked, never on rows without a mapped direction or without the reserved slot
    found.current = { bus: { id: 'bus-1' }, stopsAway: 2, distanceM: 600 };
    expect(renderToStaticMarkup(<LiveBusAway stopCode="722" reserve />)).not.toContain('live-bus-empty');
    found.current = null;
    expect(renderToStaticMarkup(<LiveBusAway stopCode="18" destination="Aeroport" reserve />)).toBe('');
    expect(renderToStaticMarkup(<LiveBusAway stopCode="722" />)).toBe('');
    empty.current = false;
  });
});
