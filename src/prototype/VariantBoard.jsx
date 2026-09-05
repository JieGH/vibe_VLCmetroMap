// PROTOTYPE — throwaway. See ./README.md.
//
// VARIANT A — Departure board. The ambient bet: a tablet on a shelf is a
// station board, not a map. Nothing here is interactive, everything is sized to
// be read from across a room, and it rotates through stations on its own.
import React, { useEffect, useState } from 'react';
import { usePrototypeData, lineColor, countdown, clockTime } from './usePrototypeData';

const ROTATE_MS = 12000;
const BOARDS = ['Àngel Guimerà', 'Marítim', 'Benimaclet'];

const VariantBoard = () => {
  const { now, stations, lastSyncAt } = usePrototypeData();
  const [slot, setSlot] = useState(0);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setPhase((p) => {
        const next = p + 100 / (ROTATE_MS / 100);
        if (next >= 100) { setSlot((s) => (s + 1) % BOARDS.length); return 0; }
        return next;
      });
    }, 100);
    return () => clearInterval(id);
  }, []);

  const station = stations.find((s) => s.name === BOARDS[slot]) || stations[0];
  const rows = (station ? station.arrivals : []).slice(0, 6);
  const unheardMin = lastSyncAt ? Math.round((now - lastSyncAt) / 60000) : null;

  return (
    <div style={{
      position: 'absolute', inset: 0, background: '#05060a', color: '#fff',
      display: 'flex', flexDirection: 'column',
      padding: 'clamp(16px, 3vw, 48px)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      // Amber on near-black is the departure-board convention and survives being
      // read at an angle in daylight far better than white on grey.
      ['--amber']: '#ffb000',
    }}>
      {/* Header: where you are, and what time it is. Both huge. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 24 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 'clamp(11px, 1.4vw, 18px)', letterSpacing: '.28em',
            textTransform: 'uppercase', color: '#6b7280', fontWeight: 600,
          }}>
            Departures
          </div>
          <h1 style={{
            fontSize: 'clamp(30px, 6.4vw, 92px)', fontWeight: 800, lineHeight: 1.02,
            letterSpacing: '-.02em', margin: '.08em 0 0',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {station ? station.name : '—'}
          </h1>
        </div>
        <div style={{
          fontSize: 'clamp(28px, 5.6vw, 84px)', fontWeight: 300, lineHeight: 1,
          fontVariantNumeric: 'tabular-nums', color: '#9ca3af', flexShrink: 0,
        }}>
          {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* The board itself */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 'clamp(6px, 1.1vh, 16px)', minHeight: 0 }}>
        {rows.length === 0 && (
          <div style={{ fontSize: 'clamp(16px, 2.4vw, 34px)', color: '#6b7280', textAlign: 'center' }}>
            No live predictions for {station ? station.name : 'this station'}
          </div>
        )}
        {rows.map((a, i) => {
          const due = a.seconds <= 0;
          const soon = a.seconds > 0 && a.seconds <= 120;
          return (
            <div key={i} style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto auto',
              alignItems: 'center',
              gap: 'clamp(10px, 2vw, 28px)',
              padding: 'clamp(6px, 1.1vh, 14px) 0',
              borderBottom: i === rows.length - 1 ? 'none' : '1px solid #14161c',
            }}>
              {/* Line identity: colour AND number, never colour alone */}
              <div style={{
                width: 'clamp(38px, 5vw, 72px)', height: 'clamp(38px, 5vw, 72px)',
                borderRadius: 'clamp(9px, 1.2vw, 16px)',
                background: lineColor(a.line), color: '#000',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 'clamp(17px, 2.6vw, 38px)', fontWeight: 900, flexShrink: 0,
              }}>
                {a.line}
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{
                  fontSize: 'clamp(19px, 3.2vw, 46px)', fontWeight: 700, lineHeight: 1.1,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {a.destination}
                </div>
              </div>

              {/* Clock time as well as countdown: the board convention, and the
                  thing you actually plan around when you're not leaving yet. */}
              <div style={{
                fontSize: 'clamp(15px, 2.2vw, 32px)', color: '#6b7280',
                fontVariantNumeric: 'tabular-nums', flexShrink: 0,
              }}>
                {clockTime(a.targetTimestamp)}
              </div>

              <div style={{
                fontSize: 'clamp(22px, 3.8vw, 56px)', fontWeight: 800,
                fontVariantNumeric: 'tabular-nums', textAlign: 'right',
                minWidth: 'clamp(90px, 12vw, 190px)', flexShrink: 0,
                color: due || soon ? 'var(--amber)' : '#fff',
              }}>
                {countdown(a.seconds)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer: rotation progress + how fresh any of this is */}
      <div>
        <div style={{ height: 3, background: '#14161c', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${phase}%`, background: 'var(--amber)', opacity: .8 }} />
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 10, fontSize: 'clamp(10px, 1.2vw, 15px)', color: '#4b5563',
        }}>
          <span>{BOARDS.map((b, i) => (i === slot ? '●' : '○')).join(' ')} &nbsp; next: {BOARDS[(slot + 1) % BOARDS.length]}</span>
          <span>
            {unheardMin === null ? 'never synced'
              : unheardMin < 1 ? 'live' : `last confirmed ${unheardMin} min ago`}
          </span>
        </div>
      </div>
    </div>
  );
};

export default VariantBoard;
