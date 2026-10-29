// The nearest approaching line 19 bus beside a stop's getSAE countdown (issue #152). Renders nothing until
// the shared tracker has a bus for this stop, so the row looks exactly as before when there is none.
import React from 'react';
import { Radio } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useNearestApproachingBus } from '../services/useBusFleet';
import { stopsAwayLabel } from '../utils/liveBusInfo';
import { resolveStopDirection } from '../utils/busRoute';

const LiveBusAway = ({ stopCode, destination = '', compact = false, reserve = false }) => {
  const { t } = useTranslation();
  const directionId = resolveStopDirection(stopCode, destination);
  const found = useNearestApproachingBus(stopCode, directionId);
  // `reserve` (line 19 rows) keeps a fixed, empty, silent slot so the row never changes size when a bus pops in.
  const slot = compact ? { width: 76, minHeight: 12 } : { minHeight: 14 };
  if (!found) {
    return reserve && directionId ? <span data-testid="live-bus-slot" aria-hidden="true" style={{ display: 'inline-block', ...slot }} /> : null;
  }
  const label = stopsAwayLabel(t, found.stopsAway);
  return (
    <span
      data-testid="live-bus-away"
      className="live-bus-away"
      aria-label={t('bus.nearestBusAria', { away: label })}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, ...(reserve ? { ...slot, justifyContent: 'flex-end', boxSizing: 'border-box' } : null),
        fontSize: compact ? '0.62rem' : '0.72rem', fontWeight: 700, lineHeight: 1.1,
        color: '#4CAF50', whiteSpace: 'nowrap',
      }}
    >
      <Radio size={compact ? 9 : 11} className="pulse" aria-hidden="true" />
      {label}
    </span>
  );
};

export default LiveBusAway;
