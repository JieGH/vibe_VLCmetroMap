import { describe, it, expect } from 'vitest';
import { arrivalStore, STATION_ID_MAP } from './arrivalStore';

// Ayora, Amistat and Aragó looked endpoint-less because their API ids (22, 23,
// 24) sit far below the 112-121 range the rest of the eastern L5/L7 stations
// use, so a sequential probe of that range never reached them. Confirmed live
// against the API and by correlating the same vehicle's timestamps across
// adjacent stations in both directions of travel (see issue #3).
describe('the eastern L5/L7 stations once thought to have no live endpoint', () => {
  it('resolves Ayora, Amistat and Aragó to their API ids', () => {
    expect(STATION_ID_MAP['Ayora']).toBe(22);
    expect(STATION_ID_MAP['Amistat']).toBe(23);
    expect(STATION_ID_MAP['Aragó']).toBe(24);
  });

  it('no longer reports a missing endpoint for these stations', () => {
    for (const name of ['Ayora', 'Amistat', 'Aragó']) {
      expect(arrivalStore.getStationApiId({ name })).not.toBeNull();
    }
  });
});
