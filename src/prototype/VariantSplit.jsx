// PROTOTYPE — throwaway. See ./README.md.
//
// VARIANT C — Split dashboard. The "keep both" bet: map beside a live network
// column, nothing overlapping anything. Wide, it is two panes; narrow, it
// stacks. This is the only variant that surfaces Position Confidence directly,
// since a column has the room for it and a marker does not.
import React, { useEffect, useState } from 'react';
import MapView from '../components/MapView';
import { usePrototypeData, lineColor, lineName, countdown, ALL_LINES } from './usePrototypeData';

const useIsNarrow = () => {
  const [narrow, setNarrow] = useState(window.innerWidth < 900);
  useEffect(() => {
    const onResize = () => setNarrow(window.innerWidth < 900);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return narrow;
};

const VariantSplit = () => {
  const { now, departures, live, lastSyncAt } = usePrototypeData();
  const narrow = useIsNarrow();

  const pinned = live.filter((v) => v.sightingCount > 1).length;
  const unheardMin = lastSyncAt ? Math.round((now - lastSyncAt) / 60000) : null;
  const linesLive = new Set(live.map((v) => v.line));

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'grid',
      gridTemplateColumns: narrow ? '1fr' : '1fr minmax(340px, 30%)',
      gridTemplateRows: narrow ? '42vh 1fr' : '1fr',
      background: '#0b0d12', color: '#fff', fontFamily: 'system-ui, sans-serif',
    }}>
      {/* Map pane — position:relative so MapView's absolute container fills it */}
      <div style={{ position: 'relative', overflow: 'hidden' }}>
        <MapView
          theme="dark" selectedStation={null} flyTarget={null}
          onSelectStation={() => {}} activeLineFilter={[]} hoverLine={null}
        />
      </div>

      {/* Network column */}
      <div style={{
        display: 'flex', flexDirection: 'column', minHeight: 0,
        borderLeft: narrow ? 'none' : '1px solid rgba(255,255,255,.08)',
        borderTop: narrow ? '1px solid rgba(255,255,255,.08)' : 'none',
        background: '#0e1016',
      }}>
        {/* Headline number, sized to be read from a distance */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
          <div style={{ fontSize: 11, letterSpacing: '.22em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700 }}>
            Network
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
            <span style={{ fontSize: 'clamp(34px, 4vw, 52px)', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {live.length}
            </span>
            <span style={{ fontSize: 15, color: '#9ca3af' }}>trains reported</span>
          </div>
          <div style={{ fontSize: 12.5, color: '#6b7280', marginTop: 6 }}>
            {pinned > 0 && `${pinned} confirmed at two stations · `}
            {unheardMin === null ? 'never synced' : unheardMin < 1 ? 'synced just now' : `synced ${unheardMin} min ago`}
          </div>
        </div>

        {/* Per-line state. Colour is never the only signal — the number is there
            too, and a line with no live data says so in words. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,.07)' }}>
          {ALL_LINES.map((id) => {
            const isLive = linesLive.has(id);
            return (
              <div key={id} title={`${lineName(id)} — ${isLive ? 'live' : 'simulated'}`} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px 5px 6px', borderRadius: 999,
                background: isLive ? 'rgba(255,255,255,.07)' : 'transparent',
                border: `1px ${isLive ? 'solid' : 'dashed'} ${isLive ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.16)'}`,
                opacity: isLive ? 1 : .5,
              }}>
                <span style={{
                  width: 20, height: 20, borderRadius: 6, background: lineColor(id),
                  color: '#000', font: '800 11px/20px system-ui', textAlign: 'center',
                }}>{id}</span>
                <span style={{ fontSize: 11, color: '#9ca3af' }}>{isLive ? 'live' : 'sim'}</span>
              </div>
            );
          })}
        </div>

        {/* Trains in motion, with how much we trust each position */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '6px 12px 16px' }}>
          <div style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700, padding: '10px 8px 8px' }}>
            In motion
          </div>
          {live.length === 0 && (
            <div style={{ fontSize: 13, color: '#6b7280', padding: '8px' }}>
              No live predictions — the map is showing simulated trains.
            </div>
          )}
          {live
            .slice()
            .sort((a, b) => a.secondsToTarget - b.secondsToTarget)
            .map((v) => (
              <div key={v.id} style={{
                display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 11,
                alignItems: 'center', padding: '10px 8px',
                borderBottom: '1px solid rgba(255,255,255,.05)',
              }}>
                <span style={{
                  width: 26, height: 26, borderRadius: 7, background: lineColor(v.line),
                  color: '#000', font: '800 12px/26px system-ui', textAlign: 'center',
                  // The marker's own opacity, mirrored here so the column and the
                  // map agree about how sure we are.
                  opacity: v.positionConfidence,
                }}>{v.line}</span>

                <div style={{ minWidth: 0 }}>
                  <div style={{ font: '600 13.5px/1.3 system-ui', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v.direction}
                  </div>
                  <div style={{ font: '400 11.5px/1.35 system-ui', color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {v.isDeadReckoned
                      ? 'estimated past its last prediction'
                      : `${v.status} · ${v.targetStation} · ±${v.positionUncertaintyMetres} m`}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ font: '700 14px/1 system-ui', fontVariantNumeric: 'tabular-nums' }}>
                    {countdown(v.secondsToTarget)}
                  </div>
                  <div style={{ width: 46, height: 3, borderRadius: 2, background: 'rgba(255,255,255,.1)', marginTop: 6, marginLeft: 'auto' }}>
                    <div style={{
                      height: '100%', width: `${Math.round(v.positionConfidence * 100)}%`,
                      background: v.isDeadReckoned ? '#f59e0b' : '#22c55e', borderRadius: 2,
                    }} />
                  </div>
                </div>
              </div>
            ))}

          <div style={{ fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700, padding: '18px 8px 8px' }}>
            Next departures
          </div>
          {departures.slice(0, 12).map((a, i) => (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 11,
              alignItems: 'center', padding: '9px 8px', borderBottom: '1px solid rgba(255,255,255,.05)',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: 6, background: lineColor(a.line),
                color: '#000', font: '800 11px/22px system-ui', textAlign: 'center',
              }}>{a.line}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ font: '600 13px/1.3 system-ui', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {a.destination}
                </div>
                <div style={{ font: '400 11.5px system-ui', color: '#6b7280' }}>from {a.stationName}</div>
              </div>
              <span style={{
                font: '700 14px/1 system-ui', fontVariantNumeric: 'tabular-nums',
                color: a.seconds <= 120 ? '#fbbf24' : '#fff',
              }}>{countdown(a.seconds)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default VariantSplit;
