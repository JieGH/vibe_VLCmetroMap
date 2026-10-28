// #112 / #113: shared split-view (compact) style constants for the Trains and Autobús columns.

// Before (#97): title 0.74rem, metro badge 15px / 0.60rem, EMT badge 0.58rem, padding 2px 4px 6px.
export const SPLIT_HEADER = {
  titleFontSize: '0.64rem', // -13.5%
  metroBadge: { size: 15, fontSize: '0.52rem' }, // same mark as on the station cards
  emtBadge: { fontSize: '0.50rem', padding: '1px 3px' },
  padding: '1px 4px 4px',
  gap: 5,
};

/** Header container style: sticky at the top of its scrolling column, opaque so cards never show through. */
export const splitHeaderBoxStyle = (compact) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: compact ? SPLIT_HEADER.padding : '2px 4px 6px',
  borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
  ...(compact ? { position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-panel-solid)' } : {}),
});

// #113: the split-view minute tick (′) renders at the digit size (was 0.68rem / 0.70rem unit size, in
// the secondary colour). lineHeight 0 keeps the row from growing; colour is inherited from the number.
export const SPLIT_TICK = { fontSize: '1.2em', lineHeight: 0, marginLeft: 0, color: 'inherit' };

/** Style of the unit span beside a countdown number (`unit` is 'min' | 'sec' ...). */
export const timeUnitStyle = ({ compact, unit, baseFontSize, gap = 2 }) =>
  compact && unit === 'min'
    ? { ...SPLIT_TICK }
    : { fontSize: baseFontSize, marginLeft: gap, color: 'var(--text-secondary)' };

// How a station's line badges are laid out. Only the split view (compact) stacks them, to leave width for the name.
export function badgeGridStyle(compact, count) {
  if (!compact || count <= 2) return { display: 'flex', gap: 3, flexShrink: 0 };
  const columns = count <= 4 ? 2 : 3;
  return { display: 'grid', gridTemplateColumns: `repeat(${columns}, 18px)`, gap: 3, flexShrink: 0 };
}
