// What the search bar finds for a query and what picking a result hands on (#137, #138), kept apart from the
// component so the same objects a map tap passes can be tested without a browser. Accent-insensitive fuzzy match.
import { searchFuzzy } from './fuzzySearch';

/** A stop code is a search key too; results are capped so a short query does not list hundreds. */
export const MAX_BUS_STOP_RESULTS = 8;

/**
 * @param {{ query: string, lines: object[], busLines: object[], stations: object[], busStops: object[] }} sources
 * @returns {{ filteredLines: object[], filteredBusLines: object[], filteredStations: object[], filteredBusStops: object[],
 *   allItems: { type: 'line'|'busLine'|'station'|'busStop', data: object }[] }}
 *   allItems is the flat order keyboard navigation walks: lines, bus lines, stations, bus stops.
 */
export const buildSearchResults = ({ query, lines, busLines, stations, busStops }) => {
  const q = query.trim();
  const filteredLines = q
    ? searchFuzzy(lines, query, l => `${l.properties.name} Line ${l.properties.line} Linia ${l.properties.line}`)
    : [];
  const filteredBusLines = q
    ? searchFuzzy(busLines, query, b => `${b.id} ${b.name} Bus ${b.id} EMT ${b.id} Linia ${b.id}`)
    : [];
  const filteredStations = q ? searchFuzzy(stations, query, st => st.properties.name) : [];
  const filteredBusStops = q
    ? searchFuzzy(busStops, query, s => `${s.stopCode} ${s.stopName}`).slice(0, MAX_BUS_STOP_RESULTS)
    : [];

  const allItems = [
    ...filteredLines.map(data => ({ type: 'line', data })),
    ...filteredBusLines.map(data => ({ type: 'busLine', data })),
    ...filteredStations.map(data => ({ type: 'station', data })),
    ...filteredBusStops.map(data => ({ type: 'busStop', data })),
  ];
  return { filteredLines, filteredBusLines, filteredStations, filteredBusStops, allItems };
};

/**
 * Hands a picked result to the handler for its type, unchanged: the very object a map tap passes.
 * A type with no handler does nothing (it is never mistaken for another type).
 */
export const selectResult = (item, handlers) => handlers[item.type]?.(item.data);
