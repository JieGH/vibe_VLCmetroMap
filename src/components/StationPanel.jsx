// The panel for the Station in focus: its name, whether what we are showing
// came from the API just now or is a countdown running on from memory, and the
// arrivals table.
//
// Docked right in landscape and bottom in portrait. Right, because on a held
// tablet that is where a thumb rests; bottom in portrait, because on a phone it
// is the only place a thumb reaches at all.
import React, { useEffect, useState, useMemo } from 'react';
import { X, Radio, Database, CheckCircle2, Clock, Maximize2, Minimize2 } from 'lucide-react';
import arrivalStore, { CACHE_TTL_MS } from '../services/arrivalStore';
import { getStationFocus } from '../services/stationFocus';
import { countdownHeat, countdownLabel, countdownUnit } from '../utils/countdownHeat';
import { lineColor } from '../utils/lineColor';
import { LANDSCAPE_BREAKPOINT_PX } from '../utils/layout';
import { useDragToDismiss } from '../utils/useDragToDismiss';
import { useTranslation } from '../i18n';
import { getStationBusFeeders, getAllBusStops } from '../data/emtData';
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

// Portrait expanded sheet: bottom edge is 12px + bottom inset, so its top edge
// is 100vh - 12 - bottom - height. Subtracting both insets plus 84px keeps that
// top at (top inset + 72px), just below the top bar row (12px offset, ~52px
// tall, 8px gap), including Dynamic Island devices.
// Collapsed split-view sheet sits 8px lower than the default 12px gap.
// #107: the collapsed multimodal body uses one height on every tab so switching never resizes the sheet.
export const MULTIMODAL_BODY_HEIGHT = 'min(50vh, 400px)';

/** Collapsed-sheet geometry for a multimodal tab (identical across All/Metro/EMT). */
export function multimodalSheetGeometry(_tab, isExpanded) {
  return {
    bottom: isExpanded ? 'calc(12px + env(safe-area-inset-bottom, 0px))' : SPLIT_SHEET_BOTTOM,
    bodyHeight: isExpanded ? '100%' : MULTIMODAL_BODY_HEIGHT,
  };
}

// #111: split-view horizontal spacing. Was gap 10 + side padding 10 + metro padR 6 + bus padL 6 (23px dead strip).
export const SPLIT_LAYOUT = { columns: '1fr 1.25fr', gap: 3, sidePadding: 6, metroPadRight: 3, busPadLeft: 0 };

export const SPLIT_SHEET_BOTTOM = 'calc(4px + env(safe-area-inset-bottom, 0px))';
export const EXPANDED_SHEET_HEIGHT =
  'min(82vh, calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 84px))';

