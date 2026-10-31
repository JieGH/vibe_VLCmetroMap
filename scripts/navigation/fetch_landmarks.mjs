// Refetch real named library/university landmarks; never geocode or invent their coordinates.
// Usage: node scripts/navigation/fetch_landmarks.mjs
import fs from 'node:fs/promises';

const DIRECTORY = 'https://www.uv.es/uvweb/servicio-bibliotecas-documentacion/es/servicios/carta-servicios/localizacion-horario-atencion-1285926483170.html';
const FACILITIES = 'https://geoportal.valencia.es/server/rest/services/OPENDATA/SociedadBienestar/MapServer/1/query';
const STREETS = 'https://geoportal.valencia.es/server/rest/services/OPENDATA/UrbanismoEInfraestructuras/MapServer/223/query';
const BOUNDS = [-0.85, 39.0, 0.1, 39.95];
const output = new URL('../../src/data/landmarks.json', import.meta.url);

const read = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 Xarxa landmark refresh', Accept: 'application/json,text/xml,text/html' } });
  if (!response.ok) throw new Error(`Landmark source returned ${response.status}: ${new URL(url).hostname}`);
  return response.text();
};
const queryUrl = (base, params) => {
  const url = new URL(base);
  url.search = new URLSearchParams(params);
  return url;
};
const inBounds = coordinates => Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every(Number.isFinite) &&
  coordinates[0] >= BOUNDS[0] && coordinates[0] <= BOUNDS[2] && coordinates[1] >= BOUNDS[1] && coordinates[1] <= BOUNDS[3];
const plain = value => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, '')
  .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'").replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').trim();
const tag = (xml, name) => plain(xml.match(new RegExp(`<${name}>([\\s\\S]*?)<\\/${name}>`))?.[1] || '');

const facilityUrl = queryUrl(FACILITIES, {
  where: "clase='Bibliotecas' OR UPPER(equipamien) LIKE '%UNIVERSI%'",
  outFields: '*', outSR: '4326', f: 'geojson',
});
const facilities = JSON.parse(await read(facilityUrl));
if (!Array.isArray(facilities.features) || facilities.exceededTransferLimit || facilities.features.length === 0) {
  throw new Error('Municipal facilities response is empty or truncated; existing index was not replaced.');
}
const streetCodes = [...new Set(facilities.features.map(feature => feature.properties?.codvia).filter(Number.isFinite))];
const streets = JSON.parse(await read(queryUrl(STREETS, {
  where: `codvia IN (${streetCodes.join(',')})`, outFields: 'codvia,tipnomcalle', returnGeometry: 'false', f: 'json',
})));
if (!Array.isArray(streets.features) || streets.exceededTransferLimit) throw new Error('Street-name response is missing or truncated.');
const streetNames = new Map(streets.features.map(feature => [feature.attributes.codvia, feature.attributes.tipnomcalle]));
const places = facilities.features.flatMap(feature => {
  const p = feature.properties;
  if (feature.geometry?.type !== 'Point' || !inBounds(feature.geometry.coordinates) || !p?.equipamien) return [];
  const street = streetNames.get(p.codvia);
  const address = [street && [street, p.numportal].filter(Boolean).join(' '), 'València'].filter(Boolean).join(', ');
  return [{
    id: `valencia-facility:${p.objectid}`, name: p.equipamien, address,
    coordinates: feature.geometry.coordinates, source: 'valencia-open-data',
    attribution: 'Ajuntament de València — CC BY 4.0',
    aliases: p.clase === 'Bibliotecas'
      ? ['biblioteca', 'library', 'biblioteques', 'municipal library']
      : ['universitat', 'universidad', 'university'],
  }];
});

const directory = await read(DIRECTORY);
const mapIds = [...new Set([...directory.matchAll(/<iframe\b[^>]*src=["']([^"']+)["']/gi)]
  .map(match => new URL(match[1].replace(/&amp;/g, '&')).searchParams.get('mid')).filter(Boolean))];
if (mapIds.length === 0) throw new Error('University directory contains no published map links.');
const mapSources = [];
let universityLibraries = 0;
for (const mid of mapIds) {
  const mapUrl = queryUrl('https://www.google.com/maps/d/kml', { mid, forcekml: '1' });
  const kml = await read(mapUrl);
  mapSources.push(mapUrl.href);
  for (const [index, match] of [...kml.matchAll(/<Placemark\b[^>]*>([\s\S]*?)<\/Placemark>/g)].entries()) {
    const xml = match[1];
    const name = tag(xml, 'name');
    const point = xml.match(/<Point>([\s\S]*?)<\/Point>/)?.[1];
    const coordinates = point ? tag(point, 'coordinates').split(',').slice(0, 2).map(Number) : null;
    if (!/biblioteca|biblioteques|cartoteca/i.test(name) || !inBounds(coordinates)) continue;
    const description = tag(xml, 'description');
    const address = description.split('\n').map(line => line.replace(/\s+/g, ' ').trim())
      .filter(line => line && !/@|telèfon|telefono|teléfono|fax/i.test(line)).slice(0, 2).join(', ');
    places.push({
      id: `uv-library:${mid}:${index}`, name, address: address || 'Universitat de València', coordinates,
      source: 'uv-library-directory', attribution: 'Universitat de València — directori de biblioteques',
      aliases: ['library', 'university library', 'biblioteca universitaria', 'biblioteca universitat', 'Universitat de València', 'Universidad de Valencia'],
    });
    universityLibraries += 1;
  }
}
if (universityLibraries < 5) throw new Error('University library sources are incomplete; existing index was not replaced.');
const uniquePlaces = [...new Map(places.map(place => [`${place.name.toLocaleLowerCase()}:${place.coordinates.join(',')}`, place])).values()]
  .sort((a, b) => a.name.localeCompare(b.name));
await fs.writeFile(output, JSON.stringify({
  fetchedAt: new Date().toISOString(), bounds: BOUNDS,
  sources: [
    { name: 'Ajuntament de València', url: facilityUrl.href, streets: STREETS, licence: 'CC BY 4.0', catalogue: 'https://opendata.vlci.valencia.es/dataset/equipamients-municipals-equipamientos-municipales' },
    { name: 'Universitat de València', url: DIRECTORY, maps: mapSources },
  ],
  places: uniquePlaces,
}, null, 2) + '\n');
console.log(`Refreshed ${uniquePlaces.length} named landmarks, including ${universityLibraries} university-library points.`);
