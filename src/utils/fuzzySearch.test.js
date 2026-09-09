import { describe, it, expect } from 'vitest';
import {
  normalizeAccents,
  cleanSearchText,
  fuzzyScore,
  searchFuzzy,
} from './fuzzySearch';

describe('normalizeAccents', () => {
  it('equates unaccented and accented Valencian vowels', () => {
    // a, à, á
    expect(normalizeAccents('a')).toBe('a');
    expect(normalizeAccents('à')).toBe('a');
    expect(normalizeAccents('á')).toBe('a');

    // e, è, é
    expect(normalizeAccents('e')).toBe('e');
    expect(normalizeAccents('è')).toBe('e');
    expect(normalizeAccents('é')).toBe('e');

    // i, í, ï
    expect(normalizeAccents('i')).toBe('i');
    expect(normalizeAccents('í')).toBe('i');
    expect(normalizeAccents('ï')).toBe('i');

    // o, ò, ó
    expect(normalizeAccents('o')).toBe('o');
    expect(normalizeAccents('ò')).toBe('o');
    expect(normalizeAccents('ó')).toBe('o');

    // u, ú, ü
    expect(normalizeAccents('u')).toBe('u');
    expect(normalizeAccents('ú')).toBe('u');
    expect(normalizeAccents('ü')).toBe('u');

    // c, ç
    expect(normalizeAccents('c')).toBe('c');
    expect(normalizeAccents('ç')).toBe('c');

    // n, ñ
    expect(normalizeAccents('n')).toBe('n');
    expect(normalizeAccents('ñ')).toBe('n');
  });

  it('handles mixed case and empty strings', () => {
    expect(normalizeAccents('')).toBe('');
    expect(normalizeAccents(null)).toBe('');
    expect(normalizeAccents('ÀNGEL GUIMERÀ')).toBe('angel guimera');
  });
});

describe('cleanSearchText', () => {
  it('normalizes middle dots, apostrophes, and hyphens to spaces', () => {
    expect(cleanSearchText('Col·legi')).toBe('col legi');
    expect(cleanSearchText("L'Eliana")).toBe('l eliana');
    expect(cleanSearchText('Burjassot-Godella')).toBe('burjassot godella');
  });
});

describe('fuzzyScore', () => {
  it('matches Valencian station names with and without accents identically', () => {
    // Xàtiva
    expect(fuzzyScore('Xàtiva', 'xativa')).toBeGreaterThan(0);
    expect(fuzzyScore('Xàtiva', 'XÀTIVA')).toBeGreaterThan(0);
    expect(fuzzyScore('Xàtiva', 'xat')).toBeGreaterThan(0);
    expect(fuzzyScore('Xàtiva', 'Xàt')).toBeGreaterThan(0);

    // Àngel Guimerà
    expect(fuzzyScore('Àngel Guimerà', 'angel')).toBeGreaterThan(0);
    expect(fuzzyScore('Àngel Guimerà', 'guimera')).toBeGreaterThan(0);
    expect(fuzzyScore('Àngel Guimerà', 'angel guimera')).toBeGreaterThan(0);

    // Colón
    expect(fuzzyScore('Colón', 'colon')).toBeGreaterThan(0);
    expect(fuzzyScore('Colón', 'col')).toBeGreaterThan(0);

    // Bétera
    expect(fuzzyScore('Bétera', 'betera')).toBeGreaterThan(0);

    // València Sud
    expect(fuzzyScore('València Sud', 'valencia')).toBeGreaterThan(0);
  });

  it('matches across words and compact apostrophe forms', () => {
    expect(fuzzyScore("L'Eliana", 'leliana')).toBeGreaterThan(0);
    expect(fuzzyScore("L'Eliana", 'eliana')).toBeGreaterThan(0);
    expect(fuzzyScore('La Pobla de Farnals', 'pobla farnals')).toBeGreaterThan(0);
    expect(fuzzyScore('La Pobla de Farnals', 'farnals')).toBeGreaterThan(0);
  });

  it('recognizes common transit abbreviations (Pl. -> placa)', () => {
    expect(fuzzyScore('Pl. Espanya', 'placa')).toBeGreaterThan(0);
    expect(fuzzyScore('Pl. Espanya', 'placa espanya')).toBeGreaterThan(0);
    expect(fuzzyScore('Pl. Espanya', 'espanya')).toBeGreaterThan(0);
  });

  it('returns null when there is no match', () => {
    expect(fuzzyScore('Xàtiva', 'betera')).toBeNull();
    expect(fuzzyScore('Colón', 'aeroport')).toBeNull();
    expect(fuzzyScore('Alameda', '')).toBeNull();
  });
});

describe('searchFuzzy', () => {
  const sampleStations = [
    { name: 'Xàtiva' },
    { name: 'Àngel Guimerà' },
    { name: 'Colón' },
    { name: 'Bétera' },
    { name: 'València Sud' },
    { name: 'La Pobla de Farnals' },
    { name: "L'Eliana" },
    { name: 'Pl. Espanya' },
    { name: 'Almàssera' },
    { name: 'Benimaclet' },
  ];

  it('ranks exact and prefix matches above distant matches', () => {
    const results = searchFuzzy(sampleStations, 'xativa', (s) => s.name);
    expect(results.length).toBe(1);
    expect(results[0].name).toBe('Xàtiva');
  });

  it('finds stations regardless of user typing accents or not', () => {
    const withAccents = searchFuzzy(sampleStations, 'Àngel', (s) => s.name);
    const withoutAccents = searchFuzzy(sampleStations, 'angel', (s) => s.name);
    expect(withAccents[0].name).toBe('Àngel Guimerà');
    expect(withoutAccents[0].name).toBe('Àngel Guimerà');

    const almassera = searchFuzzy(sampleStations, 'almassera', (s) => s.name);
    expect(almassera[0].name).toBe('Almàssera');
  });

  it('returns empty array on empty or whitespace queries', () => {
    expect(searchFuzzy(sampleStations, '', (s) => s.name)).toEqual([]);
    expect(searchFuzzy(sampleStations, '   ', (s) => s.name)).toEqual([]);
  });
});
