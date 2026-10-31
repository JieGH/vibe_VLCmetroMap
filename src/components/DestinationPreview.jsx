import React from 'react';
import { MapPin, Navigation, X } from 'lucide-react';
import { useTranslation } from '../i18n';
import './DestinationPreview.css';

/** A selected place is a Destination, never a replacement for User Location. */
export default function DestinationPreview({ destination, onDirections, onClose }) {
  const { t } = useTranslation();
  if (!destination) return null;
  return (
    <section className="glass-panel destination-preview" aria-label={t('navigation.destination')}>
      <div className="destination-preview-heading">
        <MapPin size={20} aria-hidden="true" />
        <div className="destination-preview-copy">
          <div className="destination-preview-label">{t('navigation.destination')}</div>
          <h2>{destination.name}</h2>
        </div>
        <button type="button" className="destination-preview-close" onClick={onClose} aria-label={t('navigation.closeDestination')}>
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <p className="destination-preview-address">{destination.address}</p>
      <button type="button" className="destination-preview-directions" onClick={() => onDirections(destination)}>
        <Navigation size={16} aria-hidden="true" />
        {t('navigation.directions')}
      </button>
      {destination.attribution && (
        <div className="destination-preview-attribution">
          {destination.source === 'photon'
            ? <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">{destination.attribution}</a>
            : destination.attribution}
        </div>
      )}
    </section>
  );
}
