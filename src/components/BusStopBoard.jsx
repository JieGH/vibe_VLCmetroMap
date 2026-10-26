// BusStopBoard Component: Dedicated departure board for an EMT bus stop node (EMT-only card).
// Perfectly mirrors the visual layout, typography, and design of StationPanel (Metro station view).
import React, { useState, useEffect } from 'react';
import { Accessibility, X, Radio, CheckCircle2, Maximize2, Minimize2 } from 'lucide-react';
import BusBadge from './BusBadge';
import { countdownHeat, countdownLabel, countdownUnit } from '../utils/countdownHeat';
import { LANDSCAPE_BREAKPOINT_PX } from '../utils/layout';
import { useDragToDismiss } from '../utils/useDragToDismiss';
import { useTranslation } from '../i18n';
import {
  fetchStopArrivals,
  getEmtCachedArrivals,
  normalizeStopCode,
  EMT_CACHE_TTL_MS,
} from '../services/emtArrivalService';

const ROW_HEIGHT_PX = 48;
const VISIBLE_ROWS = 4;
const TABLE_HEAD_PX = 30;

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
  const { t } = useTranslation();
  const landscape = useIsLandscape();
  const [isExpanded, setIsExpanded] = useState(false);

  const { handleProps, cardStyle: dragStyle } = useDragToDismiss({
    onDismiss: onClose,
    enabled: !landscape && Boolean(stop),
    threshold: 70,
  });

  const rawCode = stop ? String(stop.stopCode || stop.code || stop.id || '') : '';
  const cleanCode = normalizeStopCode(rawCode);

  const [activeCode, setActiveCode] = useState(cleanCode);
  const [liveArrivals, setLiveArrivals] = useState(() => (cleanCode ? getEmtCachedArrivals(cleanCode) : null));
  const [hasAttemptedFetch, setHasAttemptedFetch] = useState(() => Boolean(cleanCode && getEmtCachedArrivals(cleanCode)));

  // Adjust state during render when cleanCode changes (React recommended pattern)
  if (activeCode !== cleanCode) {
    setActiveCode(cleanCode);
    const cached = cleanCode ? getEmtCachedArrivals(cleanCode) : null;
    setLiveArrivals(cached);
    setHasAttemptedFetch(Boolean(cached));
  }

  useEffect(() => {
    if (!stop || !cleanCode) return undefined;
    let isMounted = true;

    const loadArrivals = async (force = false) => {
      try {
        const results = await fetchStopArrivals(cleanCode, { forceRefresh: force });
        if (isMounted) {
          setLiveArrivals(results);
          setHasAttemptedFetch(true);
        }
      } catch {
        if (isMounted) {
          setHasAttemptedFetch(true);
        }
      }
    };

    loadArrivals();

    // Auto-refresh predictions every 20 seconds while board is open
    const intervalId = setInterval(() => {
      loadArrivals(true);
    }, EMT_CACHE_TTL_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [cleanCode, stop]);

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

  const displayName = stop.name || stop.stopName || 'Parada';
  const stopCode = cleanCode ? `P-${cleanCode}` : '';
  const stopLines = Array.isArray(stop.lines)
    ? stop.lines.map((l) => (typeof l === 'object' && l !== null ? String(l.line || l.id || '') : String(l))).filter(Boolean)
    : [];

  // Use live arrivals if fetched; fallback to stop.arrivals, feeder arrival objects, or default initial list
  const arrivals = (liveArrivals !== null)
    ? liveArrivals
    : Array.isArray(stop.arrivals)
      ? stop.arrivals
      : (Array.isArray(stop.lines) && stop.lines.length > 0 && typeof stop.lines[0] === 'object' && stop.lines[0] !== null && 'destination' in stop.lines[0])
        ? stop.lines
        : hasAttemptedFetch
          ? []
          : [
              { line: '19', destination: 'La Malva-rosa', dueSeconds: 90, isLive: true },
              { line: 'C1', destination: 'Centre Històric (Loop)', dueSeconds: 240, isLive: true },
              { line: '70', destination: 'La Fontsanta', dueSeconds: 420, isLive: true },
              { line: '92', destination: 'Campanar', dueSeconds: 610, isLive: false },
            ];

  return (
    <aside
      className="glass-panel station-panel bus-stop-board"
      aria-label={`Bus stop ${displayName}`}
      data-landscape={landscape ? 'true' : 'false'}
      style={{
        position: 'absolute',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 16,
        ...(landscape
          ? {
              top: 84,
              right: 16,
              maxHeight: isExpanded ? 'calc(100vh - 40px)' : 'calc(100vh - 100px)',
              height: isExpanded ? 'calc(100vh - 100px)' : 'auto',
              width: isExpanded ? 'min(820px, 68vw)' : 'min(380px, 34vw)',
              transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
            }
          : {
              left: 12,
              right: 12,
              bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
              maxHeight: isExpanded
                ? 'min(82vh, calc(100vh - env(safe-area-inset-top, 0px) - 96px))'
                : 'min(58vh, calc(100vh - 120px))',
              height: isExpanded
                ? 'min(82vh, calc(100vh - env(safe-area-inset-top, 0px) - 96px))'
                : 'auto',
              transition: 'max-height 0.22s cubic-bezier(0.4, 0, 0.2, 1), height 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
            }),
        ...dragStyle,
      }}
    >
      {/* Top drag handle indicator for swipe-down to dismiss in portrait mode */}
      {!landscape && (
        <div
          className="sheet-drag-handle-wrap"
          data-testid="station-drag-handle"
          style={{ padding: '6px 0 2px' }}
          {...handleProps}
        >
          <div className="sheet-drag-handle" />
        </div>
      )}

      {/* Header: stop emblem, stop name, line icons underneath, and live status */}
      <header
        className="station-panel-header"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: !landscape ? '2px 16px 12px' : '12px 16px 12px', borderBottom: '1px solid var(--border-color)',
        }}
        {...(!landscape ? handleProps : {})}
      >
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, flex: 1, overflow: 'hidden' }}>
          <div
            // Own class (not station-header-icon) so android.css keeps the logo rectangle, not a circle.
            // 35x18 (#108: hugs the letters, same breathing room as the map label in busMapLayers.js).
            className="bus-stop-header-emblem"
            data-testid="station-header-icon"
            aria-label="Toggle expand station panel"
            onClick={() => setIsExpanded((v) => !v)}
            title={isExpanded ? 'Collapse view' : 'Expand full view'}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 35, height: 18, minWidth: 35, borderRadius: 4,
              background: '#D62828', color: '#FFFFFF',
              boxShadow: '0 2px 6px rgba(214, 40, 40, 0.35)',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                fontSize: '0.70rem',
                fontWeight: 900,
                letterSpacing: '0.04em',
                lineHeight: 1,
                fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                userSelect: 'none',
              }}
            >
              EMT
            </span>
          </div>

          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, flex: 1, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
              <h2 style={{
                fontSize: '1.14rem', fontWeight: 800, lineHeight: 1.15,
                letterSpacing: '-.01em',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
                wordBreak: 'break-word',
                minWidth: 0, margin: 0,
              }}>
                {displayName}
              </h2>
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  background: 'rgba(214, 40, 40, 0.2)',
                  color: '#ff6369',
                  padding: '1px 5px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {stopCode}
              </span>
            </div>

            <div
              className="station-header-meta"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                flexWrap: 'nowrap',
                overflowX: 'auto',
                scrollbarWidth: 'none',
              }}
            >
              {stopLines.map((lineId) => (
                <span
                  key={lineId}
                  className="station-header-line-badge"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 20, height: 20, padding: '0 5px', borderRadius: 5,
                    background: '#D62828', color: '#fff',
                    fontSize: '.72rem', fontWeight: 900, lineHeight: 1,
                  }}
                >
                  {lineId}
                </span>
              ))}

              {/* Live status badge */}
              <span
                className="station-status-badge"
                title={t('stationPanel.live')}
                aria-label={t('stationPanel.live')}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  width: 20, height: 20, borderRadius: '50%',
                  color: '#4CAF50',
                  background: 'rgba(76,175,80,.15)',
                  marginLeft: stopLines.length > 0 ? 2 : 0,
                }}
              >
                <Radio size={11} className="pulse" />
              </span>

              {/* Confirmed checkmark */}
              <span
                className="station-confirmed-badge"
                title={t('stationPanel.confirmedStatus', { time: t('stationPanel.justNow') })}
                aria-label={t('stationPanel.confirmedStatus', { time: t('stationPanel.justNow') })}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 20, height: 20,
                  color: '#4CAF50',
                  flexShrink: 0,
                }}
              >
                <CheckCircle2 size={12} />
              </span>
            </div>
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
            className="station-panel-expand"
            aria-label={isExpanded ? 'Collapse station panel' : 'Expand station panel'}
            title={isExpanded ? 'Minimize / Collapse view' : 'Maximize / Expand full departures'}
            style={{
              width: 32,
              height: 32,
              minWidth: 32,
              borderRadius: '50%',
              border: 'none',
              background: isExpanded ? 'rgba(255, 209, 0, 0.22)' : 'var(--bg-hover)',
              color: isExpanded ? '#FFD100' : 'var(--text-primary)',
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
            onClick={onClose}
            onPointerDown={(e) => e.stopPropagation()}
            className="station-panel-close"
            aria-label={t('stationPanel.closeAria')}
            style={{
              width: 32, height: 32, minWidth: 32, borderRadius: '50%', border: 'none',
              background: 'var(--bg-hover)', color: 'var(--text-primary)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
            }}
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Departures Table */}
      <div
        className="station-panel-body"
        style={{
          maxHeight: isExpanded ? 'calc(78vh - 110px)' : TABLE_HEAD_PX + ROW_HEIGHT_PX * VISIBLE_ROWS + 8,
          overflowY: 'auto',
          padding: '0 10px 8px',
          transition: 'max-height 0.22s ease',
        }}
      >
        {arrivals.length === 0 ? (
          <p
            data-testid="no-live-arrivals"
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              fontSize: '.88rem',
              color: 'var(--text-secondary)',
              margin: 0,
            }}
          >
            {t('stationPanel.noLivePredictions', { station: displayName })}
          </p>
        ) : (
          <table className="station-arrivals-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.98rem' }}>
            <caption className="visually-hidden">{t('stationPanel.laterArrivalsCaption', { station: displayName })}</caption>
            <thead>
              <tr style={{
                fontSize: '.72rem', letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--text-secondary)',
                position: 'sticky', top: 0, background: 'var(--bg-panel-solid)', zIndex: 1,
              }}>
                <th scope="col" style={{ textAlign: 'left', padding: '5px 6px 4px', fontWeight: 700 }}>{t('stationPanel.line')}</th>
                <th scope="col" style={{ textAlign: 'left', padding: '5px 6px 4px', fontWeight: 700 }}>{t('stationPanel.towards')}</th>
                <th scope="col" style={{ textAlign: 'right', padding: '5px 6px 4px', fontWeight: 700 }}>{t('stationPanel.due')}</th>
              </tr>
            </thead>
            <tbody>
              {arrivals.map((a, i) => {
                const dueSec = a.dueSeconds ?? a.seconds ?? 0;
                const heat = countdownHeat(dueSec, theme);
                return (
                  <tr
                    key={i}
                    className="station-arrival-row"
                    style={{
                      borderTop: '1px solid var(--border-color)',
                      height: ROW_HEIGHT_PX,
                      cursor: onSelectLine ? 'pointer' : 'default',
                    }}
                    onClick={() => onSelectLine && onSelectLine(a.line)}
                  >
                    <td style={{ padding: '5px 6px', width: 1 }}>
                      <BusBadge
                        line={a.line}
                        className="station-line-badge"
                        style={{
                          minWidth: 28,
                          height: 28,
                          borderRadius: 8,
                          fontSize: '.86rem',
                          fontWeight: 900,
                          padding: '0 6px',
                        }}
                      />
                    </td>
                    <td style={{ padding: '5px 6px', maxWidth: 0 }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        minWidth: 0,
                      }}>
                        <span style={{
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontWeight: 600, fontSize: '1.08rem', color: 'var(--text-primary)',
                          minWidth: 0,
                        }}>
                          {a.destination}
                        </span>
                        {a.wheelchair && (
                          <Accessibility
                            size={14}
                            aria-label="Accessible"
                            title="Accessible bus"
                            style={{
                              color: 'var(--text-secondary)',
                              opacity: 0.8,
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </div>
                    </td>
                    <td
                      className="station-arrival-due"
                      style={{
                        padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap',
                        fontWeight: 800, fontSize: '1.08rem', fontVariantNumeric: 'tabular-nums',
                        color: heat,
                      }}
                    >
                      {dueSec <= 30 ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                          <span
                            className={`station-arriving-dot ${a.isLive ? 'pulse' : ''}`}
                            data-testid="station-arriving-dot"
                            style={{
                              width: 7, height: 7, borderRadius: '50%',
                              background: heat, display: 'inline-block',
                            }}
                          />
                          {countdownLabel(dueSec, t('common.due'))}
                        </span>
                      ) : (
                        <>
                          <span className="station-arrival-num">
                            {countdownLabel(dueSec, t('common.due'))}
                          </span>
                          {countdownUnit(dueSec) && (
                            <span style={{ fontSize: '.74rem', fontWeight: 600, marginLeft: 2, color: 'var(--text-secondary)' }}>
                              {t(`common.${countdownUnit(dueSec)}`)}
                            </span>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
};

export default BusStopBoard;
