// CompactMetroSection Component for Variant A (Multimodal Hub Feeder)
// Compact high-density list of rail arrivals matching the visual rhythm and dimensions of ConnectingBusSection.
import React from 'react';
import { lineColor } from '../utils/lineColor';
import { countdownHeat, countdownLabel, countdownUnit } from '../utils/countdownHeat';
import { Train, Radio } from 'lucide-react';
import { useTranslation } from '../i18n';

export const CompactMetroSection = ({
  arrivals = [],
  stationName,
  theme = 'dark',
  unheardLabel,
  isLive,
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
      {/* Mini header matching bus feeder style */}
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
            fontSize: '0.72rem',
            fontWeight: 800,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <Train size={13} color="#E2001A" />
          Metrovalencia Rail Platforms
        </span>
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            color: isLive ? '#4caf50' : '#ffa726',
            background: isLive ? 'rgba(76, 175, 80, 0.14)' : 'rgba(255, 167, 38, 0.14)',
            padding: '2px 6px',
            borderRadius: 4,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <Radio size={9} />
          {unheardLabel || 'Live Sync'}
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
                  fontSize: '0.84rem',
                  fontWeight: 600,
                  color: 'var(--text-primary)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
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
    </div>
  );
};

export default CompactMetroSection;
