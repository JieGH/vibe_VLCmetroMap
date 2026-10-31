import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import JourneyArrivals, { JourneyArrivalContent } from './JourneyArrivals';
import { createJourneyArrivals } from '../services/journeyArrivals';

const NOW = Date.parse('2026-10-31T17:00:00Z');
const leg = { id: 'rail-1', mode: 'METRO', startTime: NOW + 300000, endTime: NOW + 600000,
  from: { name: 'Àngel Guimerà', stopId: 'metrovalencia:25' }, to: { name: 'Benimaclet', stopId: 'metrovalencia:67' },
  route: { shortName: '3', headsign: 'Rafelbunyol' }, intermediateStops: [] };

describe('Journey Arrival information', () => {
  it('renders cached rail immediately beside scheduled time and makes uncertainty explicit without fetching', () => {
    const fetchBusArrivals = vi.fn();
    const getStationArrivals = vi.fn();
    const controllerFactory = () => createJourneyArrivals({ now: () => NOW, fetchBusArrivals,
      railMemory: { subscribe: () => () => {}, getStationArrivals, getCachedArrivals: () => ({ fetchedAt: NOW, isFresh: true,
        arrivals: [{ line: '3', destination: 'Rafelbunyol', targetTimestamp: NOW + 180000, isLive: true }] }) } });
    const html = renderToStaticMarkup(<JourneyArrivals journey={{ id: 'journey', legs: [leg] }} controllerFactory={controllerFactory} />);
    expect(html).toContain('Àngel Guimerà');
    expect(html).toContain('data-arrival-source="scheduled"');
    expect(html).toContain('data-arrival-source="live"');
    expect(html).toContain('3 min');
    expect(html).toContain('not a confirmed match');
    expect(html).toContain('Refresh arrivals');
    expect(getStationArrivals).not.toHaveBeenCalled();
    expect(fetchBusArrivals).not.toHaveBeenCalled();
  });

  it('keeps stale Line predictions, scheduled information, and refresh failure distinguishable', () => {
    const html = renderToStaticMarkup(<JourneyArrivalContent snapshot={{ stop: leg.from, line: '3', scheduledTime: NOW,
      predictions: [{ line: '3', destination: 'Rafelbunyol', seconds: 120, targetTimestamp: NOW + 120000, source: 'stale' }],
      isLoading: false, error: 'unavailable' }} onRefresh={() => {}} />);
    expect(html).toContain('data-arrival-source="stale"');
    expect(html).toContain('data-arrival-source="scheduled"');
    expect(html).toContain('times remain scheduled');
    expect(html).toContain('not a confirmed match');
  });
});
