// The panel for the Station in focus: its name, whether what we are showing
// came from the API just now or is a countdown running on from memory, and the
// arrivals table.
//
// Docked right in landscape and bottom in portrait. Right, because on a held
// tablet that is where a thumb rests; bottom in portrait, because on a phone it
// is the only place a thumb reaches at all.
import React, { useEffect, useState } from 'react';
import { X, Radio, Database, CheckCircle2, Clock } from 'lucide-react';
import arrivalStore, { CACHE_TTL_MS } from '../services/arrivalStore';
import { getStationFocus } from '../services/stationFocus';
import { countdownHeat, countdownLabel, countdownUnit } from '../utils/countdownHeat';
import { lineColor } from '../utils/lineColor';
import { LANDSCAPE_BREAKPOINT_PX } from '../utils/layout';
import { useDragToDismiss } from '../utils/useDragToDismiss';
import { useTranslation } from '../i18n';

// Landscape docks the panel right, portrait docks it bottom. Measured rather
// than read from an orientation media query, because a narrow landscape window
// on a desktop should get the portrait treatment too.
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

// Compact sheet, mirroring the native StationSheet: header plus four rows of
// ROW_HEIGHT_PX, anything further scrolls inside the body.
const ROW_HEIGHT_PX = 48;
const VISIBLE_ROWS = 4;
const TABLE_HEAD_PX = 30;

