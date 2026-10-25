// BusLineInspector Component for Variant B (Line-on-Demand Canvas)
// Bottom card displaying inspected bus route ribbon details, headway, and active live vehicle telemetry.
import React from 'react';
import BusBadge from './BusBadge';
import { X, Radio, MapPin, ArrowRight } from 'lucide-react';

export const BusLineInspector = ({
  line,
  liveBuses = [],
  onClose,
  onSelectStop
}) => {
  if (!line) return null;

  const relevantBuses = liveBuses.filter(
    (b) => String(b.line).toLowerCase() === String(line.id).toLowerCase()
  );

  return (
    <div
      className="bus-line-inspector glass-panel"
      style={{
        position: 'absolute',
        bottom: 'max(70px, calc(14px + env(safe-area-inset-bottom, 14px) + 56px))',
        left: 12,
        right: 12,
        maxWidth: 520,
        margin: '0 auto',
        zIndex: 40,
        borderRadius: 16,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'var(--bg-panel, rgba(26, 32, 44, 0.95))',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.18))',
        boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
        color: 'var(--text-primary, #ffffff)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
          <BusBadge line={line.id} color={line.color} type={line.type} size="lg" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <h3
              style={{
                fontSize: '1.05rem',
                fontWeight: 800,
                margin: 0,
                lineHeight: 1.2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {line.name}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary, #a0aec0)' }}>
                Headway: <strong>{line.headway}</strong>
              </span>
              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'var(--text-secondary)' }} />
              <span
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  color: '#4caf50',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <Radio size={11} className="pulse" />
                {line.activeVehicles} active buses
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss bus line ribbon"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: 'none',
            background: 'var(--bg-hover, rgba(255,255,255,0.1))',
            color: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Live fleet telemetry pills */}
      {relevantBuses.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: '0.70rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Live Tracking on Ribbon ({relevantBuses.length} vehicles)
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              overflowX: 'auto',
              paddingBottom: 2,
              scrollbarWidth: 'none',
            }}
          >
            {relevantBuses.map((bus) => (
              <div
                key={bus.vehicleId}
                style={{
                  flexShrink: 0,
                  background: 'rgba(0,0,0,0.22)',
                  border: '1px solid var(--border-color)',
                  borderRadius: 8,
                  padding: '6px 10px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: '0.78rem',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontWeight: 800, color: line.color }}>{bus.vehicleId}</span>
                    <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)' }}>· {bus.speedKmh} km/h</span>
                  </div>
                  <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary)', marginTop: 1 }}>
                    Next: {bus.nextStop} ({Math.round(bus.secondsToNext / 60)} min)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stop Chain Horizon */}
      {line.stops && line.stops.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: '0.70rem', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
            Stops Chain on Route
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              overflowX: 'auto',
              padding: '4px 0',
              scrollbarWidth: 'none',
            }}
          >
            {line.stops.map((st, i) => (
              <button
                key={st.code || i}
                type="button"
                onClick={() => onSelectStop && onSelectStop(st)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '4px 8px',
                  borderRadius: 6,
                  border: '1px solid var(--border-color)',
                  background: 'var(--bg-hover, rgba(255,255,255,0.06))',
                  color: 'inherit',
                  fontSize: '0.74rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                <MapPin size={10} color={line.color} />
                <span>{st.code} · {st.name}</span>
                {i < line.stops.length - 1 && (
                  <ArrowRight size={10} style={{ opacity: 0.4, marginLeft: 2 }} />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default BusLineInspector;
