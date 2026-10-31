import landmarks from '../data/landmarks.json';
import { normalizeAccents } from '../utils/fuzzySearch';

const words = value => normalizeAccents(value).replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
const index = landmarks.places.map(place => ({
  place,
  names: words(place.name),
  other: words([place.address, ...(place.aliases || [])].join(' ')),
}));
const stopWords = new Set(['de', 'del', 'la', 'el', 'les', 'los', 'l', 'd', 'of', 'the']);

const withinEdits = (left, right, limit) => {
  if (Math.abs(left.length - right.length) > limit) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, i) => i);
  for (let i = 1; i <= left.length; i += 1) {
    const row = [i];
    for (let j = 1; j <= right.length; j += 1) {
      row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous = row;
  }
  return previous[right.length] <= limit;
};
const matchWord = (query, target) => {
  if (query === target) return 100;
  if (target.startsWith(query)) return 80;
  if (query.length >= 4 && withinEdits(query, target, query.length >= 8 ? 2 : 1)) return 50;
  return 0;
};

/** Refetchable official place data makes named libraries searchable even without a network. */
export const searchLocalPlaces = query => {
  if (query.trim().length < 3) return [];
  const tokens = words(query).filter(token => !stopWords.has(token));
  if (tokens.length === 0) return [];
  return index.map(entry => {
    const scores = tokens.map(token => Math.max(0,
      ...entry.names.map(word => matchWord(token, word)),
      ...entry.other.map(word => Math.max(0, matchWord(token, word) - 20)),
    ));
    return { place: entry.place, score: scores.every(score => score > 0) ? scores.reduce((a, b) => a + b, 0) : 0 };
  }).filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.place.name.length - b.place.name.length)
    .slice(0, 8).map(entry => entry.place);
};

/** Search only places; choosing a result never changes User Location. */
export const searchPlaces = async (query, {
  coordinates,
  signal,
  fetchImpl = globalThis.fetch,
  baseUrl = import.meta.env.VITE_NAVIGATION_API_URL || '',
} = {}) => {
  const q = query.trim();
  if (q.length < 3) return [];
  const params = new URLSearchParams({ q });
  if (Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every(Number.isFinite)) {
    params.set('lon', coordinates[0]);
    params.set('lat', coordinates[1]);
  }
  const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/places?${params}`, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('place-search-unavailable');
  const result = await response.json();
  if (!Array.isArray(result.places)) throw new Error('place-search-unavailable');
  return result.places.filter(place => (
    place && typeof place.id === 'string' && typeof place.name === 'string' && place.name.trim() &&
    Array.isArray(place.coordinates) && place.coordinates.length === 2 && place.coordinates.every(Number.isFinite) &&
    Math.abs(place.coordinates[0]) <= 180 && Math.abs(place.coordinates[1]) <= 90
  ));
};

/** A typing session owns its debounce and request, including providers that ignore abort. */
export const createPlaceSearchSession = ({ search = searchPlaces, localSearch = searchLocalPlaces, onChange, delayMs = 250 }) => {
  let timer;
  let controller;
  let revision = 0;
  const cancel = () => {
    revision += 1;
    clearTimeout(timer);
    controller?.abort();
  };
  return {
    query(value, coordinates) {
      cancel();
      const query = value.trim();
      const current = revision;
      const request = new AbortController();
      controller = request;
      const localPlaces = localSearch(query);
      onChange({ query, places: localPlaces, status: query.length < 3 ? 'idle' : 'loading' });
      if (query.length < 3) return;
      timer = setTimeout(async () => {
        try {
          const remotePlaces = await search(query, { coordinates, signal: request.signal });
          const places = [...new Map([...localPlaces, ...remotePlaces].map(place => [place.id, place])).values()].slice(0, 8);
          if (current === revision) onChange({ query, places, status: 'ready' });
        } catch {
          if (current === revision) onChange({ query, places: localPlaces, status: 'unavailable' });
        }
      }, delayMs);
    },
    dispose: cancel,
  };
};
