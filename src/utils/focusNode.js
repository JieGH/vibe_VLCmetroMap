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

  const lineBadges = lines.slice(0, 4).map((l) => (
    `<span style="font:900 9px/1 system-ui;padding:2px 4px;border-radius:3px;background:${lineColor(l)};color:#000;">${escapeHtml(l)}</span>`
  )).join('');

  return `
    <div class="station-floating-chart" style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:pointer;">
      <!-- Floating Name Chart Card -->
      <div style="display:flex;align-items:center;gap:7px;padding:6px 12px;border-radius:12px;background:${panel};border:1.5px solid ${border};box-shadow:0 8px 24px rgba(0,0,0,.45);white-space:nowrap;transform:translateZ(0);">
        <span style="width:16px;height:16px;border-radius:50%;background:#E2001A;color:#ffffff;font:900 italic 10px/16px system-ui;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">m</span>
        <span style="font:800 12.5px/1.2 system-ui;color:${text};max-width:180px;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(properties.name)}</span>
        ${lineBadges ? `<div style="display:flex;gap:2px;align-items:center;margin-left:2px;">${lineBadges}</div>` : ''}
      </div>

      <!-- Pointing Leader Line -->
      <div style="width:2px;height:22px;background:linear-gradient(to bottom, ${border}, ${accent});"></div>

      <!-- Station Location Target Circle -->
      <div style="position:relative;width:20px;height:20px;display:flex;align-items:center;justify-content:center;">
        <span style="position:absolute;width:20px;height:20px;border-radius:50%;background:${accent};opacity:0.25;"></span>
        <span style="width:14px;height:14px;border-radius:50%;background:${panel};border:3px solid ${accent};box-shadow:0 2px 8px rgba(0,0,0,0.5);box-sizing:border-box;"></span>
      </div>
    </div>`;
};

export default renderStationHighlight;
