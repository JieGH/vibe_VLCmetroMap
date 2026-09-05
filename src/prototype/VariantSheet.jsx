// PROTOTYPE — throwaway. See ./README.md.
//
// VARIANT B — Map plus a draggable bottom sheet. The phone bet: the standard
// transit-app pattern. Map owns the screen, everything you touch lives in the
// bottom third where a thumb reaches, and the sheet snaps between three detents.
import React, { useRef, useState } from 'react';
import MapView from '../components/MapView';
import { usePrototypeData, lineColor, countdown } from './usePrototypeData';

const DETENTS = [0.14, 0.5, 0.9]; // fraction of viewport height

const VariantSheet = () => {
  const { stations, live } = usePrototypeData();
  const [detent, setDetent] = useState(1);
  const [drag, setDrag] = useState(null);
  const [openStation, setOpenStation] = useState(null);
  const sheetRef = useRef(null);

  const height = drag !== null ? drag : DETENTS[detent] * window.innerHeight;

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(height);
  };
  const onPointerMove = (e) => {
    if (drag === null) return;
    setDrag(Math.min(window.innerHeight * 0.94, Math.max(70, window.innerHeight - e.clientY)));
  };
  const onPointerUp = () => {
    if (drag === null) return;
    const fraction = drag / window.innerHeight;
    let nearest = 0;
    DETENTS.forEach((d, i) => {
      if (Math.abs(d - fraction) < Math.abs(DETENTS[nearest] - fraction)) nearest = i;
    });
    setDetent(nearest);
    setDrag(null);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, background: '#0b0d12', overflow: 'hidden' }}>
      <MapView
        theme="dark"
        selectedStation={null}
        flyTarget={null}
        onSelectStation={(st) => { setOpenStation(st.properties.name); setDetent(2); }}
        activeLineFilter={[]}
        hoverLine={null}
      />

      {/* Status pill, top — read-only, out of thumb reach on purpose */}
      <div style={{
        position: 'absolute', top: 'env(safe-area-inset-top, 12px)', left: 12, right: 12,
        display: 'flex', gap: 8, zIndex: 20, pointerEvents: 'none',
      }}>
        <div style={{
          padding: '9px 14px', borderRadius: 999,
          background: 'rgba(12,14,20,.82)', backdropFilter: 'blur(14px)',
          color: '#fff', font: '600 13px/1 system-ui', border: '1px solid rgba(255,255,255,.09)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: live.length ? '#22c55e' : '#6b7280' }} />
          {live.length ? `${live.length} trains running` : 'No live predictions'}
        </div>
      </div>

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height,
          background: 'rgba(14,16,22,.94)', backdropFilter: 'blur(24px)',
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          border: '1px solid rgba(255,255,255,.09)', borderBottom: 'none',
          boxShadow: '0 -12px 40px rgba(0,0,0,.5)',
          display: 'flex', flexDirection: 'column', zIndex: 30, color: '#fff',
          transition: drag === null ? 'height .28s cubic-bezier(.32,.72,0,1)' : 'none',
        }}
      >
        {/* Grab handle — the whole header is the drag target, not just the bar */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{ padding: '10px 0 6px', cursor: 'grab', touchAction: 'none', flexShrink: 0 }}
        >
          <div style={{ width: 38, height: 5, borderRadius: 3, background: 'rgba(255,255,255,.3)', margin: '0 auto' }} />
          <div style={{ padding: '10px 18px 6px', font: '700 17px/1.2 system-ui' }}>Nearby stations</div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 24px', minHeight: 0 }}>
          {stations.map((s) => {
            const open = openStation === s.name;
            const next = s.arrivals[0];
            return (
              <div key={s.id} style={{ marginBottom: 8 }}>
                <button
                  onClick={() => setOpenStation(open ? null : s.name)}
                  style={{
                    width: '100%', minHeight: 60, padding: '12px 14px', borderRadius: 14,
                    background: open ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.045)',
                    border: '1px solid rgba(255,255,255,.06)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ font: '600 15px/1.25 system-ui', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.name}
                    </div>
                    <div style={{ font: '400 12px/1.3 system-ui', color: '#9ca3af', marginTop: 3 }}>
                      {s.arrivals.length ? `${s.arrivals.length} approaching` : 'no live predictions'}
                    </div>
                  </div>
                  {next && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
                      <span style={{
                        width: 24, height: 24, borderRadius: 7, background: lineColor(next.line),
                        color: '#000', font: '800 12px/24px system-ui', textAlign: 'center',
                      }}>{next.line}</span>
                      <span style={{ font: '700 17px/1 system-ui', fontVariantNumeric: 'tabular-nums' }}>
                        {countdown(next.seconds)}
                      </span>
                    </div>
                  )}
                </button>

                {open && (
                  <div style={{ padding: '6px 4px 2px' }}>
                    {s.arrivals.length === 0 && (
                      <div style={{ font: '400 13px system-ui', color: '#6b7280', padding: '8px 12px' }}>
                        This station has no live prediction endpoint.
                      </div>
                    )}
                    {s.arrivals.map((a, i) => (
                      <div key={i} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        minHeight: 48, padding: '8px 12px',
                        borderLeft: `3px solid ${lineColor(a.line)}`, marginLeft: 8,
                      }}>
                        <span style={{ font: '600 14px system-ui', flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {a.destination}
                        </span>
                        <span style={{
                          font: '700 15px/1 system-ui', fontVariantNumeric: 'tabular-nums',
                          color: a.seconds <= 120 ? '#fbbf24' : '#fff',
                        }}>
                          {countdown(a.seconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default VariantSheet;