const StationPanel = ({
  station,
  theme,
  onClose,
  _variant = 'default',
  onSelectFeederStop,
  onSelectStation,
  userLocation,
  isPin,
}) => {
  const { t } = useTranslation();
  const [now, setNow] = useState(Date.now);
  const landscape = useIsLandscape();
  const [activeTab, setActiveTab] = useState('split');
  const [isExpanded, setIsExpanded] = useState(false);

  const isPinPlace = isPin !== undefined
    ? isPin
    : Boolean(
        station?.isPin ||
        station?.properties?.isPin ||
        station?.properties?.name === 'Map Ping' ||
        station?.properties?.name === "Where you're at"
      );

  const { handleProps, cardStyle: dragStyle } = useDragToDismiss({
    onDismiss: onClose,
    enabled: !landscape && Boolean(station),
    threshold: 70,
  });

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const userCoords = userLocation?.coordinates;
  const stationCoords = station?.geometry?.coordinates;
  const anchorCoords = userCoords || stationCoords;
  const metroWalkMeters = (userCoords && stationCoords) ? Math.round(getDistance(userCoords, stationCoords)) : undefined;
  const metroWalkMin = metroWalkMeters !== undefined ? walkingMinutes(metroWalkMeters) : undefined;

  // Other Metro stations within 5-minute walk radius (~500m) of this station/anchor:
  const nearbyMetro = useMemo(() => {
    if (!anchorCoords) return [];
    const stationName = station?.properties?.name;
    return nearbyFeatures(allMetroStations, anchorCoords, 500)
      .filter((m) => m.feature.properties.name !== stationName)
      .slice(0, 8);
  }, [anchorCoords, station?.properties?.name]);

  const nearbyMetroWithFocus = useMemo(() => {
    return nearbyMetro.map((m) => {
      const mFocus = getStationFocus(m.feature.properties, now);
      return {
        ...m,
        focus: mFocus,
        arrivals: mFocus.arrivals || [],
        lines: m.feature.properties.lines || mFocus.servedLines || [],
      };
    });
  }, [nearbyMetro, now]);

  // getStationFocus only ever reads arrivalStore's cache — it has to, since it
  // also runs inside MapView's floating node every second and must not fire a
  // network request from there. Something has to be the one place that
  // actually asks the API for the Station just clicked, or any Station
  // outside the Strategic Hubs and Major Stations stays "confirmed never
  // fetched" forever, however live its real trains are. That's this effect.
  useEffect(() => {
    if (!station) return undefined;
    const fetchArrivals = () => {
      if (station.properties) {
        arrivalStore.getStationArrivals(station.properties);
      }
      if (nearbyMetro && nearbyMetro.length > 0) {
        nearbyMetro.forEach((m) => {
          if (m.feature?.properties) {
            arrivalStore.getStationArrivals(m.feature.properties);
          }
        });
      }
    };
    fetchArrivals();
    const id = setInterval(fetchArrivals, CACHE_TTL_MS + 1000);
    return () => clearInterval(id);
  }, [station, nearbyMetro]);

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

  const rawFeeders = getStationBusFeeders(focus.name, stationCoords);
  const feeders = anchorCoords
    ? (() => {
        const allStops = getAllBusStops() || [];
        const nearbyReal = allStops
          .map((stop) => {
            const dist = Math.round(getDistance(anchorCoords, stop.coordinates));
            const mins = walkingMinutes(dist);
            return {
              stopCode: String(stop.stopCode || stop.code || ''),
              stopName: stop.stopName || stop.name || 'Parada EMT',
              walkMetres: dist,
              walkMin: mins,
              bearingDegrees: 90,
              coordinates: stop.coordinates,
              lines: (stop.lines && stop.lines.length > 0 ? stop.lines : ['19', 'C1']).map((l) => ({
                line: String(typeof l === 'object' && l !== null ? (l.line || l.id) : l),
                destination: typeof l === 'object' && l?.destination ? l.destination : 'Centre / Platja',
                dueSeconds: typeof l === 'object' && l?.dueSeconds ? l.dueSeconds : 180,
                isLive: true,
                vehicleId: `EMT-${stop.stopCode || '1000'}`,
              })),
            };
          })
          .filter((f) => f.walkMetres <= 500 || f.walkMin <= 6)
          .sort((a, b) => a.walkMetres - b.walkMetres);

        if (nearbyReal.length > 0) return nearbyReal;
        return rawFeeders.map((f) => {
          if (!f.coordinates) return f;
          const dist = Math.round(getDistance(anchorCoords, f.coordinates));
          const mins = walkingMinutes(dist);
          return { ...f, walkMetres: dist, walkMin: mins };
        }).filter((f) => f.walkMin <= 6);
      })()
    : rawFeeders;

  const _totalBusLines = feeders.reduce((acc, f) => acc + (f.lines?.length || 0), 0);
  const metroStopsCount = (focus.name === 'Map Ping' || focus.name === "Where you're at") ? nearbyMetro.length : (1 + nearbyMetro.length);
  const busStopsCount = feeders.length;
  const allStopsCount = metroStopsCount + busStopsCount;
  const isMultimodal = Boolean(isPinPlace);

  const renderMultimodalTabs = (isHeaderRow = false) => (
    <nav
      className="station-multimodal-tabs"
      aria-label="Multimodal arrivals navigation"
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        minWidth: 0,
        ...(isHeaderRow
          ? { flex: 1 }
          : { padding: '8px 14px', borderBottom: '1px solid var(--border-color)', background: 'rgba(0,0,0,0.12)' }),
      }}
    >
      {/* Tab 1: All */}
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'split'}
        onClick={() => setActiveTab('split')}
        onPointerDown={(e) => e.stopPropagation()}
        title="All transit departures (Trains and Bus side-by-side)"
        style={{
          padding: '6px 13px',
          borderRadius: 9,
          border: 'none',
          background: activeTab === 'split' ? '#37474F' : 'var(--bg-hover)',
          color: activeTab === 'split' ? '#80D8FF' : '#ffffff',
          fontWeight: 800,
          fontSize: '.84rem',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: activeTab === 'split' ? '0 2px 6px rgba(55,71,79,0.35)' : 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <span>All</span>
        <span
          style={{
            fontSize: '.72rem',
            opacity: 0.9,
            background: 'rgba(0,0,0,0.28)',
            padding: '1.5px 6px',
            borderRadius: 5,
          }}
        >
          {allStopsCount}
        </span>
      </button>

      {/* Tab 2: Metro Trains */}
      <button
        type="button"
        role="tab"
        aria-label="Metro train departures"
        aria-selected={activeTab === 'metro'}
        onClick={() => setActiveTab('metro')}
        onPointerDown={(e) => e.stopPropagation()}
        title="Trains departures only"
        style={{
          padding: '6px 13px',
          borderRadius: 9,
          border: 'none',
          background: activeTab === 'metro' ? '#E2001A' : 'var(--bg-hover)',
          color: '#ffffff',
          fontWeight: 800,
          fontSize: '.84rem',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: activeTab === 'metro' ? '0 2px 6px rgba(226,0,26,0.35)' : 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: activeTab === 'metro' ? '#ffffff' : '#E2001A',
            color: activeTab === 'metro' ? '#E2001A' : '#ffffff',
            fontSize: '0.66rem',
            fontWeight: 900,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            fontFamily: "system-ui, -apple-system, sans-serif",
          }}
        >
          m
        </span>
        <span
          style={{
            fontSize: '.72rem',
            opacity: 0.9,
            background: 'rgba(0,0,0,0.28)',
            padding: '1.5px 6px',
            borderRadius: 5,
          }}
        >
          {metroStopsCount}
        </span>
      </button>

      {/* Tab 3: EMT Bus */}
      <button
        type="button"
        role="tab"
        aria-label="EMT bus departures"
        aria-selected={activeTab === 'bus'}
        onClick={() => setActiveTab('bus')}
        onPointerDown={(e) => e.stopPropagation()}
        title="EMT Bus departures only"
        style={{
          padding: '6px 13px',
          borderRadius: 9,
          border: 'none',
          background: activeTab === 'bus' ? '#D62828' : 'var(--bg-hover)',
          color: '#ffffff',
          fontWeight: 800,
          fontSize: '.84rem',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: activeTab === 'bus' ? '0 2px 6px rgba(214,40,40,0.35)' : 'none',
          transition: 'all 0.15s ease',
        }}
      >
        <span
          style={{
            fontSize: '0.58rem',
            fontWeight: 900,
            background: '#D62828',
            color: '#ffffff',
            padding: '1.5px 4px',
            borderRadius: 3,
            letterSpacing: '0.04em',
            lineHeight: 1,
          }}
        >
          EMT
        </span>
        <span
          style={{
            fontSize: '.72rem',
            opacity: 0.9,
            background: 'rgba(0,0,0,0.28)',
            padding: '1.5px 6px',
            borderRadius: 5,
          }}
        >
          {busStopsCount}
        </span>
      </button>
    </nav>
  );

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
              maxHeight: isExpanded ? 'calc(100vh - 40px)' : 'calc(100vh - 100px)',
              height: isExpanded ? 'calc(100vh - 100px)' : 'auto',
              width: isExpanded
                ? 'min(820px, 68vw)'
                : (isMultimodal && activeTab === 'split') ? 'min(680px, 55vw)' : 'min(380px, 34vw)',
              transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
            }
          : {
              left: 12,
              right: 12,
              bottom: (isMultimodal && !isExpanded)
                ? SPLIT_SHEET_BOTTOM
                : 'calc(12px + env(safe-area-inset-bottom, 0px))',
              maxHeight: isExpanded ? EXPANDED_SHEET_HEIGHT : 'min(58vh, calc(100vh - 120px))',
              height: isExpanded ? EXPANDED_SHEET_HEIGHT : 'auto',
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

      {/* Header: when isPinPlace, tabs + actions in a single compact row; otherwise station name & lines + actions */}
      <header
        className="station-panel-header"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, padding: !landscape ? '2px 16px 12px' : '12px 16px 12px', borderBottom: '1px solid var(--border-color)',
        }}
      >
        {isPinPlace ? (
          renderMultimodalTabs(true)
        ) : (
          <div style={{ minWidth: 0, display: 'flex', alignItems: 'center', gap: 10, flex: 1, overflow: 'hidden' }}>
            <div
              className="station-header-icon"
              data-testid="station-header-icon"
              aria-label="Toggle expand station panel"
              onClick={() => setIsExpanded((v) => !v)}
              title={isExpanded ? 'Collapse view' : 'Expand full view'}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 34, height: 34, minWidth: 34, borderRadius: '50%',
                background: '#E2001A', color: '#FFFFFF',
                boxShadow: '0 2px 6px rgba(226, 0, 26, 0.35)',
                flexShrink: 0,
                cursor: 'pointer',
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
                  letterSpacing: '-.01em',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  wordBreak: 'break-word',
                  minWidth: 0, margin: 0,
                }}>
                  {focus.name}
                </h2>
                {metroWalkMin !== undefined && (
                  <span
                    title={`${metroWalkMin} min walk`}
                    style={{
                      fontSize: '0.74rem',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                    }}
                  >
                    · 🚶 {metroWalkMin} min
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
        )}

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

      {/* Body Container */}
      {isMultimodal ? (
        <div style={{ position: 'relative', overflow: 'hidden', ...(isExpanded && { flex: '1 1 auto', minHeight: 0 }) }}>
          {focus.fetchError && (
            <div role="status" style={{
              margin: '6px 10px', padding: '6px 10px', borderRadius: 8,
              background: 'rgba(255,152,0,.14)', color: '#ffb74d', fontSize: '.72rem', lineHeight: 1.35,
            }}>
              {focus.fetchError}
            </div>
          )}

          {/* #107: one grid, one instance of each section. Tabs only toggle column visibility
              and per-tab props, so a tab switch never unmounts/remounts the sections (no cold
              placeholder flash, no extra fetches). */}
          <div
            className="multimodal-dual-scroll-container"
            style={{
              display: 'grid',
              gridTemplateColumns: activeTab === 'split' ? SPLIT_LAYOUT.columns : '1fr',
              gap: activeTab === 'split' ? SPLIT_LAYOUT.gap : 0,
              height: multimodalSheetGeometry(activeTab, isExpanded).bodyHeight,
              padding: activeTab === 'split' ? `8px ${SPLIT_LAYOUT.sidePadding}px` : 0,
              overflow: 'hidden',
              transition: 'height 0.22s ease',
            }}
          >
            <div
              className="independent-metro-scroll"
              style={{
                display: activeTab === 'bus' ? 'none' : 'block',
                height: '100%',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                ...(activeTab === 'split'
                  ? { paddingRight: SPLIT_LAYOUT.metroPadRight, borderRight: '1px solid var(--border-color, rgba(255,255,255,0.08))' }
                  : { padding: '8px 12px 10px' }),
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
                nearbyMetro={nearbyMetroWithFocus}
                showDistance={activeTab !== 'split'}
                compact={activeTab === 'split'}
                onSelectStation={onSelectStation}
                isPinMode={isMultimodal}
              />
            </div>

            <div
              className="independent-bus-scroll"
              style={{
                display: activeTab === 'metro' ? 'none' : 'block',
                height: '100%',
                overflowY: 'auto',
                WebkitOverflowScrolling: 'touch',
                ...(activeTab === 'split' ? { paddingLeft: SPLIT_LAYOUT.busPadLeft } : { padding: '8px 12px 10px' }),
              }}
            >
              <ConnectingBusSection
                stationName={focus.name}
                stationCoords={station.geometry?.coordinates}
                feeders={feeders}
                theme={theme}
                showDistance={activeTab !== 'split'}
                compact={activeTab === 'split'}
                active={activeTab !== 'metro'}
                onSelectFeederStop={onSelectFeederStop}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Baseline view for other variants and existing tests */
        <div
          className="station-panel-body"
          style={{
            maxHeight: isExpanded ? 'calc(78vh - 110px)' : TABLE_HEAD_PX + ROW_HEIGHT_PX * VISIBLE_ROWS + 8,
            overflowY: 'auto',
            padding: '0 10px 8px',
            transition: 'max-height 0.22s ease',
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
