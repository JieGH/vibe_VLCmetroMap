// Small card for a tapped live bus marker (issue #152): its direction (trayecto headsign) and how many
// stops away it is from the selected stop, or its next stop when no stop is selected. Same glass-panel
// sheet look as the stop board; sits at the top so it never covers the board's countdown rows.
import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import BusBadge from './BusBadge';
import { useTranslation } from '../i18n';
import { useLiveBus } from '../services/useBusFleet';
import { describeLiveBus, stopsAwayLabel } from '../utils/liveBusInfo';

const LiveBusSheet = ({ busId, stopCode = null, stopName = '', onClose }) => {
  const { t } = useTranslation();
  const bus = useLiveBus(busId);
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
  const info = describeLiveBus(bus, stopCode);

  return (
    <aside
      className="glass-panel live-bus-sheet"
      data-testid="live-bus-sheet"
      aria-label={t('bus.liveBusAria', { line: bus.linea, destination: info.destination })}
      style={{
        position: 'absolute', zIndex: 31,
        top: 'calc(76px + env(safe-area-inset-top, 0px))', left: 12, right: 12,
        maxWidth: 380, borderRadius: 16, padding: '10px 12px',
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
