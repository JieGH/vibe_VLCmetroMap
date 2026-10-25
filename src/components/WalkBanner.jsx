// The floating "N min walk · Station · distance" box. The distance is live:
// recomputed from the latest fix on every render. Icon changes with the tone as
// well as the colour, so colour is never the only signal.
import React from 'react';
import { Footprints, Clock, TriangleAlert, X } from 'lucide-react';
import { useTranslation } from '../i18n';
import { getDistance } from '../utils/geoUtils';
import { walkingMinutes, formatDistance, walkCategory } from '../utils/walking';

const ICONS = { short: Footprints, medium: Clock, long: TriangleAlert };

const WalkBanner = ({ station, userLocation, onDismiss }) => {
  const { t, language } = useTranslation();
  const coords = userLocation?.coordinates;
  const target = station?.geometry?.coordinates;
  if (!coords || !target) return null;

  const meters = getDistance(coords, target);
  const minutes = walkingMinutes(meters);
  const tone = walkCategory(minutes);
  const Icon = ICONS[tone];

  return (
    <div className="walk-banner" data-tone={tone} role="status">
      <Icon size={22} aria-hidden="true" />
      <span className="walk-banner-text">
        {t('walk.to', {
          min: minutes,
          station: station.properties.name,
          distance: formatDistance(meters, language),
        })}
      </span>
      <button
        type="button"
        className="walk-banner-close"
        onClick={onDismiss}
        aria-label={t('walk.dismiss')}
      >
        <X size={18} />
      </button>
    </div>
  );
};

export default WalkBanner;
