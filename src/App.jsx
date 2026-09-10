import React, { useState, useEffect, useRef } from 'react';
import MapView from './components/MapView';
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import StationPanel from './components/StationPanel';
import DashboardBoard from './components/DashboardBoard';
import AboutModal from './components/AboutModal';
import LocateButton from './components/LocateButton';
import WelcomeScreen from './components/WelcomeScreen';
import { locate } from './services/userLocation';
import arrivalStore from './services/arrivalStore';
import trainPositionEngine from './services/trainPositionEngine';
import { getStoredFontSize, setStoredFontSize, applyFontSize } from './utils/fontSize';
import { useTranslation } from './i18n';
import { Sun, Moon, X, LayoutDashboard, Menu } from 'lucide-react';
import './index.css';

// How long a locate's answer stays on screen. Long enough to read a refusal,
// short enough that it is gone before it becomes furniture.
const LOCATE_NOTICE_MS = 6000;

// Dashboard mode is bookmarkable so an unattended tablet can boot straight into
// it, and reachable from a button so it is discoverable from the map.
const readMode = () =>
  new URLSearchParams(window.location.search).get('mode') === 'dashboard' ? 'dashboard' : 'map';

function App() {
  const { t } = useTranslation();
  const [showWelcome, setShowWelcome] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [mode, setMode] = useState(readMode);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [selectedStation, setSelectedStation] = useState(null);
  const selectedStationRef = useRef(selectedStation);
  useEffect(() => {
    selectedStationRef.current = selectedStation;
  }, [selectedStation]);

  const [flyTarget, setFlyTarget] = useState(null);
  const [activeLineFilter, setActiveLineFilter] = useState([]);
  const [hoverLine, setHoverLine] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locateState, setLocateState] = useState('idle');
  const [locateNotice, setLocateNotice] = useState(null);

  // Live train counts for the sidebar stats panel. Recomputed on every
  // arrivalStore notification so the numbers stay in sync with the map.
  const [trainStats, setTrainStats] = useState({ live: 0, confirmed: 0 });
  useEffect(() => {
    const computeStats = () => {
      const vehicles = trainPositionEngine.getLiveVehiclesFromMemory(Date.now());
      setTrainStats({
        live: vehicles.length,
        confirmed: vehicles.filter(v => v.sightingCount > 1).length,
      });
    };
    computeStats();
    return arrivalStore.subscribe(computeStats);
  }, []);

  const [fontSize, setFontSize] = useState(getStoredFontSize);
  useEffect(() => {
    applyFontSize(fontSize);
  }, [fontSize]);

  const handleSelectFontSize = (newSize) => {
    setFontSize(newSize);
    setStoredFontSize(newSize);
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
  };

  // Station click — just opens the detail card, does NOT move the map
  const handleSelectStation = (station) => {
    setSelectedStation(station);
  };

  // Toggle sidebar menu. Opening the menu exits active station focus
  // so the menu has clear visibility without panel collision.
  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      if (next && selectedStationRef.current) {
        setSelectedStation(null);
      }
      return next;
    });
  };

  // "Center Station on Map" button — explicitly flies to station
  const handleCenterStation = (station) => {
    // Use a new object each time to force the useEffect to re-fire
    // even if the same station is clicked again
    setFlyTarget({ ...station, _ts: Date.now() });
  };

  // Turns a locate() result into the sentence shown in the notice — built
  // from status/reason/station rather than read off result.message, so the
  // notice follows the UI language even though userLocation.js's own message
  // stays English-only (it is a library function, not UI).
  const describeLocateResult = (result) => {
    if (result.status !== 'located') {
      return t(`locate.${result.status}`);
    }
    if (result.reason === 'imprecise') return t('locate.imprecise');
    if (result.reason === 'out-of-range') return t('locate.outOfRange');
    if (result.nearestStation) {
      return t('locate.nearestStation', {
        station: result.nearestStation.properties.name,
        distance: Math.round(result.distance),
      });
    }
    return result.message;
  };

  // Applies a User Location fix to the state. Does not displace a Station
  // the viewer has chosen manually while a background refinement was in flight.
  const applyUserLocation = (fix, updateStation = true) => {
    setUserLocation(fix);
    setLocateNotice({ text: describeLocateResult(fix), _ts: Date.now() });
    if (updateStation && fix.nearestStation) {
      setSelectedStation(fix.nearestStation);
    }
  };

  // The locate button. One press takes a fix, frames it against the Nearest
  // Station and opens that Station's departures — deliberately compounding the
  // three, against the rule three lines above that a Station click never moves
  // the map. That rule is about incidental clicks; this is a single explicit
  // ask, and answering "where am I" without moving the map would answer
  // nothing. It is the only exception.
  const handleLocate = async () => {
    // A press while a fix is in flight is ignored rather than queued.
    if (locateState === 'locating') return;

    setLocateState('locating');
    let initialNearestStation = null;

    // Always re-acquire rather than re-centring on the fix already held: a dot
    // that is twenty minutes old under a button that looks like it just worked
    // is exactly the lie the fade exists to prevent. `maximumAge` inside
    // locate() makes a repeat press within half a minute cheap anyway.
    const result = await locate({
      onProgressiveFix: (interim) => {
        if (interim.status === 'located') {
          initialNearestStation = interim.nearestStation;
          setLocateState('idle');
          applyUserLocation(interim, true);
        }
      },
    });

    // A timeout goes back to idle rather than sticking on 'unavailable': it is
    // the one failure worth pressing again, and a crossed-out icon says the
    // opposite. Denied and unavailable are states of the device, not of the
    // attempt, so those persist until something changes.
    setLocateState(
      result.status === 'located' || result.status === 'timeout' ? 'idle' : 'unavailable'
    );

    if (result.status === 'located') {
      // Only set the Station if the viewer hasn't selected a different one
      // in the meantime while high-accuracy refinement completed.
      const canUpdateStation =
        !selectedStationRef.current ||
        (initialNearestStation && selectedStationRef.current === initialNearestStation);

      applyUserLocation(result, canUpdateStation);
    } else {
      setUserLocation(null);
      setLocateNotice({ text: describeLocateResult(result), _ts: Date.now() });
    }
  };

  // Holding the locate button clears the dot. The fix is a snapshot that goes
  // stale on its own — the fade says so — and once it has served its purpose
  // there was previously no way to take it off the map short of a reload.
  const handleHideLocation = () => {
    if (!userLocation) return;
    setUserLocation(null);
    setLocateState('idle');
    setLocateNotice({ text: t('app.locationHidden'), _ts: Date.now() });
  };

  useEffect(() => {
    if (!locateNotice) return undefined;
    const id = setTimeout(() => setLocateNotice(null), LOCATE_NOTICE_MS);
    return () => clearTimeout(id);
  }, [locateNotice]);

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

  const selectMode = (next) => {
    const url = new URL(window.location.href);
    if (next === 'dashboard') url.searchParams.set('mode', 'dashboard');
    else url.searchParams.delete('mode');
    window.history.replaceState({}, '', url);
    setMode(next);
  };

  // Back and forward have to land on the mode the URL names, or a bookmarked
  // dashboard stops being a reliable place to return to.
  useEffect(() => {
    const onPopState = () => setMode(readMode());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (mode === 'dashboard') {
    return (
      <div className="app-container">
        {showWelcome && (
          <WelcomeScreen onComplete={() => setShowWelcome(false)} />
        )}
        <DashboardBoard
          theme={theme}
          onExit={() => selectMode('map')}
          onOpenAbout={() => setIsAboutOpen(true)}
        />
        <AboutModal
          isOpen={isAboutOpen}
          onClose={() => setIsAboutOpen(false)}
        />
      </div>
    );
  }

  return (
    <div className="app-container">
      {showWelcome && (
        <WelcomeScreen onComplete={() => setShowWelcome(false)} />
      )}
      {/* Full-screen interactive map */}
      <MapView
        theme={theme}
        selectedStation={selectedStation}
        flyTarget={flyTarget}
        onSelectStation={handleSelectStation}
        activeLineFilter={activeLineFilter}
        hoverLine={hoverLine}
        userLocation={userLocation}
      />

      {/* Collapsible Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        activeLineFilter={activeLineFilter}
        onSelectLine={handleSelectLine}
        onHoverLine={(lineId) => setHoverLine(lineId)}
        trainStats={trainStats}
        onOpenAbout={() => setIsAboutOpen(true)}
        fontSize={fontSize}
        onSelectFontSize={handleSelectFontSize}
      />

      {/* Top Navigation Bar: Sidebar Toggle Button + Search Bar & Quick Actions */}
      <div className={`top-bar-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
        <button
          onClick={handleToggleSidebar}
          className="sidebar-toggle-btn glass-panel"
          title={isSidebarOpen ? t('app.closeSidebar') : t('app.openSidebar')}
          aria-label={isSidebarOpen ? t('app.closeSidebar') : t('app.openSidebar')}
        >
          <Menu size={20} />
        </button>
        <div
          className="search-bar-container glass-panel"
          style={{ padding: '8px 14px', display: 'flex', gap: '10px', alignItems: 'center' }}
        >
          <SearchBar
            onSelectStation={handleSelectStation}
            onSelectLine={handleSelectLine}
            activeLineFilter={activeLineFilter}
            selectedStation={selectedStation}
          />
          <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', flexShrink: 0 }} />
          <button
            onClick={() => selectMode('dashboard')}
            style={{
              padding: '8px',
              borderRadius: '8px',
              background: 'var(--bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            title={t('app.dashboardModeTitle')}
          >
            <LayoutDashboard size={18} />
          </button>
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
            title={theme === 'dark' ? t('app.switchToLightTheme') : t('app.switchToDarkTheme')}
          >
            {theme === 'dark'
              ? <Sun size={18} color="#FFD100" />
              : <Moon size={18} color="#004D99" />}
          </button>
        </div>
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
          title={t('app.clearFilterTitle')}
        >
          <span>{t('app.lineFilterBanner', { lines: activeLineFilter.join(', ') })}</span>
          <X size={13} style={{ opacity: 0.85 }} />
        </button>
      )}

      {/* What the locate button found, or why it found nothing */}
      {locateNotice && (
        <button
          className="locate-notice glass-panel"
          onClick={() => setLocateNotice(null)}
          title={t('app.dismissTitle')}
        >
          {locateNotice.text}
        </button>
      )}

      <LocateButton
        state={locateState}
        showingLocation={Boolean(userLocation)}
        onLocate={handleLocate}
        onHide={handleHideLocation}
      />

      {/* Station Focus panel — right in landscape, bottom in portrait */}
      {selectedStation && (
        <StationPanel
          key={selectedStation?.properties?.name || selectedStation?.properties?.apiId || 'station-panel'}
          station={selectedStation}
          theme={theme}
          onClose={() => setSelectedStation(null)}
          onCenter={() => handleCenterStation(selectedStation)}
        />
      )}

      {/* About, Legal & Licenses Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
      />
    </div>
  );
}

export default App;
