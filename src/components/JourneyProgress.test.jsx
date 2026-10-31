import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import JourneyProgress from './JourneyProgress';

const leg = {
  id: 'ride', mode: 'METRO', startTime: 1000, endTime: 5000,
  from: { name: 'Xàtiva' }, to: { name: 'Benimaclet' },
  intermediateStops: [{ name: 'Alameda', arrivalTime: 3000 }], route: { shortName: '3' },
};

describe('passenger Journey Progress', () => {
  it('labels estimated progress and provides explicit boarding and correction controls', () => {
    const html = renderToStaticMarkup(<JourneyProgress snapshot={{
      status: 'active', journey: { legs: [leg] }, legIndex: 0, callIndex: 0,
      progressSource: 'estimated', boardingConfirmed: false, remainingCalls: 2,
      nativeStatus: 'foreground-only',
    }} />);
    expect(html).toContain('Journey progress is estimated');
    expect(html).toContain('name="currentCall"');
    expect(html).toContain('name="confirmBoarding"');
    expect(html).toContain('Alameda');
    expect(html).toContain('Keep the app visible');
    expect(html).not.toContain('Locked-phone guidance active');
  });
});