const StationPanel = ({ station, theme, onClose }) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const landscape = useIsLandscape();

  const { handleProps, cardStyle: dragStyle } = useDragToDismiss({
    onDismiss: onClose,
    enabled: !landscape && Boolean(station),
    threshold: 70,
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // getStationFocus only ever reads arrivalStore's cache — it has to, since it
  // also runs inside MapView's floating node every second and must not fire a
  // network request from there. Something has to be the one place that
  // actually asks the API for the Station just clicked, or any Station
  // outside the Strategic Hubs and Major Stations stays "confirmed never
  // fetched" forever, however live its real trains are. That's this effect.
  useEffect(() => {
    if (!station) return undefined;
    arrivalStore.getStationArrivals(station.properties);
    // Just past the memory pause, not on it: the tap's fetch lands ~0.5s
    // after the click, so a 60s poll found the entry 59.5s old, skipped the
    // request, and an open panel only refreshed every 120s
    // (docs/research/marker-drift.md).
    const id = setInterval(
      () => arrivalStore.getStationArrivals(station.properties),
      CACHE_TTL_MS + 1000
    );
    return () => clearInterval(id);
  }, [station]);

  useEffect(() => {
    if (!station) return undefined;
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
  }, [station, onClose]);

  if (!station) return null;

  const focus = getStationFocus(station.properties, now);
  const unheardLabel = focus.secondsUnheard === null
    ? t('stationPanel.neverFetched')
    : focus.secondsUnheard < 60
      ? t('stationPanel.justNow')
      : t('stationPanel.minAgo', { min: Math.round(focus.secondsUnheard / 60) });

  const stationLines = focus.servedLines || [];

  return (
    <>
      <aside
        className="glass-panel station-panel"
        aria-label={focus.name}
      data-landscape={landscape ? 'true' : 'false'}
      style={{
        position: 'absolute',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderRadius: 16,
        ...(landscape
          // top clears the search bar's own row (its container sits at
          // top:20, height ~52px) — starting level with it let the panel's
          // z-index paint over the theme and dashboard-mode buttons, making
          // them unclickable while a station was focused.
          ? { top: 84, right: 16, maxHeight: 'calc(100vh - 100px)', width: 'min(380px, 34vw)' }
          : {
              left: 12,
              right: 12,
              bottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
              maxHeight: 'min(58vh, calc(100vh - 120px))',
            }),
        ...dragStyle,
      }}
    >
      {/* Top drag handle indicator for swipe-down to dismiss in portrait mode */}
      {!landscape && (
        <div
          className="sheet-drag-handle-wrap"
          data-testid="station-drag-handle"
          {...handleProps}
        >
          <div className="sheet-drag-handle" />
        </div>
      )}

      {/* Header: station name, line icons underneath, station icon on the left, and live status */}
      <header
        className="station-panel-header"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: !landscape ? '8px 16px 12px' : '16px 16px 12px', borderBottom: '1px solid var(--border-color)',
        }}
        {...(!landscape ? handleProps : {})}
      >
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, flex: 1, overflow: 'hidden' }}>
          <div
            className="station-header-icon"
            data-testid="station-header-icon"
            aria-hidden="true"
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              width: 34, height: 34, minWidth: 34, borderRadius: '50%',
              background: '#E2001A', color: '#FFFFFF',
              boxShadow: '0 2px 6px rgba(226, 0, 26, 0.35)',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: '1.18rem',
                fontWeight: 900,
                fontStyle: 'italic',
                fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                lineHeight: 1,
                transform: 'translate(-0.5px, -0.5px)',
                userSelect: 'none',
              }}
            >
              m
            </span>
          </div>

          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, flex: 1, overflow: 'hidden' }}>
            <h2 style={{
              fontSize: '1.14rem', fontWeight: 800, lineHeight: 1.15,
              letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              minWidth: 0, margin: 0,
            }}>
              {focus.name}
            </h2>

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
              {stationLines.map((lineId) => (
                <span
                  key={lineId}
                  className="station-header-line-badge"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    minWidth: 20, height: 20, padding: '0 5px', borderRadius: 5,
                    background: lineColor(lineId), color: '#000',
                    fontSize: '.72rem', fontWeight: 900, lineHeight: 1,
                  }}
                >
                  {lineId}
                </span>
              ))}

              {/* Live API vs memory status */}
              <span
                className="station-status-badge"
                title={focus.isFresh ? t('stationPanel.live') : t('stationPanel.memory')}
                aria-label={focus.isFresh ? t('stationPanel.live') : t('stationPanel.memory')}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  width: 20, height: 20, borderRadius: '50%',
                  color: focus.isFresh ? '#4CAF50' : '#00B4D8',
                  background: focus.isFresh ? 'rgba(76,175,80,.15)' : 'rgba(0,180,216,.15)',
                  marginLeft: stationLines.length > 0 ? 2 : 0,
                }}
              >
                {focus.isFresh
                  ? <Radio size={11} className="pulse" />
                  : <Database size={11} />}
              </span>
              <span
                className="station-confirmed-badge"
                title={t('stationPanel.confirmedStatus', { time: unheardLabel })}
                aria-label={t('stationPanel.confirmedStatus', { time: unheardLabel })}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  color: focus.secondsUnheard !== null && focus.secondsUnheard < 60 ? '#4CAF50' : 'var(--text-secondary)',
                  flexShrink: 0,
                }}
              >
                {focus.secondsUnheard !== null && focus.secondsUnheard < 60
                  ? <CheckCircle2 size={12} />
                  : <Clock size={12} />}
              </span>
            </div>
          </div>
        </div>

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
      </header>

      {/* Unified arrivals table ranked by closest arrival time. */}
      <div className="station-panel-body" style={{ maxHeight: TABLE_HEAD_PX + ROW_HEIGHT_PX * VISIBLE_ROWS + 8, overflowY: 'auto', padding: '0 10px 4px' }}>
        {focus.fetchError && (
          <div role="status" style={{
            margin: '8px 0', padding: '8px 10px', borderRadius: 8,
            background: 'rgba(255,152,0,.14)', color: '#ffb74d', fontSize: '.72rem', lineHeight: 1.35,
          }}>
            {focus.fetchError}
          </div>
        )}

        {focus.arrivals.length === 0 ? (
          <p style={{ padding: 20, textAlign: 'center', fontSize: '.8rem', color: 'var(--text-secondary)' }}>
            {t('stationPanel.noLiveTrains')}
          </p>
        ) : (
          <table className="station-arrivals-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.98rem' }}>
            <caption className="visually-hidden">{t('stationPanel.laterArrivalsCaption', { station: focus.name })}</caption>
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
              {focus.arrivals.map((a, i) => (
                <tr key={i} className="station-arrival-row" style={{ borderTop: '1px solid var(--border-color)', height: ROW_HEIGHT_PX }}>
                  <td style={{ padding: '5px 6px', width: 1 }}>
                    <span
                      className="station-line-badge"
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 28, height: 28, padding: '0 6px', borderRadius: 8,
                        background: lineColor(a.line), color: '#000',
                        fontSize: '.86rem', fontWeight: 900,
                      }}
                    >
                      {a.line}
                    </span>
                  </td>
                  <td style={{ padding: '5px 6px', maxWidth: 0 }}>
                    <div style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: 600, fontSize: '1.08rem', color: 'var(--text-primary)',
                    }}>
                      {a.destination}
                    </div>
                  </td>
                  <td
                    className="station-arrival-due"
                    style={{
                      padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap',
                      fontWeight: 800, fontSize: '1.08rem', fontVariantNumeric: 'tabular-nums',
                      color: countdownHeat(a.seconds, theme),
                    }}
                  >
                    {a.seconds <= 30 ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                        <span
                          className="station-arriving-dot pulse"
                          data-testid="station-arriving-dot"
                          style={{
                            width: 7, height: 7, borderRadius: '50%',
                            background: countdownHeat(a.seconds, theme), display: 'inline-block',
                          }}
                        />
                        {countdownLabel(a.seconds, t('common.due'))}
                      </span>
                    ) : (
                      <>
                        <span className="station-arrival-num">{countdownLabel(a.seconds, t('common.due'))}</span>
                        {countdownUnit(a.seconds) && (
                          <span style={{ fontSize: '.74rem', fontWeight: 600, marginLeft: 2, color: 'var(--text-secondary)' }}>
                            {t(`common.${countdownUnit(a.seconds)}`)}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </aside>
  </>
);
};

export default StationPanel;
