// Quick-access chips under the search pill: one dismissible chip per active
// Line filter (line-colour dot), then the most common stops. Mirrors the native
// app's HubChips.
import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../i18n';
import { lineColor } from '../utils/lineColor';

const HubChips = ({ hubs = [], activeLines = [], selectedName = null, onHub, onClearLine }) => {
  const { t } = useTranslation();
  const lines = Array.isArray(activeLines) ? [...activeLines].sort() : [];
  if (lines.length === 0 && hubs.length === 0) return null;

  return (
    <div className="hub-chips" role="group">
      {lines.map((id) => (
        <button
          key={`line-${id}`}
          type="button"
          className="hub-chip hub-chip-line"
          data-selected="true"
          aria-label={t('filter.clearLine', { line: id })}
          title={t('filter.clearLine', { line: id })}
          onClick={() => onClearLine?.(id)}
        >
          <span className="hub-chip-dot" style={{ background: lineColor(id) }} />
          <span className="hub-chip-label hub-chip-line-id">{id}</span>
          <X size={14} aria-hidden="true" />
        </button>
      ))}
      {hubs.map((st) => {
        const name = st.properties.name;
        return (
          <button
            key={name}
            type="button"
            className="hub-chip"
            data-selected={name === selectedName ? 'true' : 'false'}
            aria-label={t('hub.chipAria', { station: name })}
            onClick={() => onHub?.(st)}
          >
            <span className="hub-chip-label">{name}</span>
          </button>
        );
      })}
    </div>
  );
};

export default HubChips;
