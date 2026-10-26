// BusStopBoard Component for Variant C (Dual-Lens Mode Switcher) & Variant B Stop Tap
// Dedicated departure board for an EMT bus stop node.
import React from 'react';
import BusBadge from './BusBadge';
import { X, Radio } from 'lucide-react';
import { countdownHeat, countdownLabel, countdownUnit } from '../utils/countdownHeat';

export const BusStopBoard = ({
  stop,
  theme = 'dark',
  onClose,
  onSelectLine
}) => {
  if (!stop) return null;

  // Mock real-time departures if not directly provided
  const arrivals = stop.arrivals || [
    { line: '19', destination: 'La Malva-rosa', dueSeconds: 90, isLive: true },
    { line: 'C1', destination: 'Centre Històric (Loop)', dueSeconds: 240, isLive: true },
    { line: '70', destination: 'La Fontsanta', dueSeconds: 420, isLive: true },
    { line: '92', destination: 'Campanar', dueSeconds: 610, isLive: false },
  ];

  return (
    <aside
      className="bus-stop-board glass-panel"
      role="region"
      aria-label={`Bus stop ${stop.name || stop.stopName}`}
      style={{
        position: 'absolute',
        zIndex: 45,
        bottom: 'max(70px, calc(14px + env(safe-area-inset-bottom, 14px) + 56px))',
        left: 12,
        right: 12,
        maxWidth: 480,
        margin: '0 auto',
        borderRadius: 16,
        overflow: 'hidden',
        background: 'var(--bg-panel, #1a202c)',
        border: '1px solid var(--border-color, rgba(255,255,255,0.18))',
        boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
        color: 'var(--text-primary, #ffffff)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(214, 40, 40, 0.12)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <div
            style={{
              width: 34,
              height: 34,
              borderRadius: 8,
              background: '#D62828',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 900,
              fontSize: '1rem',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(214, 40, 40, 0.4)',
            }}
          >
            <span style={{ fontSize: '0.62rem', fontWeight: 900, letterSpacing: '0.04em', lineHeight: 1 }}>
              EMT
            </span>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  background: '#D62828',
                  color: '#ffffff',
                  padding: '1px 5px',
                  borderRadius: 4,
                }}
              >
                {(() => {
                  const c = String(stop.code || stop.stopCode || '1002');
                  return c.startsWith('P-') ? c : `P-${c}`;
                })()}
              </span>
              <span style={{ fontSize: '0.70rem', color: '#4caf50', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <Radio size={10} className="pulse" /> LIVE
              </span>
            </div>
            <h2
              style={{
                fontSize: '1.08rem',
                fontWeight: 800,
                margin: '2px 0 0',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {stop.name || stop.stopName || 'Carrer de Colón'}
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close bus stop board"
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--bg-hover, rgba(255,255,255,0.1))',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>
      </header>

      {/* Departures Table */}
      <div style={{ padding: '8px 12px 14px', maxHeight: 240, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem' }}>
          <thead>
            <tr style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid var(--border-color)' }}>
              <th style={{ textAlign: 'left', padding: '6px 4px' }}>Línia</th>
              <th style={{ textAlign: 'left', padding: '6px 6px' }}>Destinació</th>
              <th style={{ textAlign: 'right', padding: '6px 4px' }}>Temps</th>
            </tr>
          </thead>
          <tbody>
            {arrivals.map((arr, i) => {
              const heat = countdownHeat(arr.dueSeconds, theme);
              return (
                <tr
                  key={i}
                  style={{
                    borderBottom: '1px solid var(--border-color, rgba(255,255,255,0.06))',
                    cursor: onSelectLine ? 'pointer' : 'default',
                  }}
                  onClick={() => onSelectLine && onSelectLine(arr.line)}
                >
                  <td style={{ padding: '8px 4px', width: 1 }}>
                    <BusBadge line={arr.line} size="sm" />
                  </td>
                  <td style={{ padding: '8px 6px' }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {arr.destination}
                    </div>
                  </td>
                  <td style={{ padding: '8px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                      {arr.isLive && (
                        <span
                          style={{
                            width: 6,
                            height: 6,
                            borderRadius: '50%',
                            background: '#4CAF50',
                            display: 'inline-block',
                          }}
                        />
                      )}
                      <span style={{ fontWeight: 800, color: heat, fontVariantNumeric: 'tabular-nums' }}>
                        {countdownLabel(arr.dueSeconds, 'Due')}
                        {countdownUnit(arr.dueSeconds) && (
                          <span style={{ fontSize: '0.72rem', marginLeft: 2, color: 'var(--text-secondary)' }}>
                            {countdownUnit(arr.dueSeconds)}
                          </span>
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </aside>
  );
};

export default BusStopBoard;
