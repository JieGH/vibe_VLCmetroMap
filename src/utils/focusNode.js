// Station Highlight Marker Markup
//
// The compact marker shown at a selected Station's position on the map: a
// visual anchor only ("this is the Station you picked"), never arrivals data.
// The Station panel is the sole place arrivals are shown. Built as a string
// because it lives inside a MapLibre Marker, outside React's tree.
import { lineColor } from './lineColor';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/**
 * Renders the compact HTML marker for a selected Station: a small dot in the
 * Station's primary Line color plus its name. No arrivals, countdowns, or
 * freshness state — those live in the Station panel.
 *
 * @param {{ name: string, lines?: (string|number)[] }} properties
 * @param {'light'|'dark'} theme
 * @returns {string} HTML string
 */
export const renderStationHighlight = (properties, theme) => {
  const panel = theme === 'light' ? '#ffffff' : '#1e1e24';
  const text = theme === 'light' ? '#121212' : '#ffffff';
  const border = theme === 'light' ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.16)';
  const lines = properties.lines || [];
  const accent = lines.length > 0 ? lineColor(lines[0]) : lineColor(undefined);

  return `
    <div style="display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;background:${panel};border:1px solid ${border};box-shadow:0 6px 18px rgba(0,0,0,.4)">
      <span style="width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${panel};border:2px solid ${accent};box-sizing:border-box"></span>
      <span style="font:800 12px/1.2 system-ui;color:${text};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px">${escapeHtml(properties.name)}</span>
    </div>`;
};

export default renderStationHighlight;
