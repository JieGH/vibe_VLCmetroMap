// The panel for the Station in focus: its name, whether what we are showing
// came from the API just now or is a countdown running on from memory, and the
// arrivals table.
//
// Docked right in landscape and bottom in portrait. Right, because on a held
// tablet that is where a thumb rests; bottom in portrait, because on a phone it
// is the only place a thumb reaches at all.
import React, { useEffect, useState } from 'react';
import { X, Radio, Database, CheckCircle2, Clock } from 'lucide-react';
import arrivalStore from '../services/arrivalStore';
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

const StationPanel = ({ station, theme, onClose, onCenter }) => {
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
    const id = setInterval(
      () => arrivalStore.getStationArrivals(station.properties),
      60000
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

  return (
    <>
      <aside
        className="glass-panel station-panel"
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

      {/* Header: which station, and how trustworthy this is */}
      <header
        style={{
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, padding: !landscape ? '6px 16px 12px' : '16px 16px 12px', borderBottom: '1px solid var(--border-color)',
        }}
        {...(!landscape ? handleProps : {})}
      >
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
          <h2 style={{
            fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.15,
            letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            minWidth: 0, flexShrink: 1,
          }}>
            {focus.name}
          </h2>

          {/* Live API vs memory. Two different claims, so they never share a
              treatment: one was fetched now, the other is a countdown running
              on from an older fetch. Rendered as compact symbols rather than
              text so the station name has full breathing room. */}
          <span
            className="station-status-badge"
            title={focus.isFresh ? t('stationPanel.live') : t('stationPanel.memory')}
            aria-label={focus.isFresh ? t('stationPanel.live') : t('stationPanel.memory')}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              width: 22, height: 22, borderRadius: '50%',
              color: focus.isFresh ? '#4CAF50' : '#00B4D8',
              background: focus.isFresh ? 'rgba(76,175,80,.15)' : 'rgba(0,180,216,.15)',
            }}
          >
            {focus.isFresh
              ? <Radio size={12} className="pulse" />
              : <Database size={12} />}
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
              ? <CheckCircle2 size={13} />
              : <Clock size={13} />}
          </span>
        </div>

        <button
          onClick={onClose}
          onPointerDown={(e) => e.stopPropagation()}
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
      <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 10px 8px' }}>
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
          <table className="station-arrivals-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.82rem' }}>
            <caption className="visually-hidden">{t('stationPanel.laterArrivalsCaption', { station: focus.name })}</caption>
            <thead>
              <tr style={{
                fontSize: '.62rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-secondary)',
                position: 'sticky', top: 0, background: 'var(--bg-panel-solid)', zIndex: 1,
              }}>
                <th scope="col" style={{ textAlign: 'left', padding: '6px 8px 5px', fontWeight: 700 }}>{t('stationPanel.line')}</th>
                <th scope="col" style={{ textAlign: 'left', padding: '6px 8px 5px', fontWeight: 700 }}>{t('stationPanel.towards')}</th>
                <th scope="col" style={{ textAlign: 'right', padding: '6px 8px 5px', fontWeight: 700 }}>{t('stationPanel.due')}</th>
              </tr>
            </thead>
            <tbody>
              {focus.arrivals.map((a, i) => (
                <tr key={i} className="station-arrival-row" style={{ borderTop: '1px solid var(--border-color)' }}>
                  <td style={{ padding: '7px 8px', width: 1 }}>
                    <span
                      className="station-line-badge"
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 24, height: 24, padding: '0 6px', borderRadius: 7,
                        background: lineColor(a.line), color: '#000',
                        fontSize: '.72rem', fontWeight: 900,
                      }}
                    >
                      {a.line}
                    </span>
                  </td>
                  <td style={{ padding: '7px 8px', maxWidth: 0 }}>
                    <div style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: 600, fontSize: '.82rem', color: 'var(--text-primary)',
                    }}>
                      {a.destination}
                    </div>
                    {a.vehicleId && (
                      <div style={{ fontSize: '.62rem', color: 'var(--text-secondary)' }}>
                        {t('stationPanel.vehicle', { id: a.vehicleId })}
                      </div>
                    )}
                  </td>
                  <td
                    className="station-arrival-due"
                    style={{
                      padding: '7px 8px', textAlign: 'right', whiteSpace: 'nowrap',
                      fontWeight: 800, fontSize: '.88rem', fontVariantNumeric: 'tabular-nums',
                      color: countdownHeat(a.seconds, theme),
                    }}
                  >
                    {countdownLabel(a.seconds, t('common.due'))}
                    {countdownUnit(a.seconds) && (
                      <span style={{ fontSize: '.62rem', fontWeight: 600, marginLeft: 2, color: 'var(--text-secondary)' }}>
                        {t(`common.${countdownUnit(a.seconds)}`)}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <footer style={{ padding: 10, borderTop: '1px solid var(--border-color)' }}>
        <button
          onClick={onCenter}
          style={{
            width: '100%', minHeight: 44, borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'var(--bg-hover)', color: 'var(--text-primary)',
            fontWeight: 700, fontSize: '.82rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {t('stationPanel.recentreButton')}
        </button>
      </footer>
    </aside>
  </>
);
};

export default StationPanel;
