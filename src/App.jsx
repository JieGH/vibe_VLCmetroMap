import React, { useState } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import StationDetailCard from './components/StationDetailCard';
import { Sun, Moon, X } from 'lucide-react';
import './index.css';

function App() {
  const [theme, setTheme] = useState('dark');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedStation, setSelectedStation] = useState(null);
  const [flyTarget, setFlyTarget] = useState(null);
  const [activeLineFilter, setActiveLineFilter] = useState([]);
  const [hoverLine, setHoverLine] = useState(null);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Station click — just opens the detail card, does NOT move the map
  const handleSelectStation = (station) => {
    setSelectedStation(station);
  };

  // "Center Station on Map" button — explicitly flies to station
  const handleCenterStation = (station) => {
    // Use a new object each time to force the useEffect to re-fire
    // even if the same station is clicked again
    setFlyTarget({ ...station, _ts: Date.now() });
  };

  const handleSelectLine = (lineId) => {
    // null clears selection
    if (!lineId) return setActiveLineFilter([]);
    setActiveLineFilter((prev) => {
      if (!Array.isArray(prev)) prev = [];
      if (prev.includes(lineId)) return prev.filter(l => l !== lineId);
      return [...prev, lineId];
    });
  };

  // Get the active line color for the filter banner
  const getLineColor = (lineId) => {
    const colors = { '1': '#FFD100', '3': '#E2001A', '5': '#00994D' };
    return colors[lineId] || '#888';
  };

  return (
    <div className="app-container">
      {/* Full-screen interactive map */}
      <MapView
        theme={theme}
        selectedStation={selectedStation}
        flyTarget={flyTarget}
        onSelectStation={handleSelectStation}
        activeLineFilter={activeLineFilter}
        hoverLine={hoverLine}
      />

      {/* Collapsible Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        activeLineFilter={activeLineFilter}
        onSelectLine={handleSelectLine}
        onHoverLine={(lineId) => setHoverLine(lineId)}
      />

      {/* Floating Top Search Bar & Theme Switcher */}
      <div
        className={`search-bar-container glass-panel ${!isSidebarOpen ? 'sidebar-collapsed' : ''}`}
        style={{ padding: '8px 16px', display: 'flex', gap: '12px', alignItems: 'center' }}
      >
        <SearchBar
          onSelectStation={handleSelectStation}
          onSelectLine={handleSelectLine}
          activeLineFilter={activeLineFilter}
        />
        <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', flexShrink: 0 }} />
        <button
          onClick={toggleTheme}
          style={{
            padding: '8px',
            borderRadius: '8px',
            background: 'var(--bg-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
        >
          {theme === 'dark'
            ? <Sun size={18} color="#FFD100" />
            : <Moon size={18} color="#004D99" />}
        </button>
      </div>

      {/* Active Line Filter Banner */}
      {Array.isArray(activeLineFilter) && activeLineFilter.length > 0 && (
        <button
          className="active-filter-banner glass-panel"
          onClick={() => handleSelectLine(null)}
          style={{
            color: '#fff',
            background: getLineColor(activeLineFilter[0]),
            borderColor: 'transparent',
          }}
          title="Click to clear filter"
        >
          <span>Lines {activeLineFilter.join(', ')} only</span>
          <X size={13} style={{ opacity: 0.85 }} />
        </button>
      )}

      {/* Station Detail Card */}
      {selectedStation && (
        <StationDetailCard
          station={selectedStation}
          onClose={() => setSelectedStation(null)}
          onCenter={() => handleCenterStation(selectedStation)}
        />
      )}
    </div>
  );
}

export default App;
