// BusLineInspector Component for Variant B (Line-on-Demand Canvas)
// Bottom card displaying inspected bus route ribbon details, headway, and active live vehicle telemetry.
import React, { useEffect, useState } from 'react';
import BusBadge from './BusBadge';
import { X, Radio, MapPin, ArrowRight } from 'lucide-react';
import { useTranslation } from '../i18n';
import { lineViewFrame } from '../utils/layout';

export const BusLineInspector = ({
  line,
  liveBuses = [],
  onClose,
  onSelectStop,
  sidebarOpen = false,
  chipsShown = false,
}) => {
  const { t } = useTranslation();
  const [viewportW, setViewportW] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 390));
  useEffect(() => {
    const onResize = () => setViewportW(window.innerWidth);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  if (!line) return null;
  const frame = lineViewFrame({ viewportW, sidebarOpen, chipsShown, maxWidth: 520 });
  if (frame.sidebarCovers) return null; // the open phone sidebar sheet owns the strip

  const relevantBuses = liveBuses.filter(
    (b) => String(b.line).toLowerCase() === String(line.id).toLowerCase()
  );

  return (
    <div
      className="bus-line-inspector glass-panel"
      style={{
        position: 'absolute',
        bottom: 'max(70px, calc(14px + env(safe-area-inset-bottom, 14px) + 56px))',
        left: frame.left,
        width: frame.width,
        boxSizing: 'border-box',
        // never grow up into the tapped-bus sheet / chips at the top
        maxHeight: `calc(100dvh - ${frame.top + 76}px - 80px - env(safe-area-inset-top, 0px))`,
        overflowY: 'auto',
        zIndex: 32, // under the sidebar (40) and the top bar; above the stop board (30) it never coexists with
        borderRadius: 16,
        padding: '12px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        background: 'var(--bg-panel, rgba(26, 32, 44, 0.95))',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.18))',
        boxShadow: '0 12px 36px rgba(0,0,0,0.5)',
        color: 'var(--text-primary, #ffffff)',
        fontFamily: 'var(--font-ui)',
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
              {line.headway && (
                <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary, #a0aec0)' }}>
                  {t('bus.headway', { value: '' })}<strong>{line.headway}</strong>
                </span>
              )}
              {line.activeVehicles != null && (
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
                {t('bus.activeBuses', { count: line.activeVehicles })}
              </span>
              )}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label={t('bus.dismissRibbon')}
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
            {t('bus.liveTracking', { count: relevantBuses.length })}
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
                    {t('bus.nextStopEta', { stop: bus.nextStop, min: Math.round(bus.secondsToNext / 60) })}
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
            {t('bus.stopsOnRoute')}
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
