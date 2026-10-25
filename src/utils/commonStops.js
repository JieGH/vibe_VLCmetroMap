// The popular stops offered as chips under the search pill, in the order the
// native app shows them. Names match gtfs_expanded.json exactly.
import gtfsData from '../data/gtfs_expanded.json';

export const COMMON_STOP_NAMES = [
  'Grau - La Marina',
  'Marítim',
  'Colón',
  'Xàtiva',
  'Àngel Guimerà',
  'La Carrasca',
  'Russafa',
];

/** The station Point features for `names`, in order; names with no match are skipped. */
export const resolveCommonStops = (names = COMMON_STOP_NAMES, features = gtfsData.features) => {
  const points = features.filter((f) => f.geometry?.type === 'Point');
  return names
    .map((name) => points.find((f) => f.properties?.name === name))
    .filter(Boolean);
};

export const COMMON_STOPS = resolveCommonStops();
