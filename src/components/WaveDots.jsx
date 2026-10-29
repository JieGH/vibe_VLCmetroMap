// The loading mark for live bus arrivals: six dots rising and falling in a wave.
// Motion is transform-only (no layout shift); under reduced motion the dots stand still.
import React from 'react';
import { useTranslation } from '../i18n';

const DOTS = 6;

export const WaveDots = ({ size = 5, label }) => {
  const { t } = useTranslation();
  return (
    <span
      className="wave-dots"
      role="status"
      aria-label={label || t('stationPanel.loadingArrivals')}
      style={{ '--wave-dot': `${size}px` }}
    >
      {Array.from({ length: DOTS }, (_, i) => (
        <span key={i} className="wave-dot" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  );
};

export default WaveDots;
