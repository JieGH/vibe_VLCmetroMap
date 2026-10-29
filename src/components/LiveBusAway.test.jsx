import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';

const found = { current: null };
vi.mock('../services/useBusFleet', () => ({ useNearestApproachingBus: () => found.current }));
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
});
