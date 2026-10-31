import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import JourneyPlanner, { JourneyResults } from './JourneyPlanner';

const destination = { name: 'Biblioteca Pública', coordinates: [-0.38, 39.47] };

describe('Journey planning presentation', () => {
  it('offers a manual Starting Point without location permission and previews the chosen Destination', () => {
    const html = renderToStaticMarkup(
      <JourneyPlanner destination={destination} onClose={() => {}} onStartJourney={() => {}} />,
    );
    expect(html).toContain('Biblioteca Pública');
    expect(html).toContain('Xàtiva');
    expect(html).toContain('name="startingPoint"');
    expect(html).toContain('Choose a station');
    expect(html).toContain('Your starting point and destination are sent');
  });

  it('offers an optional alert sound setting without enabling it by default', () => {
    const html = renderToStaticMarkup(<JourneyPlanner destination={destination} />);
    expect(html).toContain('name="soundEnabled"');
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('checked=""');
  });

  it('presents ordered pedestrian and rail portions without claiming the scheduled departure is live', () => {
    const html = renderToStaticMarkup(
      <JourneyResults
        result={{ status: 'ok', journeys: [{
          id: 'journey-1', durationSeconds: 1200, walkDistanceMetres: 350, transfers: 0,
          legs: [
            { id: 'walk-1', mode: 'WALK', from: { name: 'Starting street' }, to: { name: 'Xàtiva' }, startTime: 1_000_000, endTime: 1_300_000, departureSource: 'scheduled' },
            { id: 'rail-1', mode: 'METRO', from: { name: 'Xàtiva' }, to: { name: 'Àngel Guimerà' }, startTime: 1_360_000, endTime: 2_200_000, route: { shortName: '3', headsign: 'Aeroport' }, departureSource: 'scheduled' },
          ],
        }] }}
        onStartJourney={() => {}}
      />,
    );
    expect(html.indexOf('Starting street')).toBeLessThan(html.indexOf('Àngel Guimerà'));
    expect(html).toContain('Aeroport');
    expect(html).toContain('data-departure-source="scheduled"');
    expect(html).not.toContain('data-departure-source="live"');
    expect(html).toContain('type="button"');
  });

  it('explains the walking limit without silently starting or selecting a longer Journey', () => {
    const html = renderToStaticMarkup(
      <JourneyResults result={{ status: 'walking-limit', journeys: [] }} onStartJourney={() => {}} onAllowLongerWalk={() => {}} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain('name="allowLongerWalk"');
    expect(html).toContain('15-minute walking limit');
    expect(html).not.toContain('Start journey');
  });
});
