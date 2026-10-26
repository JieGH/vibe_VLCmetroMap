// Quick-access chips under the search pill: one dismissible chip per active
// Line filter (line-colour dot). Mirrors the native app's HubChips.
import React from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../i18n';
import { lineColor } from '../utils/lineColor';

const HubChips = ({ activeLines = [], onClearLine }) => {
  const { t } = useTranslation();
  const lines = Array.isArray(activeLines) ? [...activeLines].sort() : [];
  if (lines.length === 0) return null;

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
    </div>
  );
};

export default HubChips;
