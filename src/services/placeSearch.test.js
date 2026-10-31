import { describe, expect, it, vi } from 'vitest';
import { createPlaceSearchSession, searchLocalPlaces, searchPlaces } from './placeSearch';

const library = {
  id: 'photon:W:251', name: 'Biblioteca Històrica',
  address: 'Carrer de la Universitat 2, València',
  coordinates: [-0.3698, 39.4694], source: 'photon', attribution: '© OpenStreetMap contributors',
};

describe('Destination search', () => {
  it('finds the real university historical library despite a typo, with its published coordinates', () => {
    const matches = searchLocalPlaces('Bibliotca Històrica');
    const universityLibrary = matches.find(place => place.source === 'uv-library-directory' && place.name === 'Biblioteca Histórica');
    expect(universityLibrary).toMatchObject({
      name: 'Biblioteca Histórica', coordinates: [-0.3735298, 39.4721915],
      address: 'C/ Universitat, 2 | C/ la Nau, 2, 46003 València',
    });
    expect(searchLocalPlaces('university library').some(place => place.source === 'uv-library-directory')).toBe(true);
  });

  it('keeps real local landmarks available while external street search is unavailable', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const session = createPlaceSearchSession({ search: async () => { throw new Error('offline'); }, onChange });
    try {
      session.query('Bibliotca Històrica');
      expect(onChange.mock.lastCall[0].places.some(place => place.source === 'uv-library-directory')).toBe(true);
      await vi.advanceTimersByTimeAsync(250);
      expect(onChange.mock.lastCall[0].status).toBe('unavailable');
      expect(onChange.mock.lastCall[0].places.some(place => place.name === 'Biblioteca Histórica')).toBe(true);
    } finally {
      session.dispose();
      vi.useRealTimers();
    }
  });

  it('finds a named landmark without changing the passenger location', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ places: [library] })));
    const coordinates = [-0.376, 39.47];
    const result = await searchPlaces('biblioteca', { fetchImpl, coordinates });
    expect(result).toEqual([library]);
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('/api/places?q=biblioteca&lon=-0.376&lat=39.47');
    expect(coordinates).toEqual([-0.376, 39.47]);
  });

  it('only presents the latest query when responses arrive out of order', async () => {
    vi.useFakeTimers();
    const pending = [];
    const onChange = vi.fn();
    const search = vi.fn((query, options) => new Promise(resolve => pending.push({ query, options, resolve })));
    const session = createPlaceSearchSession({ search, localSearch: () => [], onChange });
    try {
      session.query('biblioteca');
      await vi.advanceTimersByTimeAsync(250);
      session.query('universitat');
      await vi.advanceTimersByTimeAsync(250);
      expect(pending[0].options.signal.aborted).toBe(true);
      pending[1].resolve([library]);
      await vi.advanceTimersByTimeAsync(0);
      pending[0].resolve([{ ...library, name: 'Old result' }]);
      await vi.advanceTimersByTimeAsync(0);
      expect(onChange.mock.lastCall[0]).toEqual({ query: 'universitat', places: [library], status: 'ready' });
      expect(onChange.mock.calls.some(([state]) => state.places.some(place => place.name === 'Old result'))).toBe(false);
    } finally {
      session.dispose();
      vi.useRealTimers();
    }
  });

  it('does not present invalid provider places as selectable Destinations', async () => {
    const fetchImpl = async () => new Response(JSON.stringify({ places: [
      library,
      { ...library, id: 'missing', coordinates: null },
      { ...library, id: 'invalid', coordinates: [1800, 390] },
      { ...library, id: 'unnamed', name: '' },
    ] }));
    expect(await searchPlaces('biblioteca', { fetchImpl })).toEqual([library]);
  });

  it('debounces typing, avoids short queries, and cancels search when the overlay closes', async () => {
    vi.useFakeTimers();
    const search = vi.fn(async () => [library]);
    const onChange = vi.fn();
    const session = createPlaceSearchSession({ search, onChange });
    try {
      session.query('bi');
      await vi.advanceTimersByTimeAsync(300);
      expect(search).not.toHaveBeenCalled();
      session.query('bib');
      await vi.advanceTimersByTimeAsync(100);
      session.query('biblioteca');
      await vi.advanceTimersByTimeAsync(250);
      expect(search).toHaveBeenCalledTimes(1);
      expect(search.mock.calls[0][0]).toBe('biblioteca');
      expect(search.mock.calls[0][1].coordinates).toBeUndefined();
      session.query('universitat');
      session.dispose();
      await vi.advanceTimersByTimeAsync(300);
      expect(search).toHaveBeenCalledTimes(1);
    } finally {
      session.dispose();
      vi.useRealTimers();
    }
  });

  it('keeps an unavailable search distinct from an empty successful search', async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const fetchImpl = async () => new Response('{}', { status: 503 });
    const session = createPlaceSearchSession({ search: (query, options) => searchPlaces(query, { ...options, fetchImpl }), localSearch: () => [], onChange });
    try {
      session.query('biblioteca');
      await vi.advanceTimersByTimeAsync(250);
      expect(onChange.mock.lastCall[0]).toEqual({ query: 'biblioteca', places: [], status: 'unavailable' });
    } finally {
      session.dispose();
      vi.useRealTimers();
    }
  });
});
