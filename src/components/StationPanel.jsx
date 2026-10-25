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
import { getStationBusFeeders } from '../data/emtData';
import ConnectingBusSection from './ConnectingBusSection';
import CompactMetroSection from './CompactMetroSection';
import { getDistance, nearbyFeatures } from '../utils/geoUtils';
import { walkingMinutes } from '../utils/walking';
import gtfsData from '../data/gtfs_expanded.json';

const allMetroStations = gtfsData.features.filter(f => f.geometry.type === 'Point');

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

const StationPanel = ({
  station,
  theme,
  onClose,
  variant = 'default',
  onSelectFeederStop,
  onSelectStation,
  userLocation,
}) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now());
  const landscape = useIsLandscape();
  const [activeTab, setActiveTab] = useState(() => (typeof window !== 'undefined' && window.innerWidth >= LANDSCAPE_BREAKPOINT_PX ? 'split' : 'metro'));

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
  const userCoords = userLocation?.coordinates;
  const stationCoords = station.geometry?.coordinates;
  const anchorCoords = userCoords || stationCoords;
  const metroWalkMeters = (userCoords && stationCoords) ? Math.round(getDistance(userCoords, stationCoords)) : undefined;
  const metroWalkMin = metroWalkMeters !== undefined ? walkingMinutes(metroWalkMeters) : undefined;

  // Other Metro stations within 10-minute walk radius (~800m) of this station/anchor:
  const nearbyMetro = anchorCoords ? nearbyFeatures(allMetroStations, anchorCoords, 800)
    .filter((m) => m.feature.properties.name !== focus.name)
    .slice(0, 4) : [];

  const rawFeeders = getStationBusFeeders(focus.name, stationCoords);
  const feeders = rawFeeders.map((f) => {
    if (!anchorCoords || !f.coordinates) return f;
    const dist = Math.round(getDistance(anchorCoords, f.coordinates));
    const mins = walkingMinutes(dist);
    return { ...f, walkMetres: dist, walkMin: mins };
  }).filter((f) => !anchorCoords || f.walkMin <= 10); // 10 minutes walk radius

  const totalBusLines = feeders.reduce((acc, f) => acc + (f.lines?.length || 0), 0);

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
          ? {
              top: 84,
              right: 16,
              maxHeight: 'calc(100vh - 100px)',
              width: (variant === 'A' && activeTab === 'split') ? 'min(680px, 55vw)' : 'min(380px, 34vw)',
              transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
            }
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
          style={{ padding: '6px 0 2px' }}
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
          gap: 12, padding: !landscape ? '2px 16px 12px' : '12px 16px 12px', borderBottom: '1px solid var(--border-color)',
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
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0 }}>
              <h2 style={{
                fontSize: '1.14rem', fontWeight: 800, lineHeight: 1.15,
                letterSpacing: '-.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                minWidth: 0, margin: 0,
              }}>
                {focus.name}
              </h2>
              {metroWalkMin !== undefined && metroWalkMeters !== undefined && (
                <span
                  style={{
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    color: 'var(--text-secondary)',
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  · {metroWalkMin} min ({metroWalkMeters}m)
                </span>
              )}
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

              {variant === 'A' && feeders.length > 0 && (
                <span
                  className="station-header-feeder-badge"
                  style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    height: 20, padding: '0 6px', borderRadius: 5,
                    background: 'rgba(214, 40, 40, 0.22)', color: '#ff6369',
                    fontSize: '.68rem', fontWeight: 800, lineHeight: 1, border: '1px solid rgba(214, 40, 40, 0.35)',
                    whiteSpace: 'nowrap',
                  }}
                  title={`${feeders.length} nearby EMT bus stops within 10 min walk`}
                >
                  <span style={{ fontSize: '0.54rem', fontWeight: 900, background: '#D62828', color: '#fff', padding: '1px 3px', borderRadius: 2 }}>EMT</span>
                  <span>+{feeders.length} stops</span>
                </span>
              )}

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
                  width: 20, height: 20,
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

      {/* Multimodal Hub Tabs in Variant A */}
      {variant === 'A' && (
        <nav
          className="station-multimodal-tabs"
          aria-label="Multimodal arrivals navigation"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            padding: '6px 12px',
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(0,0,0,0.12)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflowX: 'auto' }}>
            <button
              type="button"
              onClick={() => setActiveTab('metro')}
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                border: 'none',
                background: activeTab === 'metro' ? '#E2001A' : 'var(--bg-hover)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '.75rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                boxShadow: activeTab === 'metro' ? '0 2px 6px rgba(226,0,26,0.35)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  background: activeTab === 'metro' ? '#ffffff' : '#E2001A',
                  color: activeTab === 'metro' ? '#E2001A' : '#ffffff',
                  fontSize: '0.58rem',
                  fontWeight: 900,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                m
              </span>
              <span>Metro</span>
              <span style={{ fontSize: '.68rem', opacity: 0.85, background: 'rgba(0,0,0,0.25)', padding: '1px 5px', borderRadius: 4 }}>
                {focus.arrivals.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('bus')}
              style={{
                padding: '4px 10px',
                borderRadius: 8,
                border: 'none',
                background: activeTab === 'bus' ? '#1565C0' : 'var(--bg-hover)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '.75rem',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                boxShadow: activeTab === 'bus' ? '0 2px 6px rgba(21,101,192,0.35)' : 'none',
                transition: 'all 0.15s ease',
              }}
            >
              <span
                style={{
                  fontSize: '0.54rem',
                  fontWeight: 900,
                  background: '#D62828',
                  color: '#ffffff',
                  padding: '1px 3px',
                  borderRadius: 2,
                  letterSpacing: '0.04em',
                  lineHeight: 1,
                }}
              >
                EMT
              </span>
              <span>Bus</span>
              <span style={{ fontSize: '.68rem', opacity: 0.85, background: 'rgba(0,0,0,0.25)', padding: '1px 5px', borderRadius: 4 }}>
                {totalBusLines}
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setActiveTab(activeTab === 'split' ? 'metro' : 'split')}
            title="Toggle side-by-side split view with two independent scrolling lists"
            style={{
              padding: '4px 8px',
              borderRadius: 8,
              border: '1px solid var(--border-color, rgba(255,255,255,0.14))',
              background: activeTab === 'split' ? '#37474F' : 'transparent',
              color: activeTab === 'split' ? '#80D8FF' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '.72rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              transition: 'all 0.15s ease',
            }}
          >
            <span>Dual Split</span>
          </button>
        </nav>
      )}

      {/* Body Container */}
      {variant === 'A' ? (
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          {focus.fetchError && (
            <div role="status" style={{
              margin: '6px 10px', padding: '6px 10px', borderRadius: 8,
              background: 'rgba(255,152,0,.14)', color: '#ffb74d', fontSize: '.72rem', lineHeight: 1.35,
            }}>
              {focus.fetchError}
            </div>
          )}

          {/* Dual Split Mode: Two independent side-by-side columns */}
          {activeTab === 'split' ? (
            <div
              className="multimodal-dual-scroll-container"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 10,
                height: 'min(50vh, 400px)',
                padding: '8px 10px',
                overflow: 'hidden',
              }}
            >
              {/* Left Column: Metro List (Independent scroll) */}
              <div
                className="independent-metro-scroll"
                style={{
                  height: '100%',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  paddingRight: 6,
                  borderRight: '1px solid var(--border-color, rgba(255,255,255,0.08))',
                }}
              >
                <CompactMetroSection
                  arrivals={focus.arrivals}
                  stationName={focus.name}
                  theme={theme}
                  unheardLabel={unheardLabel}
                  isLive={focus.isLive}
                  walkMetres={metroWalkMeters}
                  walkMin={metroWalkMin}
                  nearbyMetro={nearbyMetro}
                  onSelectStation={onSelectStation}
                />
              </div>

              {/* Right Column: Bus List (Independent scroll) */}
              <div
                className="independent-bus-scroll"
                style={{
                  height: '100%',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  paddingLeft: 6,
                }}
              >
                <ConnectingBusSection
                  stationName={focus.name}
                  stationCoords={station.geometry?.coordinates}
                  feeders={feeders}
                  theme={theme}
                  onSelectFeederStop={onSelectFeederStop}
                />
              </div>
            </div>
          ) : (
            /* Single Tab Mode: Two independent tabs preserving scroll viewports */
            <div style={{ height: 'min(48vh, 390px)', position: 'relative' }}>
              <div
                className="independent-metro-scroll"
                style={{
                  display: activeTab === 'metro' ? 'block' : 'none',
                  height: '100%',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  padding: '8px 12px 10px',
                }}
              >
                <CompactMetroSection
                  arrivals={focus.arrivals}
                  stationName={focus.name}
                  theme={theme}
                  unheardLabel={unheardLabel}
                  isLive={focus.isLive}
                  walkMetres={metroWalkMeters}
                  walkMin={metroWalkMin}
                  nearbyMetro={nearbyMetro}
                  onSelectStation={onSelectStation}
                />
              </div>

              <div
                className="independent-bus-scroll"
                style={{
                  display: activeTab === 'bus' ? 'block' : 'none',
                  height: '100%',
                  overflowY: 'auto',
                  WebkitOverflowScrolling: 'touch',
                  padding: '8px 12px 10px',
                }}
              >
                <ConnectingBusSection
                  stationName={focus.name}
                  stationCoords={station.geometry?.coordinates}
                  feeders={feeders}
                  theme={theme}
                  onSelectFeederStop={onSelectFeederStop}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Baseline view for other variants and existing tests */
        <div
          className="station-panel-body"
          style={{
            maxHeight: TABLE_HEAD_PX + ROW_HEIGHT_PX * VISIBLE_ROWS + 8,
            overflowY: 'auto',
            padding: '0 10px 8px'
          }}
        >
          {focus.fetchError && (
            <div role="status" style={{
              margin: '8px 0', padding: '8px 10px', borderRadius: 8,
              background: 'rgba(255,152,0,.14)', color: '#ffb74d', fontSize: '.72rem', lineHeight: 1.35,
            }}>
              {focus.fetchError}
            </div>
          )}

          {focus.arrivals.length === 0 ? (
            <p style={{ padding: 16, textAlign: 'center', fontSize: '.8rem', color: 'var(--text-secondary)' }}>
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
      )}

    </aside>
  </>
);
};

export default StationPanel;
