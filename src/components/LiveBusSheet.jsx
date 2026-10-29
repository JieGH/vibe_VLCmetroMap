// Small card for a tapped live bus marker (issue #152): its direction (trayecto headsign) and how many
// stops away it is from the selected stop, or its next stop when no stop is selected. Same glass-panel
// sheet look as the stop board; sits at the top so it never covers the board's countdown rows.
import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import BusBadge from './BusBadge';
import { useTranslation } from '../i18n';
import { useLiveBus } from '../services/useBusFleet';
import { describeLiveBus, stopsAwayLabel, liveFixAgeSeconds, fixAgeLabel } from '../utils/liveBusInfo';
import { LANDSCAPE_BREAKPOINT_PX, lineViewFrame } from '../utils/layout';

const useIsLandscape = () => {
  const read = () => typeof window !== 'undefined' && window.innerWidth >= LANDSCAPE_BREAKPOINT_PX;
  const [landscape, setLandscape] = useState(read);
  useEffect(() => {
    const onResize = () => setLandscape(read());
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, []);
  return landscape;
};

const LiveBusSheet = ({ busId, stopCode = null, stopName = '', onClose, sidebarOpen = false, chipsShown = false }) => {
  const { t } = useTranslation();
  const bus = useLiveBus(busId);
  useIsLandscape(); // re-render on resize/rotation so the frame is recomputed
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 5000); // keeps "Position N s ago" honest between polls
    return () => clearInterval(id);
  }, []);
  const gone = !bus;

  useEffect(() => {
    if (gone) onClose?.();
  }, [gone, onClose]);

  useEffect(() => {
    if (gone) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        if (typeof document !== 'undefined' && document.querySelector('[role="dialog"]')) return;
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [gone, onClose]);

  if (gone) return null;
  const frame = lineViewFrame({ viewportW: typeof window !== 'undefined' ? window.innerWidth : 390, sidebarOpen, chipsShown });
  const info = describeLiveBus(bus, stopCode);

  return (
    <aside
      className="glass-panel live-bus-sheet"
      data-testid="live-bus-sheet"
      aria-label={t('bus.liveBusAria', { line: bus.linea, destination: info.destination })}
      style={{
        position: 'absolute', zIndex: 31,
        top: `calc(${frame.top}px + env(safe-area-inset-top, 0px))`, left: frame.left, right: 'auto', width: frame.width,
        boxSizing: 'border-box',
        borderRadius: 16, padding: '10px 12px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <BusBadge line={bus.linea} className="station-line-badge" />
      <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {t('bus.liveBusTowards', { destination: info.destination })}
        </span>
        {info.stopsAway !== null ? (
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#4CAF50' }}>
            {stopsAwayLabel(t, info.stopsAway)}
            {stopName ? <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}> {t('bus.liveBusFromStop', { stop: stopName })}</span> : null}
          </span>
        ) : info.nextStopName ? (
          <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            {t('bus.nextStop', { stop: info.nextStopName })}
          </span>
        ) : null}
        {fixAgeLabel(t, liveFixAgeSeconds(bus, nowMs)) ? (
          <span data-testid="live-bus-age" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
            {fixAgeLabel(t, liveFixAgeSeconds(bus, nowMs))}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t('bus.liveBusCloseAria')}
        style={{
          width: 32, height: 32, minWidth: 32, borderRadius: '50%', border: 'none',
          background: 'var(--bg-hover)', color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <X size={16} />
      </button>
    </aside>
  );
};

export default LiveBusSheet;
