import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, MapPin, Navigation } from 'lucide-react';
import metroData from '../data/metro_lines.json';
import gtfsData from '../data/gtfs_expanded.json';
import { searchFuzzy } from '../utils/fuzzySearch';
import { useTranslation } from '../i18n';
import { COMMON_STOPS } from '../utils/commonStops';
import { lineColor } from '../utils/lineColor';
import { getRealBusLines, getAllBusStops } from '../data/emtData';
import BusBadge from './BusBadge';
import { POPULAR_BUS_LINE_IDS } from '../utils/popularBus';

// gtfs_expanded.json is the canonical station set for the whole network; the
// handful of points in metro_lines.json are a much older subset.
const stations = gtfsData.features.filter(f => f.geometry.type === 'Point');
const lines    = metroData.features.filter(f => f.geometry.type === 'LineString');

const SearchBar = ({
  onSelectStation,
  onSelectLine,
  activeLineFilter,
  selectedStation,
  onSelectBusLine,
  onSelectBusStop,
  autoFocus = false,
  onClose,
}) => {
  const { t } = useTranslation();
  const [query,       setQuery]       = useState('');
  const [isOpen,      setIsOpen]      = useState(Boolean(autoFocus));
  const [highlighted, setHighlighted] = useState(-1);
  const dropdownRef = useRef(null);
  const inputRef    = useRef(null);
  const [suggestStyle, setSuggestStyle] = useState({});

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
      setIsOpen(true);
    }
  }, [autoFocus]);

  // Filtered results with Valencian accent-insensitive fuzzy search
  // The popular buses, as the real line objects a search result would hand on.
  const popularBuses = onSelectBusLine
    ? POPULAR_BUS_LINE_IDS.map(id => getRealBusLines().find(b => b.id === id)).filter(Boolean)
    : [];

  const filteredLines = query.trim()
    ? searchFuzzy(lines, query, l => `${l.properties.name} Line ${l.properties.line} Linia ${l.properties.line}`)
    : [];

  const filteredBusLines = query.trim()
    ? searchFuzzy(getRealBusLines(), query, b => `${b.id} ${b.name} Bus ${b.id} EMT ${b.id} Linia ${b.id}`)
    : [];

  const filteredStations = query.trim()
    ? searchFuzzy(stations, query, st => st.properties.name)
    : [];

  // A stop code is a search key too; capped so a short query does not list hundreds.
  const filteredBusStops = query.trim() && onSelectBusStop
    ? searchFuzzy(getAllBusStops(), query, s => `${s.stopCode} ${s.stopName}`).slice(0, 8)
    : [];

  // Flat ordered list of all results for keyboard nav
  const allItems = [
    ...filteredLines.map(l  => ({ type: 'line',    data: l  })),
    ...filteredBusLines.map(b => ({ type: 'busLine', data: b })),
    ...filteredStations.map(st => ({ type: 'station', data: st })),
    ...filteredBusStops.map(s => ({ type: 'busStop', data: s })),
  ];

  // The suggestions are wider than the search field, so place them inside the viewport.
  useEffect(() => {
    if (!isOpen || query.trim() || !dropdownRef.current) return;
    const rect = dropdownRef.current.getBoundingClientRect();
    const width = Math.min(540, window.innerWidth - 24);
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
    if (onClose) onClose();
  }, [onSelectStation, onClose]);

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
    if (onClose) onClose();
  }, [onSelectLine, t, onClose]);

  const handleSelectBusLine = useCallback((busLine) => {
    if (onSelectBusLine) onSelectBusLine(busLine);
    setQuery(t('bus.searchQuery', { line: busLine.id, name: busLine.name }));
    setIsOpen(false);
    setHighlighted(-1);
    inputRef.current?.blur();
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
    }
    if (onClose) onClose();
  }, [onSelectBusLine, onClose]);

  const handleSelectBusStop = useCallback((stop) => {
    onSelectBusStop(stop);
    setQuery(stop.stopName);
    setIsOpen(false);
    setHighlighted(-1);
    inputRef.current?.blur();
    if (typeof window !== 'undefined') {
      window.scrollTo(0, 0);
      document.body.scrollTop = 0;
    }
    if (onClose) onClose();
  }, [onSelectBusStop, onClose]);

  const handleClear = () => {
    setQuery('');
    setIsOpen(false);
    setHighlighted(-1);
    selectedStationNameRef.current = '';
    if (activeLineFilter && activeLineFilter.length > 0) onSelectLine(null);
    if (onSelectStation) onSelectStation(null);
    if (onSelectBusLine) onSelectBusLine(null);
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
      setIsOpen(false);
      setHighlighted(-1);
      inputRef.current?.blur();
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
      }
      if (onClose) onClose();
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
        else if (item.type === 'busLine') handleSelectBusLine(item.data);
        else if (item.type === 'busStop') handleSelectBusStop(item.data);
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
            <div className="search-suggest-title">{t('searchBar.popularBuses')}</div>
            <div className="search-suggest-lines">
              {popularBuses.map((bus) => (
                <button
                  key={bus.id}
                  type="button"
                  className="search-suggest-line"
                  aria-label={t('bus.searchQuery', { line: bus.id, name: bus.name })}
                  onClick={() => handleSelectBusLine(bus)}
                >
                  <BusBadge line={bus.id} color={bus.color} type={bus.type} size="md" />
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

          {/* EMT Bus Lines section */}
          {filteredBusLines.length > 0 && (
            <div style={{ padding: '4px 0' }}>
              {(filteredLines.length > 0) && (
                <div style={{ height: '1px', background: 'var(--border-color)', margin: '2px 14px 6px' }} />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 14px 4px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#ff6369', fontWeight: 800 }}>
                <span style={{ fontSize: '0.54rem', fontWeight: 900, background: '#D62828', color: '#fff', padding: '1px 3px', borderRadius: 2 }}>EMT</span>
                <span>{t('bus.valenciaLines')}</span>
              </div>
              {filteredBusLines.map((bus) => {
                const idx = itemIdx++;
                const isHl = highlighted === idx;
                return (
                  <div
                    key={`bus-${bus.id}`}
                    id={`search-bar-option-${idx}`}
                    className="search-bar-option"
                    role="option"
                    aria-selected={isHl}
                    onClick={() => handleSelectBusLine(bus)}
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
                    <BusBadge line={bus.id} color={bus.color} type={bus.type} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {bus.name}
                      </div>
                      <div style={{ fontSize: '0.70rem', color: 'var(--text-secondary)' }}>
                        {t('bus.headway', { value: bus.headway })} · {t('bus.activeBuses', { count: bus.activeVehicles })}
                      </div>
                    </div>
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

          {/* EMT bus stops section */}
          {filteredBusStops.length > 0 && (
            <div style={{ padding: '4px 0' }}>
              <div style={{ height: '1px', background: 'var(--border-color)', margin: '2px 14px 6px' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 14px 4px', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: '#ff6369', fontWeight: 800 }}>
                <span style={{ fontSize: '0.54rem', fontWeight: 900, background: '#D62828', color: '#fff', padding: '1px 3px', borderRadius: 2 }}>EMT</span>
                <span>{t('bus.busStops')}</span>
              </div>
              {filteredBusStops.map((stop) => {
                const idx = itemIdx++;
                const isHl = highlighted === idx;
                return (
                  <div
                    key={`stop-${stop.stopCode}`}
                    id={`search-bar-option-${idx}`}
                    className="search-bar-option"
                    role="option"
                    aria-selected={isHl}
                    onClick={() => handleSelectBusStop(stop)}
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
                    <MapPin size={14} color="#ff6369" style={{ flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.88rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {stop.stopName}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                        {t('bus.stopResult', { code: stop.stopCode, lines: (stop.lines || []).join(', ') })}
                      </div>
                    </div>
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
