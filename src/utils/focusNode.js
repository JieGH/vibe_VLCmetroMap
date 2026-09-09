// Station Focus Node Markup
//
// The expanded Station node's markup on the map. Built as a string because it
// lives inside a MapLibre Marker, outside React's tree, and is redrawn every second.
import { countdownHeat, countdownLabel } from './countdownHeat';
import { lineColor } from './lineColor';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]
));

/**
 * Renders the compact HTML bubble for an expanded Station node on the map.
 * Displays the Line badge, destination station, and arrival countdown for each
 * direction, ordered by soonest arrival. Directional triangle bearings are omitted.
 *
 * @param {import('../services/stationFocus').StationFocus} focus
 * @param {'light'|'dark'} theme
 * @returns {string} HTML string
 */
export const renderFocusNode = (focus, theme) => {
  const panel = theme === 'light' ? '#ffffff' : '#1e1e24';
  const text = theme === 'light' ? '#121212' : '#ffffff';
  const muted = theme === 'light' ? '#5f6368' : '#a0a0b0';
  const border = theme === 'light' ? 'rgba(0,0,0,.14)' : 'rgba(255,255,255,.16)';

  // Displays each direction's soonest arriving train with its Line badge,
  // destination station, and arrival countdown.
  const arms = focus.directions.map((direction) => {
    const next = direction.arrivals[0];
    const destination = (next && next.destination) || direction.destination || '';
    const lineLabel = next && next.line
      ? (String(next.line).startsWith('L') ? String(next.line) : `L${next.line}`)
      : '';
    const rawLine = next && next.line ? String(next.line).replace(/^L/, '') : '';
    const badgeColor = lineColor(rawLine || next?.line);
    const badge = next && lineLabel
      ? `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:24px;height:20px;padding:0 5px;border-radius:5px;background:${badgeColor};color:#000;font:900 11px/1 system-ui;flex-shrink:0">${escapeHtml(lineLabel)}</span>`
      : '';
    const due = next
      ? `<span style="font:800 15px/1 system-ui;font-variant-numeric:tabular-nums;color:${countdownHeat(next.seconds, theme)};flex-shrink:0;white-space:nowrap">${countdownLabel(next.seconds)}${next.seconds > 0 ? ' min' : ''}</span>`
      : `<span style="font:600 11px/1 system-ui;color:${muted}">none</span>`;

    return `
      <div style="display:flex;align-items:center;gap:8px;padding:8px 10px">
        ${badge}
        <span style="flex:1;min-width:0;font:700 12px/1.2 system-ui;color:${text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(destination)}">${escapeHtml(destination)}</span>
        ${due}
      </div>`;
  }).join(`<div style="height:1px;background:${border}"></div>`);

  return `
    <div style="min-width:180px;max-width:240px;border-radius:12px;background:${panel};border:1px solid ${border};box-shadow:0 10px 30px rgba(0,0,0,.45);overflow:hidden">
      <div style="padding:8px 10px 6px;border-bottom:1px solid ${border}">
        <div style="font:800 13px/1.2 system-ui;color:${text};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(focus.name)}</div>
        <div style="font:600 9px/1.2 system-ui;letter-spacing:.1em;text-transform:uppercase;color:${focus.isFresh ? '#4CAF50' : '#00B4D8'};margin-top:3px">${focus.isFresh ? 'Live API' : 'From memory'}</div>
      </div>
      ${arms || `<div style="padding:9px 10px;font:600 11px/1 system-ui;color:${muted}">No live arrivals</div>`}
    </div>`;
};

export default renderFocusNode;
