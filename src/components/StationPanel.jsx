// The panel for the Station in focus: its name, whether what we are showing
// came from the API just now or is a countdown running on from memory, and the
// arrivals table.
//
// Docked right in landscape and bottom in portrait. Right, because on a held
// tablet that is where a thumb rests; bottom in portrait, because on a phone it
// is the only place a thumb reaches at all.
import React, { useEffect, useState } from 'react';
import { X, Radio, Database } from 'lucide-react';
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
        <div style={{ minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 8, overflow: 'hidden' }}>
          <h2 style={{
            fontSize: '1.05rem', fontWeight: 800, lineHeight: 1.15,
            letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            minWidth: 0, flexShrink: 1,
          }}>
            {focus.name}
          </h2>

          {/* Live API vs memory. Two different claims, so they never share a
              treatment: one was fetched now, the other is a countdown running
              on from an older fetch. Sharing the name's line rather than a row
              of its own is what makes the compacted header fit in one line. */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
            padding: '2px 7px', borderRadius: 999, fontSize: '.62rem', fontWeight: 700,
            letterSpacing: '.03em', whiteSpace: 'nowrap',
            color: focus.isFresh ? '#4CAF50' : '#00B4D8',
            background: focus.isFresh ? 'rgba(76,175,80,.15)' : 'rgba(0,180,216,.15)',
          }}>
            {focus.isFresh
              ? <><Radio size={9} className="pulse" /> {t('stationPanel.live')}</>
              : <><Database size={9} /> {t('stationPanel.memory')}</>}
          </span>
          <span style={{ fontSize: '.64rem', color: 'var(--text-secondary)', flexShrink: 0, whiteSpace: 'nowrap' }}>
            {t('stationPanel.confirmedStatus', { time: unheardLabel })}
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

      {/* Directions summary — primary headline arrivals for each direction served.
          This is the primary information the panel is opened for, so it is given
          hero visual prominence: large Line badge, prominent destination name,
          and a large, bold arrival countdown timer. */}
      {focus.directions.length > 0 && (
        <div
          className="station-primary-arrivals"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 1,
            background: 'var(--border-color)',
            flexShrink: 0,
          }}
        >
          {focus.directions.map((d) => {
            const next = d.arrivals[0];
            return (
              <div
                key={d.key}
                title={d.label}
                className="station-arrival-row"
                style={{
                  background: 'var(--bg-panel-solid)',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                {/* Hero Line badge for the primary arrival */}
                {next && (
                  <span
                    className="station-line-badge station-arrival-badge--hero"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      minWidth: 28,
                      height: 26,
                      padding: '0 6px',
                      borderRadius: 7,
                      background: lineColor(next.line),
                      color: '#000',
                      fontSize: '.82rem',
                      fontWeight: 900,
                      flexShrink: 0,
                      boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    }}
                  >
                    {next.line}
                  </span>
                )}
                <span style={{ fontSize: '.8rem', color: 'var(--text-secondary)', flexShrink: 0 }}>→</span>
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <div
                    style={{
                      fontSize: '.92rem',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      lineHeight: 1.2,
                    }}
                  >
                    {d.label}
                  </div>
                  {next?.vehicleId && (
                    <div style={{ fontSize: '.62rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
                      {t('stationPanel.vehicle', { id: next.vehicleId })}
                    </div>
                  )}
                </div>
                {next ? (
                  <div
                    className="station-arrival-due"
                    style={{
                      fontSize: '1.35rem',
                      fontWeight: 800,
                      flexShrink: 0,
                      lineHeight: 1,
                      fontVariantNumeric: 'tabular-nums',
                      color: countdownHeat(next.seconds, theme),
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 2,
                    }}
                  >
                    <span>{countdownLabel(next.seconds, t('common.due'))}</span>
                    {countdownUnit(next.seconds) && (
                      <span style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                        {t(`common.${countdownUnit(next.seconds)}`)}
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ fontSize: '.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                    —
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Later arrivals table. Capped to roughly three rows so the panel stays compact.
          This secondary timetable is subordinate to the headline arrivals above:
          compact Line badge (19px), smaller typography, and compact row spacing. */}
      <div style={{ maxHeight: 172, overflowY: 'auto', padding: '4px 10px 8px' }}>
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
        ) : focus.laterArrivals.length === 0 ? (
          <p style={{ padding: '12px 20px', textAlign: 'center', fontSize: '.74rem', color: 'var(--text-secondary)' }}>
            {t('stationPanel.nothingFurther')}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.75rem' }}>
            <caption className="visually-hidden">{t('stationPanel.laterArrivalsCaption', { station: focus.name })}</caption>
            <thead>
              <tr style={{
                fontSize: '.60rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--text-secondary)',
                position: 'sticky', top: 0, background: 'var(--bg-panel-solid)', zIndex: 1,
              }}>
                <th scope="col" style={{ textAlign: 'left', padding: '5px 6px 4px', fontWeight: 700 }}>{t('stationPanel.line')}</th>
                <th scope="col" style={{ textAlign: 'left', padding: '5px 6px 4px', fontWeight: 700 }}>{t('stationPanel.towards')}</th>
                <th scope="col" style={{ textAlign: 'right', padding: '5px 6px 4px', fontWeight: 700 }}>{t('stationPanel.due')}</th>
              </tr>
            </thead>
            <tbody>
              {focus.laterArrivals.map((a, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border-color)' }}>
                  {/* Compact secondary badge */}
                  <td style={{ padding: '5px 6px', width: 1 }}>
                    <span
                      className="station-line-badge station-arrival-badge--compact"
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        minWidth: 19, height: 19, padding: '0 4px', borderRadius: 5,
                        background: lineColor(a.line), color: '#000',
                        fontSize: '.62rem', fontWeight: 800,
                      }}
                    >
                      {a.line}
                    </span>
                  </td>
                  <td style={{ padding: '5px 6px', maxWidth: 0 }}>
                    <div style={{
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      fontWeight: 500, fontSize: '.74rem', color: 'var(--text-primary)',
                    }}>
                      {a.destination}
                    </div>
                    {a.vehicleId && (
                      <div style={{ fontSize: '.58rem', color: 'var(--text-secondary)' }}>
                        {t('stationPanel.vehicle', { id: a.vehicleId })}
                      </div>
                    )}
                  </td>
                  <td style={{
                    padding: '5px 6px', textAlign: 'right', whiteSpace: 'nowrap',
                    fontWeight: 700, fontSize: '.74rem', fontVariantNumeric: 'tabular-nums',
                    color: countdownHeat(a.seconds, theme),
                  }}>
                    {countdownLabel(a.seconds, t('common.due'))}
                    {countdownUnit(a.seconds) && (
                      <span style={{ fontSize: '.58rem', fontWeight: 600, marginLeft: 2, color: 'var(--text-secondary)' }}>
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
