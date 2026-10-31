import { describe, it, expect, vi } from 'vitest';
import gtfsData from '../data/gtfs_expanded.json';
import metroData from '../data/metro_lines.json';
import { getRealBusLines, getAllBusStops } from '../data/emtData';
import { buildSearchResults, selectResult, MAX_BUS_STOP_RESULTS } from './searchResults';

const sources = {
  lines: metroData.features.filter(f => f.geometry.type === 'LineString'),
  busLines: getRealBusLines(),
  stations: gtfsData.features.filter(f => f.geometry.type === 'Point'),
  busStops: getAllBusStops(),
};
const search = (query) => buildSearchResults({ query, ...sources });

describe('search results (#137, #138)', () => {
  it('offers place Destinations alongside transit and selects the intended ambiguous match', () => {
    const places = [
      { id: 'library-1', name: 'Biblioteca', address: 'Carrer Major 1', coordinates: [-0.37, 39.47] },
      { id: 'library-2', name: 'Biblioteca', address: 'Carrer Major 2', coordinates: [-0.38, 39.48] },
    ];
    const { allItems } = buildSearchResults({ query: 'Biblioteca', ...sources, places });
    const destinations = allItems.filter(item => item.type === 'destination');
    expect(destinations.map(item => item.data.address)).toEqual(['Carrer Major 1', 'Carrer Major 2']);
    const onDestination = vi.fn();
    const onStation = vi.fn();
    selectResult(destinations[1], { destination: onDestination, station: onStation });
    expect(onDestination).toHaveBeenCalledWith(places[1]);
    expect(onStation).not.toHaveBeenCalled();
  });

  it('finds Colón as a station, accent-insensitively, and hands on the feed feature itself', () => {
    const { allItems } = search('Colon');
    const item = allItems.find(i => i.type === 'station' && i.data.properties.name === 'Colón');
    expect(item).toBeTruthy();
    const onStation = vi.fn();
    selectResult(item, { station: onStation });
    expect(onStation).toHaveBeenCalledTimes(1);
    expect(onStation.mock.calls[0][0]).toBe(sources.stations.find(s => s.properties.name === 'Colón'));
  });

  it('finds a bus stop by code and by name, and hands on the object the stop markers use', () => {
    const target = sources.busStops.find(s => s.stopCode === '1044');
    for (const query of ['1044', 'Poliesportiu de Burjassot']) {
      const item = search(query).allItems.find(i => i.type === 'busStop' && i.data === target);
      expect(item, query).toBeTruthy();
    }
    const onStop = vi.fn();
    selectResult({ type: 'busStop', data: target }, { busStop: onStop });
    expect(onStop).toHaveBeenCalledWith(target);
  });

  it('caps bus stop results', () => {
    expect(search('a').filteredBusStops.length).toBeLessThanOrEqual(MAX_BUS_STOP_RESULTS);
  });

  it('orders the flat keyboard list lines, bus lines, stations, bus stops', () => {
    const order = search('10').allItems.map(i => i.type);
    const rank = { line: 0, busLine: 1, station: 2, busStop: 3 };
    expect(order.map(t => rank[t])).toEqual([...order.map(t => rank[t])].sort((a, b) => a - b));
  });

  it('returns nothing for an empty query, and never mistakes an unknown type for a line', () => {
    expect(search('  ').allItems).toEqual([]);
    const onLine = vi.fn();
    selectResult({ type: 'mystery', data: {} }, { line: onLine });
    expect(onLine).not.toHaveBeenCalled();
  });
});
