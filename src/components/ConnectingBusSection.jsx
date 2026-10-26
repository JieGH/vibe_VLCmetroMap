// ConnectingBusSection Component for Variant A (Multimodal Hub Feeder)
// Shows street bus stops within 200m walking shed of the focused metro station.
import React, { useState, useEffect, useMemo } from 'react';
import { Accessibility, Footprints } from 'lucide-react';
import BusBadge from './BusBadge';
import { countdownHeat, countdownLabel, countdownUnit } from '../utils/countdownHeat';
import { useTranslation } from '../i18n';
import {
  fetchStopArrivals,
  getEmtCachedArrivals,
  normalizeStopCode,
  EMT_CACHE_TTL_MS,
} from '../services/emtArrivalService';

export const ConnectingBusSection = ({
  stationName: _stationName,
  stationCoords: _stationCoords,
  feeders,
  theme = 'dark',
  showDistance = true,
  onSelectFeederStop
}) => {
  const { t } = useTranslation();

  const stopCodes = useMemo(() => {
    if (!Array.isArray(feeders)) return [];
    return feeders.map((s) => normalizeStopCode(s.stopCode || s.code || s.id)).filter(Boolean);
  }, [feeders]);
  const stopCodesKey = stopCodes.join(',');

  const [activeCodesKey, setActiveCodesKey] = useState(stopCodesKey);
  const [liveArrivalsMap, setLiveArrivalsMap] = useState(() => {
    const initialMap = {};
    for (const code of stopCodes) {
      const cached = getEmtCachedArrivals(code);
      if (cached) initialMap[code] = cached;
    }
    return initialMap;
  });

  // Re-seed cached arrivals when feeder stops change
  if (activeCodesKey !== stopCodesKey) {
    setActiveCodesKey(stopCodesKey);
    const updatedMap = {};
    for (const code of stopCodes) {
      const cached = getEmtCachedArrivals(code);
      if (cached) updatedMap[code] = cached;
    }
    setLiveArrivalsMap(updatedMap);
  }

  // Non-blocking on-demand arrival fetch adhering to "Train-First, Then Bus"
  useEffect(() => {
    if (!stopCodesKey) return undefined;
    const codes = stopCodesKey.split(',');
    let isMounted = true;

    const fetchAllFeeders = async (force = false) => {
      const results = await Promise.allSettled(
        codes.map(async (code) => {
          const arrivals = await fetchStopArrivals(code, { forceRefresh: force });
          return { code, arrivals };
        })
      );

      if (!isMounted) return;

      setLiveArrivalsMap((prev) => {
        const next = { ...prev };
        for (const res of results) {
          if (res.status === 'fulfilled' && res.value) {
            next[res.value.code] = res.value.arrivals;
          }
        }
        return next;
      });
    };

    fetchAllFeeders();

    // Auto-refresh predictions every 20 seconds while visible
    const intervalId = setInterval(() => {
      fetchAllFeeders(true);
    }, EMT_CACHE_TTL_MS);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [stopCodesKey]);

  if (!feeders || feeders.length === 0) {
    return (
      <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p style={{ fontSize: '0.85rem', margin: 0 }}>No EMT bus stops found within walking distance.</p>
      </div>
    );
  }

  return (
    <div className="connecting-bus-feeder-section" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 4px 6px',
          borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        }}
      >
        <span
          style={{
            fontSize: '0.74rem',
            fontWeight: 800,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: '0.58rem',
              fontWeight: 900,
              background: '#D62828',
              color: '#ffffff',
              padding: '1px 4px',
              borderRadius: 3,
              letterSpacing: '0.04em',
              lineHeight: 1.2,
            }}
          >
            EMT
          </span>
          <span>Autobús</span>
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
            style={{
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
                cursor: onSelectFeederStop ? 'pointer' : 'default',
              }}
              onClick={() => onSelectFeederStop && onSelectFeederStop(stop)}
              title="Focus this street bus stop on map"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    background: 'rgba(214, 40, 40, 0.18)',
                    color: '#ff6369',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  {cleanCode ? `P-${cleanCode}` : 'EMT'}
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
                  title={stop.stopName}
                >
                  {stop.stopName}
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
                  }}
                >
                  {t('stationPanel.nothingFurther')}
                </div>
              ) : (
                itemsToRender.map((busObj, bIdx) => {
                  const dueSec = busObj.dueSeconds ?? busObj.seconds;
                  const heat = countdownHeat(dueSec ?? 0, theme);
                  return (
                    <div
                      key={bIdx}
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
                        {busObj.wheelchair && (
                          <Accessibility
                            size={11}
                            aria-label="Accessible"
                            title="Accessible bus"
                            style={{ color: 'var(--text-secondary)', opacity: 0.8, flexShrink: 0 }}
                          />
                        )}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                        {busObj.isLive && (
                          <span
                            title="Live GPS AVL Telemetry"
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
                            countdownLabel(dueSec, t('common.due'))
                          ) : (
                            <>
                              {countdownLabel(dueSec, t('common.due'))}
                              {countdownUnit(dueSec) && (
                                <span style={{ fontSize: '0.70rem', marginLeft: 2, color: 'var(--text-secondary)' }}>
                                  {t(`common.${countdownUnit(dueSec)}`)}
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
    </div>
  );
};

export default ConnectingBusSection;
