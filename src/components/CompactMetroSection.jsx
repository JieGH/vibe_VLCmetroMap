// CompactMetroSection Component for Variant A (Multimodal Hub Feeder)
// Compact high-density list of rail arrivals matching the visual rhythm and dimensions of ConnectingBusSection.
import React from 'react';
import { Footprints } from 'lucide-react';
import { lineColor } from '../utils/lineColor';
import { countdownHeat, countdownLabel, countdownUnit } from '../utils/countdownHeat';
import { useTranslation } from '../i18n';
import { WALK_RADIUS_METRO_METRES, walkRadiusMinutes } from '../utils/walkRadius';
import { SPLIT_HEADER, badgeGridStyle, splitHeaderBoxStyle, timeUnitStyle } from './splitStyles';

const CompactMetroSection = ({
  arrivals = [],
  stationName,
  theme = 'dark',
  _unheardLabel,
  _isLive,
  _walkMetres,
  _walkMin,
  nearbyMetro = [],
  showDistance = true,
  onSelectStation,
  isPinMode = false,
  compact = false,
}) => {
  const { t } = useTranslation();
  // Split view: N′ instead of "N min", short due label, no status dots.
  const dueLabel = t(compact ? 'common.dueShort' : 'common.due');
  const unitText = (seconds) =>
    compact && countdownUnit(seconds) === 'min' ? '′' : t(`common.${countdownUnit(seconds)}`);

  const isPin = Boolean(
    isPinMode ||
    stationName === 'Map Ping' ||
    stationName === "Where you're at"
  );

  // When in Pin mode (multimodal transit hub from placed pin or GPS location):
  if (isPin) {
    if (!nearbyMetro || nearbyMetro.length === 0) {
      return (
        <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          <p style={{ fontSize: '0.85rem', margin: 0 }}>
            {t('stationPanel.noNearbyMetro')}
          </p>
        </div>
      );
    }

    return (
      <div className="compact-metro-section" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Header */}
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
                width: compact ? SPLIT_HEADER.metroBadge.size : 15,
                height: compact ? SPLIT_HEADER.metroBadge.size : 15,
                borderRadius: '50%',
                background: '#E2001A',
                color: '#ffffff',
                fontSize: compact ? SPLIT_HEADER.metroBadge.fontSize : '0.52rem',
                fontWeight: 900,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: 1,
              }}
            >
              m
            </span>
            <span>{t('common.trains')}</span>
          </span>
          {showDistance && (
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: 'var(--text-secondary)',
              }}
            >
              {nearbyMetro.length} {t(nearbyMetro.length === 1 ? 'common.station' : 'common.stations')}
            </span>
          )}
        </div>

        {/* Nearby Metro Stations List */}
        {nearbyMetro.map((m, sIdx) => {
          const stName = m.feature?.properties?.name || m.name || t('common.metro');
          const stLines = m.lines || m.feature?.properties?.lines || [];
          const stArrivals = m.arrivals || [];
          const walkMin = m.walkMin || (m.distance ? Math.max(1, Math.round(m.distance / 80)) : 3);

          return (
            <div
              key={stName || sIdx}
              data-testid="metro-card"
              onClick={() => onSelectStation && onSelectStation(m.feature)}
              title={t('stationPanel.openStation', { station: stName })}
              style={{
                cursor: onSelectStation ? 'pointer' : 'default',
                background: 'var(--bg-hover, rgba(255, 255, 255, 0.04))',
                borderRadius: 10,
                padding: '8px 10px',
                border: '1px solid var(--border-color, rgba(255, 255, 255, 0.1))',
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
              }}
            >
              {/* Station Card Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: '50%',
                      background: '#E2001A',
                      color: '#ffffff',
                      fontSize: '0.52rem',
                      fontWeight: 900,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      lineHeight: 1,
                      flexShrink: 0,
                    }}
                  >
                    m
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
                    title={stName}
                  >
                    {stName}
                  </span>
                  {/* Split view: 1-2 lines stay in a row, 3-4 stack as a 2x2 grid, 5 or more as a 3x3 grid. */}
                  <div style={badgeGridStyle(compact, stLines.length)}>
                    {stLines.map((l, lIdx) => {
                      const lineId = typeof l === 'object' && l !== null ? (l.line || l.id || '') : l;
                      return (
                        <span
                          key={lineId || lIdx}
                          style={{
                            minWidth: 16,
                            height: 16,
                            borderRadius: 3,
                            background: lineColor(lineId),
                            color: '#000000',
                            fontSize: '0.60rem',
                            fontWeight: 900,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 2px',
                            lineHeight: 1,
                          }}
                        >
                          {lineId}
                        </span>
                      );
                    })}
                  </div>
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
                      marginLeft: 6,
                    }}
                  >
                    <Footprints size={11} />
                    {walkMin} min
                  </span>
                )}
              </div>

              {/* Departures for this station */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                {stArrivals.length > 0 ? (
                  stArrivals.slice(0, 3).map((arr, aIdx) => {
                    const heat = countdownHeat(arr.seconds, theme);
                    const bg = lineColor(arr.line);
                    const isArriving = arr.seconds <= 30;

                    return (
                      <div
                        key={aIdx}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '3px 4px',
                          borderRadius: 6,
                          background: 'rgba(0, 0, 0, 0.14)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                          <span
                            style={{
                              ...(compact ? { width: 20 } : { minWidth: 18 }),
                              height: compact ? 16 : 18,
                              borderRadius: compact ? 3 : 4,
                              background: bg,
                              color: '#000000',
                              fontSize: compact ? '0.60rem' : '0.66rem',
                              fontWeight: 900,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: compact ? '0 2px' : '0 3px',
                              flexShrink: 0,
                              ...(compact ? { border: '0.5px solid rgba(255, 255, 255, 0.25)', boxSizing: 'border-box' } : {}),
                            }}
                          >
                            {arr.line}
                          </span>
                          <span
                            style={{
                              fontSize: '0.80rem',
                              fontWeight: 600,
                              color: 'var(--text-primary)',
                              display: '-webkit-box',
                              WebkitLineClamp: 1,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden',
                              lineHeight: 1.2,
                              wordBreak: 'break-word',
                              whiteSpace: 'normal',
                              flex: 1,
                              minWidth: 0,
                            }}
                            title={arr.destination}
                          >
                            {arr.destination}
                          </span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0, marginLeft: 6 }}>
                          {arr.isLive && !compact && (
                            <span
                              title={t('stationPanel.liveTelemetryFgv')}
                              style={{
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                background: '#4CAF50',
                                display: 'inline-block',
                                boxShadow: '0 0 5px #4CAF50',
                              }}
                            />
                          )}
                          {isArriving && !compact ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                fontSize: '0.86rem',
                                fontWeight: 800,
                                fontVariantNumeric: 'tabular-nums',
                                color: heat,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <span
                                className="station-arriving-dot pulse"
                                style={{
                                  width: 5,
                                  height: 5,
                                  borderRadius: '50%',
                                  background: heat,
                                  display: 'inline-block',
                                  boxShadow: `0 0 5px ${heat}`,
                                }}
                              />
                              {countdownLabel(arr.seconds, t('common.due'))}
                            </span>
                          ) : (
                            <span
                              style={{
                                fontSize: '0.86rem',
                                fontWeight: 800,
                                fontVariantNumeric: 'tabular-nums',
                                color: heat,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {countdownLabel(arr.seconds, dueLabel)}
                              {countdownUnit(arr.seconds) && (
                                <span style={timeUnitStyle({ compact, unit: countdownUnit(arr.seconds), baseFontSize: '0.68rem' })}>
                                  {unitText(arr.seconds)}
                                </span>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '2px 4px' }}>
                    {stLines.length > 0 ? t('stationPanel.linesCheckBoard', { lines: stLines.map(l => typeof l === 'object' && l !== null ? (l.line || l.id) : l).join(', ') }) : t('stationPanel.regularSchedule')}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Non-pin mode (individual Metro station selected):
  if (!arrivals || arrivals.length === 0) {
    return (
      <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p style={{ fontSize: '0.84rem', margin: 0 }}>
          {t('stationPanel.noLiveTrains')}
        </p>
      </div>
    );
  }

  return (
    <div className="compact-metro-section" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '2px 4px 6px',
          borderBottom: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          marginBottom: 4,
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
              width: 15,
              height: 15,
              borderRadius: '50%',
              background: '#E2001A',
              color: '#ffffff',
              fontSize: '0.52rem',
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            m
          </span>
          <span>{stationName || t('common.metro')}</span>
        </span>
      </div>

      {/* Arrival Rows */}
      {arrivals.map((arrival, idx) => {
        const heat = countdownHeat(arrival.seconds, theme);
        const bg = lineColor(arrival.line);
        const isArriving = arrival.seconds <= 30;

        return (
          <div
            key={arrival.vehicleId ? `${arrival.vehicleId}-${idx}` : idx}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '3px 6px',
              borderRadius: 6,
              background: 'rgba(0, 0, 0, 0.14)',
              minHeight: 32,
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.05))',
              transition: 'background 0.15s ease',
            }}
          >
            {/* Left: Line Badge + Destination */}
            <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 8, minWidth: 0, flex: 1 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  ...(compact ? { width: 20 } : { minWidth: 22 }),
                  height: compact ? 16 : 22,
                  padding: compact ? '0 2px' : '0 5px',
                  borderRadius: compact ? 3 : 11,
                  background: bg,
                  color: '#000000',
                  fontSize: compact ? '0.60rem' : '0.74rem',
                  fontWeight: 900,
                  flexShrink: 0,
                  ...(compact
                    ? { border: '0.5px solid rgba(255, 255, 255, 0.25)', boxSizing: 'border-box' }
                    : { boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }),
                }}
              >
                {arrival.line}
              </span>

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
                title={arrival.destination}
              >
                {arrival.destination}
              </span>
            </div>

            {/* Right: Pulsing Live Indicator + Due Countdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
              {isArriving && !compact ? (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    fontSize: '0.90rem',
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    color: heat,
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    className="station-arriving-dot pulse"
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: heat,
                      display: 'inline-block',
                      boxShadow: `0 0 6px ${heat}`,
                    }}
                  />
                  {countdownLabel(arrival.seconds, t('common.due'))}
                </span>
              ) : (
                <span
                  style={{
                    fontSize: '0.90rem',
                    fontWeight: 800,
                    fontVariantNumeric: 'tabular-nums',
                    color: heat,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {countdownLabel(arrival.seconds, dueLabel)}
                  {countdownUnit(arrival.seconds) && (
                    <span style={timeUnitStyle({ compact, unit: countdownUnit(arrival.seconds), baseFontSize: '0.70rem' })}>
                      {unitText(arrival.seconds)}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Nearby Metro Stations within the walk radius */}
      {nearbyMetro && nearbyMetro.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))' }}>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {t('stationPanel.alsoWithinWalk', { min: walkRadiusMinutes(WALK_RADIUS_METRO_METRES) })}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {nearbyMetro.map((m) => {
              const lines = m.lines || m.feature?.properties?.lines || [];
              const stName = m.feature?.properties?.name || m.name;
              const walkMin = m.walkMin || (m.distance ? Math.max(1, Math.round(m.distance / 80)) : 3);
              return (
                <div
                  key={stName}
                  onClick={() => onSelectStation && onSelectStation(m.feature)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 8px',
                    borderRadius: 6,
                    background: 'rgba(255, 255, 255, 0.03)',
                    cursor: onSelectStation ? 'pointer' : 'default',
                    border: '1px solid var(--border-color, rgba(255, 255, 255, 0.06))',
                    transition: 'background 0.15s ease',
                  }}
                  title={t('stationPanel.switchToStation', { station: stName, min: walkMin })}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: '#E2001A',
                        color: '#ffffff',
                        fontSize: '0.47rem',
                        fontWeight: 900,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        flexShrink: 0,
                      }}
                    >
                      m
                    </span>
                    <span
                      style={{
                        fontSize: '0.80rem',
                        fontWeight: 700,
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
                      title={stName}
                    >
                      {stName}
                    </span>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      {lines.map((l) => (
                        <span
                          key={l}
                          style={{
                            minWidth: 15,
                            height: 15,
                            borderRadius: 3,
                            background: lineColor(l),
                            color: '#000000',
                            fontSize: '0.58rem',
                            fontWeight: 900,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '0 2px',
                            lineHeight: 1,
                          }}
                        >
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                  {showDistance && (
                    <span
                      style={{
                        fontSize: '0.70rem',
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        flexShrink: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 3,
                      }}
                    >
                      <Footprints size={11} />
                      {walkMin} min
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CompactMetroSection;
