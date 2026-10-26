// Station & Bus Stop Highlight Marker Markup
//
// The compact marker shown at a selected Station's or Bus Stop's position on
// the map: a visual anchor only ("this is the stop you picked"), never arrivals
// data. Built as a string because it lives inside a MapLibre Marker, outside
// React's tree.
import { lineColor } from './lineColor';

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
 * Renders the compact HTML marker for a selected Metro Station.
 *
 * @param {{ name: string, lines?: (string|number)[] }} properties
 * @param {'light'|'dark'} theme
 * @returns {string} HTML string
 */
export const renderStationHighlight = (properties, theme) => {
  const panel = theme === 'light' ? '#ffffff' : '#1e1e24';
  const text = theme === 'light' ? '#121212' : '#ffffff';
  const border = theme === 'light' ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.16)';
  const lines = properties?.lines || [];
  const rawName = properties?.name || '';
  const displayName = shortenStopName(rawName, 6);

  const lineBadges = lines.slice(0, 4).map((l) => (
    `<span style="font:900 8.5px/1 system-ui;padding:1.5px 3.5px;border-radius:3px;background:${lineColor(l)};color:#000;">${escapeHtml(l)}</span>`
  )).join('');

  return `
    <div class="station-floating-chart" style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;">
      <!-- Two-row square-ish bubble: station name + line badges (transport logo omitted since marker has it) -->
      <div style="display:flex;flex-direction:column;align-items:center;gap:3px;padding:3px 6px;border-radius:7px;background:${panel};border:1.5px solid ${border};box-shadow:0 3px 12px rgba(0,0,0,.4);white-space:nowrap;transform:translateZ(0);width:max-content;text-align:center;">
        <!-- Row 1: Shortened Station Name -->
        <span style="font:800 11px/1.1 system-ui;color:${text};letter-spacing:-0.01em;">${escapeHtml(displayName)}</span>
        <!-- Row 2: Metro Line Badges -->
        ${lineBadges ? `<div style="display:flex;gap:2px;align-items:center;justify-content:center;flex-wrap:wrap;max-width:75px;">${lineBadges}</div>` : ''}
      </div>

      <!-- Pointing Caret -->
      <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:4px solid ${panel};margin-top:-1px;"></div>
    </div>`;
};

/**
 * Renders the compact HTML marker for a selected EMT Bus Stop.
 * Displays only available bus line badges in consistent EMT red.
 * Omits transport logo and stop ID to save maximum space and avoid clustering overlap.
 *
 * @param {{ stopCode?: string|number, stopName?: string, name?: string, lines?: (string|number)[] }} stop
 * @param {'light'|'dark'} theme
 * @returns {string} HTML string
 */
export const renderBusStopHighlight = (stop, theme) => {
  const panel = theme === 'light' ? '#ffffff' : '#1e1e24';
  const text = theme === 'light' ? '#121212' : '#ffffff';
  const border = theme === 'light' ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.16)';
  const lines = stop?.lines || [];

  // Consistent EMT red bus line badges (no transport logo or stop ID, to save space)
  const lineBadges = lines.slice(0, 4).map((l) => (
    `<span style="font:900 8px/1 system-ui;padding:1px 3.5px;border-radius:2.5px;background:#D62828;color:#ffffff;display:inline-flex;align-items:center;justify-content:center;">${escapeHtml(l)}</span>`
  )).join('');

  const content = lineBadges
    ? `<div style="display:flex;gap:2px;align-items:center;justify-content:center;flex-wrap:wrap;max-width:75px;">${lineBadges}</div>`
    : `<span style="font:800 8.5px/1 system-ui;color:${text};">Bus</span>`;

  return `
    <div class="bus-floating-chart" style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;">
      <!-- Compact bubble: line badges only (transport logo & stop ID omitted to save space) -->
      <div style="display:flex;align-items:center;justify-content:center;padding:3px 5px;border-radius:6px;background:${panel};border:1.5px solid ${border};box-shadow:0 3px 12px rgba(0,0,0,.4);white-space:nowrap;transform:translateZ(0);width:max-content;text-align:center;">
        ${content}
      </div>

      <!-- Pointing Caret -->
      <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-top:4px solid ${panel};margin-top:-1px;"></div>
    </div>`;
};

export default renderStationHighlight;
