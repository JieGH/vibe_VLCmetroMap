// #112 / #113: shared split-view (compact) style constants for the Trains and Autobús columns.

// Before (#97): title 0.74rem, metro badge 15px / 0.60rem, EMT badge 0.58rem, padding 2px 4px 6px.
export const SPLIT_HEADER = {
  titleFontSize: '0.64rem', // -13.5%
  metroBadge: { size: 13, fontSize: '0.52rem' },
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
