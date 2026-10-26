// CompactMetroSection Component for Variant A (Multimodal Hub Feeder)
// Compact high-density list of rail arrivals matching the visual rhythm and dimensions of ConnectingBusSection.
import React from 'react';
import { Footprints } from 'lucide-react';
import { lineColor } from '../utils/lineColor';
import { countdownHeat, countdownLabel, countdownUnit } from '../utils/countdownHeat';
import { useTranslation } from '../i18n';

export const CompactMetroSection = ({
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
}) => {
  const { t } = useTranslation();

  if (!arrivals || arrivals.length === 0) {
    return (
      <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
        <p style={{ fontSize: '0.84rem', margin: 0 }}>
          {t('stationPanel.noLiveTrains') || 'No scheduled rail arrivals in the immediate window.'}
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
              fontSize: '0.60rem',
              fontWeight: 900,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              lineHeight: 1,
            }}
          >
            m
          </span>
          <span>{stationName || 'Metro'}</span>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 22,
                  height: 22,
                  padding: '0 5px',
                  borderRadius: 11,
                  background: bg,
                  color: '#000000',
                  fontSize: '0.74rem',
                  fontWeight: 900,
                  flexShrink: 0,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
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
              {isArriving ? (
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
                  {countdownLabel(arrival.seconds, t('common.due'))}
                  {countdownUnit(arrival.seconds) && (
                    <span style={{ fontSize: '0.70rem', marginLeft: 2, color: 'var(--text-secondary)' }}>
                      {t(`common.${countdownUnit(arrival.seconds)}`)}
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
        );
      })}

      {/* Nearby Metro Stations within 10-minute walk radius */}
      {nearbyMetro && nearbyMetro.length > 0 && (
        <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))' }}>
          <div style={{ fontSize: '0.66rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Also within 5 min walk:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {nearbyMetro.map((m) => {
              const lines = m.feature.properties.lines || [];
              return (
                <div
                  key={m.feature.properties.name}
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
                  title={`Switch to ${m.feature.properties.name} (${m.walkMin} min walk)`}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: '50%',
                        background: '#E2001A',
                        color: '#ffffff',
                        fontSize: '0.54rem',
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
                      title={m.feature.properties.name}
                    >
                      {m.feature.properties.name}
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
                      {m.walkMin} min
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
