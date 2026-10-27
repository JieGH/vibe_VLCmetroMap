// Station & Bus Stop Highlight Marker Markup
//
// The compact marker shown at a selected Station's or Bus Stop's position on
// the map: a visual anchor only ("this is the stop you picked"), never arrivals
// data. Built as a string because it lives inside a MapLibre Marker, outside
// React's tree.
import { lineColor } from './lineColor';
import { capStopLines } from './emtStopLines';
import { translate, FALLBACK_LANGUAGE } from '../i18n/translate';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/**
 * Shortens a station or bus stop name to ~5-6 characters for compact map popups.
 * Strips street/place prefixes (Carrer, Pl., Av., Estació, etc.) and secondary subtitles.
 *
 * Examples:
 * - "Àngel Guimerà" -> "Àngel"
 * - "Xàtiva" -> "Xàtiva"
 * - "Colón" -> "Colón"
 * - "Plaça de l'Ajuntament" -> "Ajunt…"
 * - "Facultats - Manuel Broseta" -> "Facul…"
 * - "Carrer de Russafa" -> "Russa…"
 *
 * @param {string} name
 * @param {number} [maxChars=6]
 * @returns {string}
 */
export const shortenStopName = (name, maxChars = 6) => {
  if (!name) return '';
  let cleaned = String(name).trim()
    .replace(/^(Carrer|C\/)\s+(del|de\s+l’|de\s+l'|de\s+la|de)?\s*/i, '')
    .replace(/^(Plaça|Pl\.)\s+(del|de\s+l’|de\s+l'|de\s+la|de)?\s*/i, '')
    .replace(/^(Avinguda|Av\.)\s+(del|de\s+l’|de\s+l'|de\s+la|de)?\s*/i, '')
    .replace(/^(Gran\s+Via\s*)/i, '')
    .replace(/^(Estació\s+(del|de\s+l’|de\s+l'|de\s+la|de)?\s*)/i, '')
    .replace(/^(Passeig\s+(del|de\s+l’|de\s+l'|de\s+la|de)?\s*)/i, '')
    .trim();

  // Strip subtitles after hyphen, slash, or em-dash
  cleaned = cleaned.split(/\s*[-–—/]\s*/)[0].trim();

  // If multi-word (e.g. "Àngel Guimerà"), check if first word is a great standalone name
  const words = cleaned.split(/\s+/);
  if (words.length > 1 && words[0].length >= 4 && words[0].length <= maxChars) {
    cleaned = words[0];
  }

  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, Math.max(3, maxChars - 1)) + '…';
};

/**
 * Chips for a chosen stop's lines: sorted, at most 6, the last one a +N chip when lines were cut
 * (same rule as the chips on EMT stop markers, see emtStopLines).
 * @param {(string|number|{ line?: string, id?: string })[]} [lines]
 * @returns {{ label: string, line: string|null, isMore: boolean }[]}
 */
export const highlightChips = (lines) => {
  const ids = (lines || []).map((l) => (typeof l === 'object' && l !== null ? (l.line || l.id || '') : l));
  const { shown, extra } = capStopLines(ids);
  const chips = shown.map((label) => ({ label, line: label, isMore: false }));
  if (extra > 0) chips.push({ label: `+${extra}`, line: null, isMore: true });
  return chips;
};

/**
 * The one grid rule for the chips: 1 chip = 1 column, 2 or more = 2 columns, and an odd last
 * chip is centred across both columns, so no grid cell is ever left empty.
 * @param {number} count
 * @returns {{ columns: 1|2, rows: number, lastOddIndex: number }} lastOddIndex is -1 when every row is full
 */
export const chipGridLayout = (count) => {
  const columns = count >= 2 ? 2 : 1;
  return {
    columns,
    rows: Math.ceil(count / columns),
    lastOddIndex: columns === 2 && count % 2 === 1 ? count - 1 : -1,
  };
};

// Chip grid markup shared by the station and bus stop highlight (sizes live in CSS: .focus-chip-grid / .focus-chip).
const chipGridMarkup = (chips, chipStyle) => {
  const { columns, lastOddIndex } = chipGridLayout(chips.length);
  const cells = chips.map((chip, i) => {
    const cls = `focus-chip${i === lastOddIndex ? ' focus-chip-last-odd' : ''}`;
    return `<span class="${cls}" style="${chipStyle(chip)}">${escapeHtml(chip.label)}</span>`;
  }).join('');
  return `<div class="focus-chip-grid" style="--focus-cols:${columns};">${cells}</div>`;
};

/**
 * Renders the compact HTML marker for a selected Metro Station.
 *
 * @param {{ name: string, lines?: (string|number)[] }} properties
 * @param {'light'|'dark'} theme
 * @param {boolean} [isSelected=false] the selected station's own label (stays unfaded, #114)
 * @returns {string} HTML string
 */
export const renderStationHighlight = (properties, theme, isSelected = false) => {
  const panel = theme === 'light' ? '#ffffff' : '#1e1e24';
  const text = theme === 'light' ? '#121212' : '#ffffff';
  const border = theme === 'light' ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.16)';
  const lines = properties?.lines || [];
  const rawName = properties?.name || '';
  const displayName = shortenStopName(rawName, 6);

  const lineBadges = chipGridMarkup(highlightChips(lines), (chip) => (
    `background:${chip.isMore ? '#6b7280' : lineColor(chip.line)};color:${chip.isMore ? '#fff' : '#000'};`
  ));

  return `
    <div class="station-floating-chart${isSelected ? ' is-selected' : ''}" style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;">
      <!-- Two-row square-ish bubble: station name + line badges (transport logo omitted since marker has it) -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:3px 6px;border-radius:7px;background:${panel};border:1.5px solid ${border};box-shadow:0 3px 12px rgba(0,0,0,.4);white-space:nowrap;transform:translateZ(0);width:max-content;text-align:center;">
        <!-- Row 1: Shortened Station Name -->
        <span style="font:800 11px/1.1 var(--font-ui);color:${text};letter-spacing:-0.01em;">${escapeHtml(displayName)}</span>
        <!-- Row 2: Metro Line Badges -->
        ${lines.length ? lineBadges : ''}
      </div>
    </div>`;
};

/**
 * Renders the compact HTML marker for a selected or surrounding EMT Bus Stop.
 * Displays available bus line chips in consistent EMT red, in the one grid layout (chipGridLayout).
 * isSelected only adds the .is-selected class: the box looks the same at every zoom.
 *
 * @param {{ stopCode?: string|number, stopName?: string, name?: string, lines?: (string|number)[] }} stop
 * @param {'light'|'dark'} theme
 * @param {boolean} [isSelected=false]
 * @returns {string} HTML string
 */
export const renderBusStopHighlight = (stop, theme, isSelected = false, lang = FALLBACK_LANGUAGE) => {
  const panel = theme === 'light' ? '#ffffff' : '#1e1e24';
  const text = theme === 'light' ? '#121212' : '#ffffff';
  // One look for the chosen stop's box at every zoom and line count: white outline, fixed chips.
  const border = theme === 'light' ? '#D62828' : 'rgba(255,255,255,0.7)';
  const chips = highlightChips(stop?.lines);

  // Consistent EMT red bus line badges (no transport logo or stop ID, to save space)
  const content = chips.length
    ? chipGridMarkup(chips, (chip) => `background:${chip.isMore ? '#8f1d1d' : '#D62828'};color:#ffffff;`)
    : `<span style="font:800 11.5px/1.1 var(--font-ui);color:${text};">${translate(lang, 'common.bus')}</span>`;

  return `
    <div class="bus-floating-chart${isSelected ? ' is-selected' : ''}" style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;">
      <!-- Compact bubble: line chips only (transport logo & stop ID omitted to save space) -->
      <div style="display:flex;align-items:center;justify-content:center;padding:5px 8px;border-radius:8px;background:${panel};border:2px solid ${border};box-shadow:0 4px 16px rgba(0,0,0,.5);white-space:nowrap;transform:translateZ(0);width:max-content;text-align:center;">
        ${content}
      </div>
    </div>`;
};

export default renderStationHighlight;
