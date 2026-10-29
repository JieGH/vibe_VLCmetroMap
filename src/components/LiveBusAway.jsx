// The nearest approaching line 19 bus beside a stop's getSAE countdown (issue #152). Renders nothing until
// the shared tracker has a bus for this stop, so the row looks exactly as before when there is none.
import React from 'react';
import { Radio } from 'lucide-react';
import { useTranslation } from '../i18n';
import { useNearestApproachingBus } from '../services/useBusFleet';
import { stopsAwayLabel } from '../utils/liveBusInfo';

const LiveBusAway = ({ stopCode, compact = false }) => {
  const { t } = useTranslation();
  const found = useNearestApproachingBus(stopCode);
  if (!found) return null;
  const label = stopsAwayLabel(t, found.stopsAway);
  return (
    <span
      data-testid="live-bus-away"
      className="live-bus-away"
      aria-label={t('bus.nearestBusAria', { away: label })}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
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
