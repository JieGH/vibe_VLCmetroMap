// BusStopBoard Component: Dedicated departure board for an EMT bus stop node (EMT-only card).
// Matches the visual architecture of StationPanel with responsive docking, swipe-to-dismiss, and expand/collapse.
import React, { useState, useEffect } from 'react';
import BusBadge from './BusBadge';
import { X, Radio, Maximize2, Minimize2 } from 'lucide-react';
import { countdownHeat, countdownLabel, countdownUnit } from '../utils/countdownHeat';
import { LANDSCAPE_BREAKPOINT_PX } from '../utils/layout';
import { useDragToDismiss } from '../utils/useDragToDismiss';

const useIsLandscape = () => {
  const [landscape, setLandscape] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= LANDSCAPE_BREAKPOINT_PX
  );
  useEffect(() => {
    const onResize = () => setLandscape(window.innerWidth >= LANDSCAPE_BREAKPOINT_PX);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return landscape;
};

export const BusStopBoard = ({
  stop,
  theme = 'dark',
  onClose,
  onSelectLine,
}) => {
  const landscape = useIsLandscape();
  const [isExpanded, setIsExpanded] = useState(false);

  const { handleProps, cardStyle: dragStyle } = useDragToDismiss({
    onDismiss: onClose,
    enabled: !landscape && Boolean(stop),
    threshold: 70,
  });

  useEffect(() => {
    if (!stop) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (e.defaultPrevented) return;
        if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return;
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stop, onClose]);

  if (!stop) return null;

  // Mock real-time departures if not directly provided
  const arrivals = stop.arrivals || [
    { line: '19', destination: 'La Malva-rosa', dueSeconds: 90, isLive: true },
    { line: 'C1', destination: 'Centre Històric (Loop)', dueSeconds: 240, isLive: true },
    { line: '70', destination: 'La Fontsanta', dueSeconds: 420, isLive: true },
    { line: '92', destination: 'Campanar', dueSeconds: 610, isLive: false },
  ];

  const stopCode = (() => {
    const c = String(stop.code || stop.stopCode || '1002');
    return c.startsWith('P-') ? c : `P-${c}`;
  })();

  const stopLines = Array.isArray(stop.lines) ? stop.lines : [];

  return (
    <aside
      className="bus-stop-board glass-panel"
      role="region"
      aria-label={`Bus stop ${stop.name || stop.stopName}`}
      data-landscape={landscape ? 'true' : 'false'}
      style={{
        position: 'absolute',
        zIndex: 45,
        borderRadius: 16,
        overflow: 'hidden',
        background: 'var(--bg-panel, #1a202c)',
        border: '1px solid var(--border-color, rgba(255,255,255,0.18))',
        boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
        color: 'var(--text-primary, #ffffff)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        ...(landscape
          ? {
              top: 84,
              right: 16,
              maxHeight: isExpanded ? 'calc(100vh - 40px)' : 'calc(100vh - 100px)',
              height: isExpanded ? 'calc(100vh - 100px)' : 'auto',
              width: isExpanded ? 'min(820px, 68vw)' : 'min(400px, 34vw)',
              transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
            }
          : {
              left: 12,
              right: 12,
              bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
              maxWidth: 480,
              margin: '0 auto',
              maxHeight: isExpanded ? 'min(92vh, calc(100vh - 48px))' : 'min(58vh, calc(100vh - 120px))',
              height: isExpanded ? 'min(92vh, calc(100vh - 48px))' : 'auto',
              transition: 'max-height 0.22s cubic-bezier(0.4, 0, 0.2, 1), height 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
            }),
        ...dragStyle,
      }}
    >
      {/* Top drag handle indicator for swipe-down to dismiss in portrait mode */}
      {!landscape && (
        <div
          className="sheet-drag-handle-wrap"
          data-testid="bus-drag-handle"
          style={{ padding: '6px 0 2px' }}
          {...handleProps}
        >
          <div className="sheet-drag-handle" />
        </div>
      )}

      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          padding: !landscape ? '2px 16px 12px' : '12px 16px',
          borderBottom: '1px solid var(--border-color)',
          background: 'rgba(214, 40, 40, 0.12)',
        }}
        {...(!landscape ? handleProps : {})}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <div
            onClick={() => setIsExpanded((v) => !v)}
            title={isExpanded ? 'Collapse view' : 'Expand full departures'}
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
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '0.62rem', fontWeight: 900, letterSpacing: '0.04em', lineHeight: 1 }}>
              EMT
            </span>
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
                {stopCode}
              </span>
              <span style={{ fontSize: '0.70rem', color: '#4caf50', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <Radio size={10} className="pulse" /> LIVE
              </span>
            </div>

            <h2
              style={{
                fontSize: '1.08rem',
                fontWeight: 800,
                lineHeight: 1.2,
                margin: '2px 0 0',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-word',
              }}
            >
              {stop.name || stop.stopName || 'Carrer de Colón'}
            </h2>

            {stopLines.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, overflowX: 'auto', scrollbarWidth: 'none' }}>
                {stopLines.map((lineId) => (
                  <span
                    key={lineId}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 18,
                      height: 18,
                      padding: '0 4px',
                      borderRadius: 4,
                      background: '#1565C0',
                      color: '#ffffff',
                      fontSize: '.68rem',
                      fontWeight: 900,
                      lineHeight: 1,
                    }}
                  >
                    {lineId}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded((v) => !v);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={isExpanded ? 'Collapse bus stop panel' : 'Expand bus stop panel'}
            title={isExpanded ? 'Minimize / Collapse view' : 'Maximize / Expand full departures'}
            style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: 'none',
              background: isExpanded ? 'rgba(255,255,255,0.18)' : 'var(--bg-hover, rgba(255,255,255,0.1))',
              color: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>

          <button
            type="button"
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
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
        </div>
      </header>

      {/* Departures Table */}
      <div
        style={{
          padding: '8px 12px 14px',
          maxHeight: isExpanded ? 'calc(78vh - 110px)' : 260,
          overflowY: 'auto',
          transition: 'max-height 0.22s ease',
        }}
      >
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
