import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, MapPin, Navigation } from 'lucide-react';
import metroData from '../data/metro_lines.json';
import gtfsData from '../data/gtfs_expanded.json';
import { searchFuzzy } from '../utils/fuzzySearch';
import { useTranslation } from '../i18n';
import { COMMON_STOPS } from '../utils/commonStops';
import { lineColor } from '../utils/lineColor';

// Black or white text, whichever reads better on a line's colour.
const onColor = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  const lum = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  return lum > 0.6 ? '#1d1d29' : '#ffffff';
};

// gtfs_expanded.json is the canonical station set for the whole network; the
// handful of points in metro_lines.json are a much older subset.
const stations = gtfsData.features.filter(f => f.geometry.type === 'Point');
const lines    = metroData.features.filter(f => f.geometry.type === 'LineString');

const SearchBar = ({ onSelectStation, onSelectLine, activeLineFilter, selectedStation }) => {
  const { t } = useTranslation();
  const [query,       setQuery]       = useState('');
  const [isOpen,      setIsOpen]      = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const dropdownRef = useRef(null);
  const inputRef    = useRef(null);
  const [suggestStyle, setSuggestStyle] = useState({});

  // Filtered results with Valencian accent-insensitive fuzzy search
  const filteredLines = query.trim()
    ? searchFuzzy(lines, query, l => `${l.properties.name} Line ${l.properties.line} Linia ${l.properties.line}`)
    : [];

  const filteredStations = query.trim()
    ? searchFuzzy(stations, query, st => st.properties.name)
    : [];

  // Flat ordered list of all results for keyboard nav
  const allItems = [
    ...filteredLines.map(l  => ({ type: 'line',    data: l  })),
    ...filteredStations.map(st => ({ type: 'station', data: st })),
  ];

  // The suggestions are wider than the search field, so place them inside the viewport.
  useEffect(() => {
    if (!isOpen || query.trim() || !dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 24);
    const left = Math.min(Math.max(rect.left, 12), window.innerWidth - 12 - width) - rect.left;
    setSuggestStyle({ width, right: 'auto', left });
  }, [isOpen, query]);

  // Close on outside click or touch
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
        setHighlighted(-1);
        inputRef.current?.blur();
        if (typeof window !== 'undefined') {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
        }
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  const selectedStationNameRef = useRef('');

  // Sync search input if station focus was dismissed from outside (e.g. StationPanel close button)
  useEffect(() => {
    if (selectedStation && selectedStation.properties?.name) {
      selectedStationNameRef.current = selectedStation.properties.name;
    } else if (!selectedStation && selectedStationNameRef.current) {
      if (query.trim() === selectedStationNameRef.current) {
        setQuery('');
      }
      selectedStationNameRef.current = '';
    }
  }, [selectedStation, query]);

  const handleSelectStation = useCallback((station) => {
    selectedStationNameRef.current = station.properties.name;
    onSelectStation(station);
    setQuery(station.properties.name);
    setIsOpen(false);
    setHighlighted(-1);
    inputRef.current?.blur();
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
    }
  }, [onSelectStation]);

  const handleSelectLine = useCallback((line) => {
    onSelectLine(line.properties.line);
    setQuery(t('searchBar.linePrefix', { line: line.properties.line }));
    setIsOpen(false);
    setHighlighted(-1);
    inputRef.current?.blur();
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
    }
  }, [onSelectLine, t]);

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    setHighlighted(-1);
    selectedStationNameRef.current = '';
    if (activeLineFilter && activeLineFilter.length > 0) onSelectLine(null);
    if (onSelectStation) onSelectStation(null);
    inputRef.current?.blur();
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      if (isOpen) {
        setIsOpen(false);
        setHighlighted(-1);
        inputRef.current?.blur();
        if (typeof window !== 'undefined') {
          window.scrollTo(0, 0);
          document.body.scrollTop = 0;
        }
      } else if (query) {
        handleClear();
      }
      return;
    }
    if (!isOpen || allItems.length === 0) {
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, allItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (highlighted >= 0 && highlighted < allItems.length) {
        const item = allItems[highlighted];
        if (item.type === 'station') handleSelectStation(item.data);
        else handleSelectLine(item.data);
      }
    }
  };

  let itemIdx = 0; // Running counter for keyboard highlight mapping

  return (
    <div ref={dropdownRef} className="search-bar" style={{ position: 'relative', width: '100%' }}>
      {/* Input row */}
      <div style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '8px' }}>
        <Search size={18} color="var(--text-secondary)" className="search-bar-icon" aria-hidden="true" style={{ flexShrink: 0 }} />
        <input
          ref={inputRef}
          type="text"
          className="search-bar-input"
          role="combobox"
          aria-expanded={isOpen && allItems.length > 0}
          aria-controls="search-bar-listbox"
          aria-autocomplete="list"
          aria-activedescendant={isOpen && highlighted >= 0 ? `search-bar-option-${highlighted}` : undefined}
          autoComplete="off"
          value={query}
          onChange={e => {
            const val = e.target.value;
            setQuery(val);
            setIsOpen(true);
            setHighlighted(-1);
            if (!val.trim() && selectedStation && onSelectStation) {
              onSelectStation(null);
            }
          }}
          onFocus={() => setIsOpen(true)}
          onBlur={() => {
            if (typeof window !== 'undefined') {
              window.scrollTo(0, 0);
              document.body.scrollTop = 0;
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('searchBar.placeholder')}
          aria-label={t('searchBar.ariaLabel')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-primary)',
            fontSize: '16px',
            width: '100%',
            outline: 'none',
          }}
        />
        {query && (
          <button
            type="button"
            className="search-bar-clear"
            onClick={handleClear}
            aria-label={t('searchBar.clearTitle')}
            style={{ padding: '4px', borderRadius: '50%', background: 'var(--bg-hover)', display: 'flex', flexShrink: 0 }}
            title={t('searchBar.clearTitle')}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Before anything is typed: popular stations and a line grid, side by side and compact */}
      {isOpen && !query.trim() && (
        <div className="glass-panel search-suggest" style={suggestStyle} role="group" aria-label={t('searchBar.popularStations')}>
          <div className="search-suggest-col">
            <div className="search-suggest-title">{t('searchBar.popularStations')}</div>
            {COMMON_STOPS.slice(0, 6).map((st) => (
              <button
                key={st.properties.name}
                type="button"
                className="search-suggest-station"
                onClick={() => handleSelectStation(st)}
              >
                <span className="search-suggest-name">{st.properties.name}</span>
                <span className="search-suggest-dots" aria-hidden="true">
                  {(st.properties.lines || []).slice(0, 4).map((l) => (
                    <i key={l} style={{ background: lineColor(l) }} />
                  ))}
                </span>
              </button>
            ))}
          </div>
          <div className="search-suggest-sep" aria-hidden="true" />
          <div className="search-suggest-col">
            <div className="search-suggest-title">{t('searchBar.lines')}</div>
            <div className="search-suggest-lines">
              {lines.map((line) => (
                <button
                  key={line.properties.line}
                  type="button"
                  className="search-suggest-line"
                  aria-label={t('searchBar.linePrefix', { line: line.properties.line })}
                  onClick={() => handleSelectLine(line)}
                >
                  <span style={{ background: lineColor(line.properties.line), color: onColor(lineColor(line.properties.line)) }}>
                    {line.properties.line}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Dropdown */}
      {isOpen && allItems.length > 0 && (
        <div
          className="glass-panel search-bar-results"
          id="search-bar-listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            left: 0,
            right: 0,
            maxHeight: '320px',
            overflowY: 'auto',
            zIndex: 200,
            padding: '6px 0',
            background: 'var(--bg-panel-solid)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
          }}
          role="listbox"
        >
          {/* Lines section */}
          {filteredLines.length > 0 && (
            <div style={{ padding: '4px 0' }}>
              <div style={{ padding: '2px 14px 4px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-secondary)' }}>
                {t('searchBar.lines')}
              </div>
              {filteredLines.map((line) => {
                const idx = itemIdx++;
                const isHl = highlighted === idx;
                return (
                  <div
                    key={`line-${line.properties.line}`}
                    id={`search-bar-option-${idx}`}
                    className="search-bar-option"
                    role="option"
                    aria-selected={isHl}
                    onClick={() => handleSelectLine(line)}
                    onMouseEnter={() => setHighlighted(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 14px',
                      cursor: 'pointer',
                      background: isHl ? 'var(--bg-hover)' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                  >
                    <div style={{
                      width: '22px', height: '22px', borderRadius: '50%',
                      background: line.properties.color, color: '#fff',
                      fontWeight: 800, fontSize: '10px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      {line.properties.line}
                    </div>
                    <span style={{ fontSize: '0.88rem', fontWeight: 500 }}>{line.properties.name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Stations section */}
          {filteredStations.length > 0 && (
            <div style={{ padding: '4px 0' }}>
              {filteredLines.length > 0 && (
                <div style={{ height: '1px', background: 'var(--border-color)', margin: '2px 14px 6px' }} />
              )}
              <div style={{ padding: '2px 14px 4px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: 'var(--text-secondary)' }}>
                {t('searchBar.stations')}
              </div>
              {filteredStations.map((st) => {
                const idx = itemIdx++;
                const isHl = highlighted === idx;
                return (
                  <div
                    key={`st-${st.properties.name}`}
                    id={`search-bar-option-${idx}`}
                    className="search-bar-option"
                    role="option"
                    aria-selected={isHl}
                    onClick={() => handleSelectStation(st)}
                    onMouseEnter={() => setHighlighted(idx)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 14px',
                      cursor: 'pointer',
                      background: isHl ? 'var(--bg-hover)' : 'transparent',
                      transition: 'background 0.1s',
                    }}
                  >
                    <MapPin size={14} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {st.properties.name}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        {t('searchBar.stationLines', { lines: (st.properties.lines || []).join(', ') })}
                      </div>
                    </div>
                    <Navigation size={12} color="var(--text-secondary)" style={{ flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SearchBar;
