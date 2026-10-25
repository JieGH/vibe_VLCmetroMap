// ConnectingBusSection Component for Variant A (Multimodal Hub Feeder)
// Shows street bus stops within 200m walking shed of the focused metro station.
import React from 'react';
import BusBadge from './BusBadge';
import { countdownHeat, countdownLabel, countdownUnit } from '../utils/countdownHeat';
import { Footprints, MapPin } from 'lucide-react';

export const ConnectingBusSection = ({
  stationName,
  stationCoords,
  feeders,
  theme = 'dark',
  onSelectFeederStop
}) => {
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
          <span>València</span>
        </span>
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            color: 'var(--text-secondary)',
          }}
        >
          {feeders.length} {feeders.length === 1 ? 'stop' : 'stops'} nearby
        </span>
      </div>

      {feeders.map((stop, sIdx) => (
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
                  gap: 3,
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  background: 'rgba(214, 40, 40, 0.18)',
                  color: '#ff6369',
                  padding: '2px 6px',
                  borderRadius: 4,
                }}
              >
                <MapPin size={10} />
                Parada {stop.stopCode}
              </span>
              <span
                style={{
                  fontSize: '0.86rem',
                  fontWeight: 700,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  color: 'var(--text-primary)',
                }}
              >
                {stop.stopName}
              </span>
            </div>
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
              {stop.walkMetres}m ({stop.walkMin} min)
            </span>
          </div>

          {/* Feeder lines departure rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
            {stop.lines.map((bus, bIdx) => {
              const heat = countdownHeat(bus.dueSeconds, theme);
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
                    <BusBadge line={bus.line} size="sm" />
                    <span
                      style={{
                        fontSize: '0.84rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {bus.destination}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                    {bus.isLive && (
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
                      {countdownLabel(bus.dueSeconds, 'Due')}
                      {countdownUnit(bus.dueSeconds) && (
                        <span style={{ fontSize: '0.70rem', marginLeft: 2, color: 'var(--text-secondary)' }}>
                          {countdownUnit(bus.dueSeconds)}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default ConnectingBusSection;
