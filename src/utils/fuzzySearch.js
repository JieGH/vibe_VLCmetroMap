/**
 * Normalizes text for Valencian/Catalan and Spanish diacritics.
 * Equates all accented and unaccented vowels:
 * a = à, á
 * e = è, é
 * i = í, ï
 * o = ò, ó
 * u = ú, ü
 * c = ç
 * n = ñ
 *
 * Also normalizes punctuation (middle dots, apostrophes, hyphens).
 *
 * @param {string} str
 * @returns {string}
 */
export const normalizeAccents = (str) => {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
};

/**
 * Expands common Valencian transit abbreviations for search matching.
 * E.g. 'Pl. Espanya' -> 'placa pl Espanya'
 *
 * @param {string} str
 * @returns {string}
 */
export const expandTransitAliases = (str) => {
  if (!str) return '';
  return str
    .replace(/\bpl\b\.?/gi, 'placa pl')
    .replace(/\bav\b\.?/gi, 'avinguda av')
    .replace(/\bdr\b\.?/gi, 'doctor dr');
};

/**
 * Cleans and normalizes text for search comparison.
 *
 * @param {string} str
 * @returns {string}
 */
export const cleanSearchText = (str) => {
  return normalizeAccents(str)
    .replace(/[·'’/\\_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Calculates a fuzzy match score between target text and user query.
 * Returns a number > 0 if matched (higher = better rank), or null if no match.
 *
 * @param {string} target - The text being searched (e.g. station name)
 * @param {string} query - The user search input
 * @returns {number | null} Score or null
 */
export const fuzzyScore = (target, query) => {
  if (!target || !query) return null;

  const rawNormTarget = cleanSearchText(target);
  const normQuery = cleanSearchText(query);
  if (!normQuery) return null;

  // Exact match
  if (rawNormTarget === normQuery) return 1000;

  // Prefix match
  if (rawNormTarget.startsWith(normQuery)) {
    return 800 - (rawNormTarget.length - normQuery.length);
  }

  // Handle compact representations (e.g. "leliana" matching "L'Eliana")
  const compactTarget = rawNormTarget.replace(/\s+/g, '');
  const compactQuery = normQuery.replace(/\s+/g, '');
  if (compactTarget.startsWith(compactQuery)) {
    return 750 - (compactTarget.length - compactQuery.length);
  }

  // Word prefix match (e.g. "guimera" matching "Àngel Guimerà")
  const targetWords = rawNormTarget.split(' ');
  for (const word of targetWords) {
    if (word.startsWith(normQuery)) {
      return 650;
    }
  }

  // Check with expanded transit aliases (e.g. "Pl. Espanya" matching "placa")
  const expandedTarget = cleanSearchText(expandTransitAliases(target));
  if (expandedTarget !== rawNormTarget) {
    if (expandedTarget.startsWith(normQuery)) return 620;
    const expandedWords = expandedTarget.split(' ');
    for (const word of expandedWords) {
      if (word.startsWith(normQuery)) return 600;
    }
  }

  // Substring match
  if (rawNormTarget.includes(normQuery)) {
    return 500 - rawNormTarget.indexOf(normQuery);
  }
  if (compactTarget.includes(compactQuery)) {
    return 480;
  }
  if (expandedTarget.includes(normQuery)) {
    return 450;
  }

  // Multi-token match (all query words present in target, e.g. "pobla farnals" -> "La Pobla de Farnals")
  const queryWords = normQuery.split(' ');
  if (queryWords.length > 1 && queryWords.every((qw) => expandedTarget.includes(qw) || compactTarget.includes(qw))) {
    return 400;
  }

  // Subsequence match for queries >= 3 characters (characters appear in order)
  if (compactQuery.length >= 3) {
    let tIdx = 0;
    let qIdx = 0;
    while (tIdx < compactTarget.length && qIdx < compactQuery.length) {
      if (compactTarget[tIdx] === compactQuery[qIdx]) {
        qIdx++;
      }
      tIdx++;
    }
    if (qIdx === compactQuery.length) {
      return 250 - (compactTarget.length - compactQuery.length);
    }
  }

  return null;
};

/**
 * Searches and ranks an array of items using fuzzy matching.
 *
 * @template T
 * @param {T[]} items - Array of items to filter
 * @param {string} query - User search query
 * @param {(item: T) => string} getText - Extractor for search text
 * @returns {T[]} Sorted matching items
 */
export const searchFuzzy = (items, query, getText) => {
  if (!query || !query.trim()) return [];

  const scored = [];
  for (const item of items) {
    const text = getText(item);
    const score = fuzzyScore(text, query);
    if (score !== null) {
      scored.push({ item, score, textLength: text.length });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.textLength - b.textLength;
  });

  return scored.map((s) => s.item);
};

export default searchFuzzy;
