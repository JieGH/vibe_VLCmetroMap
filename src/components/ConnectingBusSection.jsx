// ConnectingBusSection Component for Variant A (Multimodal Hub Feeder)
// Shows street bus stops within 200m walking shed of the focused metro station.
import React, { useState, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { Footprints } from 'lucide-react';
import BusBadge from './BusBadge';
import { countdownHeat, countdownLabel, countdownUnit } from '../utils/countdownHeat';
import { useTranslation } from '../i18n';
import { SPLIT_HEADER, splitHeaderBoxStyle, timeUnitStyle } from './splitStyles';
import { FEEDER_FETCH_BATCH, visibleFeederCodes, fetchFeederArrivals, createLatestGuard } from '../services/feederArrivalFetch';
import {
  getEmtCachedArrivals,
  isEmtInFlight,
  normalizeStopCode,
} from '../services/emtArrivalService';
import { centreGesture, centreFetchPolicy, withPrefetchBuffer, PREFETCH_BUFFER_M, BUDGET_RETRY_MS } from '../utils/centrePinBuffer';
import { pickWalkSet, WALK_RADIUS_BUS_METRES } from '../utils/walkRadius';
import { getAllBusStops } from '../data/emtData';

function buildCachedArrivalsMap(codes) {
  const map = {};
  for (const code of codes) {
    const cached = getEmtCachedArrivals(code);
    if (cached) map[code] = cached;
  }
  return map;
}

// Split view is an overview: each stop card lists only the soonest arrivals.
const MAX_CARD_ARRIVALS = 3;

export const ConnectingBusSection = ({
  feeders,
  theme = 'dark',
  showDistance = true,
  compact = false,
  // False while the bus list is out of view (e.g. the metro-only tab): nothing fetches.
  active = true,
  onSelectFeederStop,
  stationCoords = null,
}) => {
  const { t } = useTranslation();
  // Split view: N′ instead of "N min", short due label, no live dot.
  const dueLabel = t(compact ? 'common.dueShort' : 'common.due');

  const stopCodes = useMemo(() => {
    if (!Array.isArray(feeders)) return [];
    return feeders.map((s) => normalizeStopCode(s.stopCode || s.code || s.id)).filter(Boolean);
  }, [feeders]);
  const stopCodesKey = stopCodes.join(',');

  const [activeCodesKey, setActiveCodesKey] = useState(stopCodesKey);
  const [liveArrivalsMap, setLiveArrivalsMap] = useState(() => buildCachedArrivalsMap(stopCodes));

  // Re-seed cached arrivals when feeder stops change
  if (activeCodesKey !== stopCodesKey) {
    setActiveCodesKey(stopCodesKey);
    setLiveArrivalsMap(buildCachedArrivalsMap(stopCodes));
  }

  // #109: only the nearest batch of stops fetches; a sentinel after the last card
  // widens the batch as the user scrolls, so a dense area never polls every stop.
  const [fetchLimit, setFetchLimit] = useState(FEEDER_FETCH_BATCH);
  const [pageHidden, setPageHidden] = useState(
    () => typeof document !== 'undefined' && document.hidden === true
  );
  const sentinelRef = useRef(null);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    const onVisibility = () => setPageHidden(document.hidden === true);
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // A different hub starts from the nearest batch again; an anchor refresh keeps its reach.
  const [prevFirstCode, setPrevFirstCode] = useState(stopCodes[0]);
  if (prevFirstCode !== stopCodes[0] && !stopCodes.slice(0, fetchLimit).includes(prevFirstCode)) {
    setPrevFirstCode(stopCodes[0]);
    setFetchLimit(FEEDER_FETCH_BATCH);
  }

  const fetchCodes = visibleFeederCodes(stopCodes, { limit: fetchLimit, active, pageHidden });
  // Stable key: an unchanged nearest set causes no effect re-run.
  const fetchCodesKey = fetchCodes.join(',');
  const hasMore = stopCodes.length > fetchLimit;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!active || !hasMore || !node || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setFetchLimit((n) => n + FEEDER_FETCH_BATCH);
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [active, hasMore, fetchLimit]);

  // Centre pin (ADR-0013): while the pin follows the map, fetching waits for the gesture to settle, reuses
  // the fetch anchor and prefetches a small buffer, all inside a hard request budget.
  const gesture = useSyncExternalStore(centreGesture.subscribe, centreGesture.getState, centreGesture.getState);
  const buffered = gesture.active && Array.isArray(stationCoords);
  const moving = buffered && gesture.moving;
  const [retryTick, setRetryTick] = useState(0);
  const pinKey = buffered ? stationCoords.join(',') : '';

  // Non-blocking strictly on-demand arrival fetch adhering to "Train-First, Then Bus"
  useEffect(() => {
    if (!fetchCodesKey || moving) return undefined;
    // Latest wins: an answer for a pin position the centre pin has left is dropped (#136).
    const guard = createLatestGuard();
    const ticket = guard.next();
    let retry = null;

    let codes = fetchCodesKey.split(',');
    if (buffered) {
      const bufferCodes = pickWalkSet(getAllBusStops(), stationCoords, {
        getCoords: (stop) => stop.coordinates,
        getKey: (stop) => String(stop.stopCode || stop.code || ''),
        radiusMetres: WALK_RADIUS_BUS_METRES + PREFETCH_BUFFER_M,
        allowFallback: false,
      }).items.map(({ item }) => normalizeStopCode(item.stopCode || item.code)).filter(Boolean);
      const plan = centreFetchPolicy.plan({
        pin: stationCoords,
        codes: withPrefetchBuffer(codes, bufferCodes),
        isCached: (c) => getEmtCachedArrivals(c) !== null,
        isInFlight: isEmtInFlight,
      });
      codes = plan.fetch;
      // Rows whose data is already cached show it now (no skeleton flicker for reused stops).
      setLiveArrivalsMap((prev) => ({ ...prev, ...buildCachedArrivalsMap(stopCodes) }));
      if (plan.skipped.length) retry = setTimeout(() => setRetryTick((n) => n + 1), BUDGET_RETRY_MS);
    }
    if (codes.length === 0) return () => { guard.invalidate(); clearTimeout(retry); };

    // Each stop fills its own card the moment it answers; a slow stop never holds the others back.
    fetchFeederArrivals(codes, {
      shouldContinue: () => guard.isCurrent(ticket),
      onArrivals: (code, arrivals) => {
        if (!guard.isCurrent(ticket)) return;
        setLiveArrivalsMap((prev) => ({ ...prev, [code]: arrivals }));
      },
    });

    return () => {
      guard.invalidate();
      clearTimeout(retry);
    };
    // pinKey/stationCoords belong to the same position as fetchCodesKey; moving and the retry tick re-run it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchCodesKey, moving, buffered, pinKey, retryTick]);

  if (!feeders || feeders.length === 0) {
    return (
      <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p style={{ fontSize: '0.85rem', margin: 0 }}>{t('bus.noStops')}</p>
      </div>
    );
  }

  return (
    <div className="connecting-bus-feeder-section" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={splitHeaderBoxStyle(compact)}>
        <span
          style={{
            fontSize: compact ? SPLIT_HEADER.titleFontSize : '0.74rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: compact ? SPLIT_HEADER.gap : 6,
          }}
        >
          <span
            style={{
              fontSize: compact ? SPLIT_HEADER.emtBadge.fontSize : '0.58rem',
              fontWeight: 900,
              background: '#D62828',
              color: '#ffffff',
              padding: compact ? SPLIT_HEADER.emtBadge.padding : '1px 4px',
              borderRadius: 3,
              letterSpacing: '0.04em',
              lineHeight: 1.2,
            }}
          >
            EMT
          </span>
          <span>{t('bus.heading')}</span>
        </span>
        {showDistance && (
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              color: 'var(--text-secondary)',
            }}
          >
            {feeders.length} {feeders.length === 1 ? 'stop' : 'stops'}
          </span>
        )}
      </div>

      {feeders.map((stop, sIdx) => {
        const cleanCode = normalizeStopCode(stop.stopCode || stop.code || stop.id);
        const liveArrivals = cleanCode ? liveArrivalsMap[cleanCode] : null;

        // Still waiting for this stop's answer: shown on the placeholder rows only, so a stop that
        // answered with nothing reads as "no data", not as loading.
        const waiting = !liveArrivals && fetchCodes.includes(cleanCode);

        const itemsToRender = (liveArrivals !== null && liveArrivals !== undefined)
          ? liveArrivals
          : Array.isArray(stop.arrivals)
            ? stop.arrivals
            : (Array.isArray(stop.lines) && stop.lines.length > 0 && typeof stop.lines[0] === 'object' && stop.lines[0] !== null && 'destination' in stop.lines[0])
              ? stop.lines
              : Array.isArray(stop.lines)
                ? stop.lines.map((lineId) => ({
                    line: String(lineId),
                    destination: '...',
                    dueSeconds: null,
                    isLive: false,
                  }))
                : [];

        return (
          <div
            key={stop.stopCode || sIdx}
            data-testid="feeder-card"
            onClick={() => onSelectFeederStop && onSelectFeederStop(stop)}
            title={t('bus.openStop')}
            style={{
              cursor: onSelectFeederStop ? 'pointer' : 'default',
              background: 'var(--bg-hover, rgba(255, 255, 255, 0.04))',
              borderRadius: 10,
              padding: '8px 10px',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
            }}
          >
            {/* Feeder stop header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    fontSize: compact ? '0.58rem' : '0.72rem',
                    fontWeight: 800,
                    background: 'rgba(214, 40, 40, 0.18)',
                    color: '#ff6369',
                    padding: compact ? '2px 4px' : '2px 6px',
                    borderRadius: 4,
                    flexShrink: 0,
                    ...(compact ? { flexDirection: 'column', lineHeight: 1.1, textAlign: 'center' } : {}),
                  }}
                >
                  {cleanCode && compact ? (
                    <>
                      <span>P-</span>
                      <span>{cleanCode}</span>
                    </>
                  ) : cleanCode ? `P-${cleanCode}` : 'EMT'}
                </span>
                <span
                  style={{
                    fontSize: '0.84rem',
                    fontWeight: 700,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    lineHeight: 1.25,
                    wordBreak: 'break-word',
                    whiteSpace: 'normal',
                    color: 'var(--text-primary)',
                    flex: 1,
                    minWidth: 0,
                  }}
                  title={stop.stopName || t('bus.stopFallback')}
                >
                  {stop.stopName || t('bus.stopFallback')}
                </span>
              </div>
              {showDistance && (
                <span
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
                  <Footprints size={11} />
                  {stop.walkMin} min
                </span>
              )}
            </div>

            {/* Feeder lines departure rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
              {itemsToRender.length === 0 ? (
                <div
                  data-testid="feeder-no-arrivals"
                  style={{
                    padding: '5px 8px',
                    textAlign: 'center',
                    fontSize: '0.74rem',
                    color: 'var(--text-secondary)',
                    background: 'rgba(0, 0, 0, 0.1)',
                    borderRadius: 6,
                    ...(compact ? { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } : {}),
                  }}
                >
                  {t(compact ? 'stationPanel.noInfoShort' : 'stationPanel.nothingFurther')}
                </div>
              ) : (
                itemsToRender.slice(0, MAX_CARD_ARRIVALS).map((busObj, bIdx) => {
                  const dueSec = busObj.dueSeconds ?? busObj.seconds;
                  const heat = countdownHeat(dueSec ?? 0, theme);
                  return (
                    <div
                      key={bIdx}
                      className={waiting && busObj.dueSeconds == null ? 'feeder-row-waiting' : undefined}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '3px 4px',
                        borderRadius: 6,
                        background: 'rgba(0,0,0,0.12)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                        <BusBadge line={busObj.line} size="sm" />
                        <span
                          style={{
                            fontSize: '0.82rem',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                            lineHeight: 1.2,
                            wordBreak: 'break-word',
                            whiteSpace: 'normal',
                            flex: 1,
                            minWidth: 0,
                          }}
                          title={busObj.destination}
                        >
                          {busObj.destination || '...'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                        {busObj.isLive && !compact && (
                          <span
                            title={t('bus.liveGpsTelemetry')}
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: '50%',
                              background: '#4CAF50',
                              display: 'inline-block',
                              boxShadow: '0 0 6px #4CAF50',
                            }}
                          />
                        )}
                        <span
                          style={{
                            fontSize: '0.90rem',
                            fontWeight: 800,
                            fontVariantNumeric: 'tabular-nums',
                            color: heat,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {dueSec === null || dueSec === undefined ? (
                            <span style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>···</span>
                          ) : dueSec <= 30 ? (
                            countdownLabel(dueSec, dueLabel)
                          ) : (
                            <>
                              {countdownLabel(dueSec, dueLabel)}
                              {countdownUnit(dueSec) && (
                                <span style={timeUnitStyle({ compact, unit: countdownUnit(dueSec), baseFontSize: '0.70rem' })}>
                                  {compact && countdownUnit(dueSec) === 'min' ? '′' : t(`common.${countdownUnit(dueSec)}`)}
                                </span>
                              )}
                            </>
                          )}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
      {hasMore && <div ref={sentinelRef} data-testid="feeder-more-sentinel" style={{ height: 1 }} />}
    </div>
  );
};

export default ConnectingBusSection;
