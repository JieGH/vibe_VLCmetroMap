import { labels, noLabels } from 'protomaps-themes-base';

/**
 * Filtered label layers for the Protomaps vector basemap.
 * Removes public libraries to minimize visual clutter while preserving parks, gardens,
 * nature reserves, and key transit/civic landmarks.
 *
 * @param {string} flavour - Protomaps theme flavour ('dark', 'white', etc.)
 * @param {string} [lang='en'] - Label language code
 * @returns {Array<object>} Style layers with libraries excluded from POIs
 */
export const buildVectorLabels = (flavour, lang = 'en') =>
  labels('protomaps', flavour, lang).map((layer) => {
    if (layer.id === 'pois' && Array.isArray(layer.filter)) {
      const cloned = JSON.parse(JSON.stringify(layer));
      try {
        // Protomaps POIs filter structure:
        // ['all', ['in', ['get', 'kind'], ['literal', [...kinds]]], ['>=', ['zoom'], ...]]
        const kinds = cloned.filter[1]?.[2]?.[1];
        if (Array.isArray(kinds)) {
          cloned.filter[1][2][1] = kinds.filter((k) => k !== 'library');
          return cloned;
        }
      } catch {
        /* fallback to explicit inequality check */
      }
      return {
        ...layer,
        filter: ['all', layer.filter, ['!=', ['get', 'kind'], 'library']],
      };
    }
    return layer;
  });

/**
 * Filtered geometry layers for the Protomaps vector basemap.
 * Excludes heavy individual building footprints to keep transit rendering lightweight.
 *
 * @param {string} flavour - Protomaps theme flavour ('dark', 'white', etc.)
 * @returns {Array<object>} Style layers with building footprints omitted
 */
export const buildVectorNoLabels = (flavour) =>
  noLabels('protomaps', flavour).filter((layer) => layer.id !== 'buildings');
