import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
const MapView = lazy(() => import('./components/MapView'));
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import StationPanel from './components/StationPanel';
import DashboardBoard from './components/DashboardBoard';
import AboutModal from './components/AboutModal';
import LocateButton from './components/LocateButton';
import HubChips from './components/HubChips';
import WalkBanner from './components/WalkBanner';
import WelcomeScreen from './components/WelcomeScreen';
import { AppDownloadSheet } from './components/AppDownloadBanner';
import { isIosDevice } from './utils/appDownload';
import FeedbackModal from './components/FeedbackModal';
import WhatsNewModal from './components/WhatsNewModal';
import { markWhatsNewSeen } from './utils/whatsNew';
import LanguageToggle from './components/LanguageToggle';
import MovedNotice from './components/MovedNotice';
import { locate, watchLocation } from './services/userLocation';
import { createAutoLocator } from './services/autoLocate';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import LocationRationale from './components/LocationRationale';
import { isAndroid } from './utils/platform';
import { resolveBackAction } from './utils/androidBack';
import { initialTheme, watchSystemTheme } from './utils/systemTheme';
import { openAppSettings } from './services/openSettings';
import arrivalStore from './services/arrivalStore';
import trainPositionEngine from './services/trainPositionEngine';
import { getStoredFontSize, setStoredFontSize, applyFontSize } from './utils/fontSize';
import { useTranslation } from './i18n';
import { Sun, Moon, MessageSquare } from 'lucide-react';
import AppBadge from './components/AppBadge';
import setupInputScrollDragPrevention from './utils/preventInputScrollDrag';
import { setupIncidentReporting, reportNormalUserVisit, reportStationAccess } from './utils/telemetry';
import BusLineInspector from './components/BusLineInspector';
import BusStopBoard from './components/BusStopBoard';
import BusBadge from './components/BusBadge';
import { EMT_LINES, LIVE_BUS_TELEMETRY } from './data/emtData';
import './index.css';

// How long a locate's answer stays on screen. Long enough to read a refusal,
// short enough that it is gone before it becomes furniture.
const LOCATE_NOTICE_MS = 6000;

// How long the floating walking box stays before it hides itself.

// Dashboard mode is bookmarkable so an unattended tablet can boot straight into
// it, and reachable from a button so it is discoverable from the map.
const readMode = () =>
  new URLSearchParams(window.location.search).get('mode') === 'dashboard' ? 'dashboard' : 'map';

const readVariant = () => {
  if (typeof window === 'undefined') return 'A';
  const param = new URLSearchParams(window.location.search).get('variant');
  if (param && ['a', 'b', 'c'].includes(param.toLowerCase())) {
    return param.toUpperCase();
  }
  return 'A';
};

function App() {
  const { t } = useTranslation();
  const android = isAndroid();
  // The animated splash covers initial loading on web and iOS while MapView and train arrivals
  // initialize in the background, smoothly fading out once the map is ready. Skipped on Android
  // because the OS system window splash already covers it.
  const [showWelcome, setShowWelcome] = useState(() => !android);
  const [mapReady, setMapReady] = useState(false);
  const [theme, setTheme] = useState(() => initialTheme(android));
  const [themeMode, setThemeMode] = useState(android ? 'system' : 'dark');
  const [rationale, setRationale] = useState(null);
  const [mode, setMode] = useState(readMode);
  const [variant, setVariant] = useState(readVariant);
  const [activeBusLine, setActiveBusLine] = useState(null);
  const [selectedBusStop, setSelectedBusStop] = useState(null);
  const [activeMode, setActiveMode] = useState('bus'); // In Variant C, bus mode is default so differences are tactile
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
  const [isWhatsNewOpen, setIsWhatsNewOpen] = useState(false);
  const [isAppDownloadOpen, setIsAppDownloadOpen] = useState(false);

  const handleCloseWhatsNew = () => {
    markWhatsNewSeen();
    setIsWhatsNewOpen(false);
  };

  const handleContactAuthorFromWhatsNew = () => {
    handleCloseWhatsNew();
    setIsFeedbackOpen(true);
  };
  const [selectedStation, setSelectedStation] = useState(null);
  const selectedStationRef = useRef(selectedStation);
  useEffect(() => {
    selectedStationRef.current = selectedStation;
  }, [selectedStation]);

  const [activeLineFilter, setActiveLineFilter] = useState([]);
  // Always null: nothing currently triggers a line hover, but MapView still
  // accepts this prop to dim other lines when one does.
  const hoverLine = null;
  const [userLocation, setUserLocation] = useState(null);
  const [locateState, setLocateState] = useState('idle');
  const [locateNotice, setLocateNotice] = useState(null);
  // The Station the floating walking box points at; null hides the box. The
  // distance is not stored: the box recomputes it from the latest fix.
  const [walkTarget, setWalkTarget] = useState(null);
  const userLocationRef = useRef(null);
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);
  useEffect(() => {
    if (variant === 'A') {
      setWalkTarget(null);
    }
  }, [variant]);
  // True while the search field has focus; the chip row steps aside then.
  const [searchFocused, setSearchFocused] = useState(false);
  // Where the sheet sits, so the bottom-right stack can ride above (portrait)
  // or beside (landscape) it instead of overlapping.
  const [sheetBox, setSheetBox] = useState(null);
  const autoLocatorRef = useRef(null);
  // The Station auto-locate itself selected, so its own refinement may replace
  // it while a Station the viewer chose may not.
  const autoSelectedRef = useRef(null);

  // Live train counts for the sidebar stats panel. Recomputed on every
  // arrivalStore notification so the numbers stay in sync with the map.
  const [trainStats, setTrainStats] = useState({ live: 0, confirmed: 0 });
  useEffect(() => {
    const computeStats = () => {
      const vehicles = trainPositionEngine.getLiveVehiclesFromMemory(Date.now());
      const live = vehicles.length;
      const confirmed = vehicles.filter(v => v.sightingCount > 1).length;
      // Same numbers: hand React the same object so it skips the commit.
      setTrainStats(prev => (prev.live === live && prev.confirmed === confirmed ? prev : { live, confirmed }));
    };
    computeStats();
    return arrivalStore.subscribe(computeStats);
  }, []);

  // Set up incident reporting and report normal human user access to Telegram
  useEffect(() => {
    setupIncidentReporting();
    const timer = setTimeout(() => {
      const initialStation = selectedStationRef.current?.properties?.name || selectedStationRef.current?.name;
      reportNormalUserVisit({ station: initialStation });
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setVariant(readVariant());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleSelectBusLine = (busLine) => {
    setActiveBusLine(busLine);
    setSelectedStation(null);
  };

  const handleSelectBusStop = (busStop) => {
    setSelectedBusStop(busStop);
    if (busStop) {
      setSelectedStation(null);
      if (userLocationRef.current?.isMapClick) {
        setUserLocation(null);
        userLocationRef.current = null;
      }
    }
  };

  const [fontSize, setFontSize] = useState(getStoredFontSize);
  useEffect(() => {
    applyFontSize(fontSize);
  }, [fontSize]);

  const handleSelectFontSize = (newSize) => {
    setFontSize(newSize);
    setStoredFontSize(newSize);
  };

  // Auto follows the phone's dark/light setting; Android starts there, web and iOS
  // start dark. Picking Light or Dark (sidebar or top-bar toggle) stops following.
  const applyTheme = (next) => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  };
  useEffect(() => {
    if (themeMode !== 'system') return undefined;
    applyTheme(initialTheme(true));
    return watchSystemTheme(applyTheme);
  }, [themeMode]);

  const handleSelectTheme = (mode) => {
    setThemeMode(mode);
    if (mode !== 'system') applyTheme(mode);
  };

  const toggleTheme = () => handleSelectTheme(theme === 'dark' ? 'light' : 'dark');

  // Station click — opens the multimodal hub card with walking metrics
  const handleSelectStation = (station, options = {}) => {
    autoLocatorRef.current?.interrupt();
    setSelectedStation(station);
    if (!station) {
      if (userLocationRef.current?.isMapClick || userLocationRef.current?.status === 'located') {
        setUserLocation(null);
        userLocationRef.current = null;
      }
    } else {
      setSelectedBusStop(null);
    }
    if (options.userLocation) {
      setUserLocation(options.userLocation);
      userLocationRef.current = options.userLocation;
    } else if (station && !station.isPin && !station.properties?.isPin && station.properties?.name !== 'Map Ping' && station.properties?.name !== "Where you're at") {
      // User explicitly picked a Metro station: clear any previous pin / GPS ping
      if (userLocationRef.current?.isMapClick || userLocationRef.current?.status === 'located') {
        setUserLocation(null);
        userLocationRef.current = null;
      }
    }
    // With a fix in hand, say how far this Station is on foot (omitted in Variant A multimodal hub).
    if (variant !== 'A' && userLocationRef.current && station) setWalkTarget({ station, _ts: Date.now() });

    const stName = station?.properties?.name || station?.name;
    if (stName) {
      reportStationAccess(stName, {
        lines: station?.properties?.lines,
        zone: station?.properties?.zona || station?.properties?.zone,
      });
    }
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

  // Android only: explain what location is for before the system prompt, so
  // the viewer is never asked cold. Resolves true on Continue, false on Not now.
  // Held in a ref because the launch-time locator is created once.
  const requestRationaleRef = useRef(null);
  requestRationaleRef.current = android
    ? () => new Promise((resolve) => setRationale((prev) => {
      prev?.resolve(false);
      return { resolve };
    }))
    : null;
  const answerRationale = (allowed) => {
    setRationale((current) => {
      current?.resolve(allowed);
      return null;
    });
  };
  const beforePrompt = () => requestRationaleRef.current?.() ?? Promise.resolve(true);

  // Applies a User Location fix to the state. Does not displace a Station
  // the viewer has chosen manually while a background refinement was in flight.
  const applyUserLocation = (fix, updateStation = true) => {
    setUserLocation(fix);
    userLocationRef.current = fix;
    if (fix.nearestStation) {
      // The walking box answers a successful fix; the notice is for errors only (omitted in Variant A multimodal hub).
      if (variant !== 'A') {
        setWalkTarget({ station: fix.nearestStation, _ts: Date.now() });
      }
    } else {
      setLocateNotice({ text: describeLocateResult(fix), _ts: Date.now() });
    }
    if (updateStation) {
      const targetStation = (variant === 'A' && fix.coordinates)
        ? {
            properties: {
              name: "Where you're at",
              lines: [],
              isPin: true,
              apiId: 'user-location-gps',
              nearestStation: fix.nearestStation,
            },
            geometry: { type: 'Point', coordinates: fix.coordinates },
            isPin: true,
          }
        : fix.nearestStation;

      if (targetStation) {
        setSelectedStation(targetStation);
      }
      const stName = fix.nearestStation?.properties?.name || fix.nearestStation?.name;
      if (stName) {
        reportStationAccess(stName, {
          lines: fix.nearestStation?.properties?.lines,
          zone: fix.nearestStation?.properties?.zona || fix.nearestStation?.properties?.zone,
        });
      }
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

    // An explicit press outranks a launch-time locate still in flight.
    autoLocatorRef.current?.interrupt();

    setLocateState('locating');
    let initialNearestStation = null;

    // Always re-acquire rather than re-centring on the fix already held: a dot
    // that is twenty minutes old under a button that looks like it just worked
    // is exactly the lie the fade exists to prevent. `maximumAge` inside
    // locate() makes a repeat press within half a minute cheap anyway.
    const result = await locate({
      beforePrompt: android ? beforePrompt : undefined,
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
      ['located', 'timeout', 'declined'].includes(result.status) ? 'idle' : 'unavailable'
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
      setLocateNotice({
        text: describeLocateResult(result),
        _ts: Date.now(),
        // Android can send the viewer straight to this app's permission page.
        action: android && result.status === 'denied' ? 'open-settings' : null,
      });
    }
  };

  // Holding the locate button clears the dot. The fix is a snapshot that goes
  // stale on its own — the fade says so — and once it has served its purpose
  // there was previously no way to take it off the map short of a reload.
  const handleHideLocation = () => {
    if (!userLocation) return;
    setUserLocation(null);
    setWalkTarget(null);
    setLocateState('idle');
    setLocateNotice({ text: t('app.locationHidden'), _ts: Date.now() });
  };

  // Auto-locate: the fix is requested at mount, in parallel with the network
  // sync, and held until the map is ready to frame it. Not in dashboard mode,
  // which is an ambient display with nobody to locate.
  const dashboardMode = mode === 'dashboard';
  useEffect(() => {
    if (dashboardMode) return undefined;
    const locator = createAutoLocator({
      isNative: Capacitor.isNativePlatform(),
      beforePrompt: android ? beforePrompt : undefined,
      onFix: (fix) => {
        const current = selectedStationRef.current;
        if (current && current !== autoSelectedRef.current) return;
        autoSelectedRef.current = fix.nearestStation;
        applyUserLocation(fix, true);
      },
    });
    autoLocatorRef.current = locator;
    if (mapReady) locator.setReady();
    locator.start();
    return () => {
      locator.stop();
      autoLocatorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboardMode]);

  useEffect(() => {
    if (mapReady) autoLocatorRef.current?.setReady();
  }, [mapReady]);

  useEffect(() => {
    if (!locateNotice) return undefined;
    const id = setTimeout(() => setLocateNotice(null), LOCATE_NOTICE_MS);
    return () => clearTimeout(id);
  }, [locateNotice]);

  // The walking box stays until the viewer closes it, closes the Station panel, or zooms the map out (MapView
  // calls onZoomedOut): it answers "how far is this platform", which stays true for as long as the panel is open.
  useEffect(() => {
    if (!selectedStation) setWalkTarget(null);
  }, [selectedStation]);

  // While the box is up, follow the viewer so its distance counts down as they walk. The camera is not touched:
  // MapView frames once per locate request (keyed by fetchedAt), and `updatedAt` is what keeps the dot fresh.
  const walking = Boolean(walkTarget) && Boolean(userLocation);
  useEffect(() => {
    if (!walking) return undefined;
    return watchLocation({
      onFix: ({ coordinates, accuracy }) => setUserLocation((prev) => {
        if (!prev || prev.status !== 'located') return prev;
        const next = { ...prev, coordinates, accuracy, updatedAt: Date.now() };
        userLocationRef.current = next;
        return next;
      }),
    });
  }, [walking]);

  // Track the search field's focus for the chip row.
  useEffect(() => {
    const isSearch = (el) => Boolean(el?.closest?.('.search-bar-container')) && el.tagName === 'INPUT';
    const onIn = (e) => { if (isSearch(e.target)) setSearchFocused(true); };
    const onOut = (e) => { if (isSearch(e.target)) setSearchFocused(false); };
    document.addEventListener('focusin', onIn);
    document.addEventListener('focusout', onOut);
    return () => {
      document.removeEventListener('focusin', onIn);
      document.removeEventListener('focusout', onOut);
    };
  }, []);

  // Prevent mobile browser User Agent from dragging/scrolling the UI viewport
  // when an input or textarea is actively being edited.
  useEffect(() => {
    return setupInputScrollDragPrevention();
  }, []);

  // Measure the open sheet so the bottom stack never overlaps it.
  useEffect(() => {
    if (!selectedStation) {
      setSheetBox(null);
      return undefined;
    }
    let observer = null;
    const frame = requestAnimationFrame(() => {
      const el = document.querySelector('.station-panel');
      if (!el) return;
      const measure = () => {
        const next = { height: el.offsetHeight, landscape: el.dataset.landscape === 'true' };
        setSheetBox((prev) => (prev && prev.height === next.height && prev.landscape === next.landscape ? prev : next));
      };
      measure();
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(measure);
        observer.observe(el);
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
    };
  }, [selectedStation]);

  // Android system back button: peel one layer per press, leave the app last.
  // The listener is registered once and reads the latest state from a ref.
  const backStateRef = useRef({});
  backStateRef.current = {
    rationale,
    feedbackOpen: isFeedbackOpen,
    whatsNewOpen: isWhatsNewOpen,
    downloadOpen: isAppDownloadOpen,
    aboutOpen: isAboutOpen,
    welcomeVisible: showWelcome,
    dashboardMode: mode === 'dashboard',
    sidebarOpen: isSidebarOpen,
    stationOpen: Boolean(selectedStation),
    lineFilterActive: Array.isArray(activeLineFilter) && activeLineFilter.length > 0,
  };
  useEffect(() => {
    if (!android) return undefined;
    let handle = null;
    let cancelled = false;
    CapApp.addListener('backButton', () => {
      const st = backStateRef.current;
      const active = document.activeElement;
      const searchFocused = Boolean(
        active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')
      );
      switch (resolveBackAction({ ...st, rationaleOpen: Boolean(st.rationale), searchFocused })) {
        case 'decline-rationale': st.rationale.resolve(false); setRationale(null); break;
        case 'close-feedback': setIsFeedbackOpen(false); break;
        case 'close-whats-new': handleCloseWhatsNew(); break;
        case 'close-download': setIsAppDownloadOpen(false); break;
        case 'close-about': setIsAboutOpen(false); break;
        case 'dismiss-welcome': setShowWelcome(false); break;
        case 'exit-dashboard': selectModeRef.current('map'); break;
        case 'close-search': active.blur(); break;
        case 'close-sidebar': setIsSidebarOpen(false); break;
        case 'close-station': setSelectedStation(null); break;
        case 'clear-filter': setActiveLineFilter([]); break;
        default: CapApp.exitApp();
      }
    }).then((h) => {
      if (cancelled) h.remove();
      else handle = h;
    });
    return () => {
      cancelled = true;
      handle?.remove();
    };
  }, [android]);

  const handleSelectLine = (lineId) => {
    // null clears selection
    if (!lineId) return setActiveLineFilter([]);
    setActiveLineFilter((prev) => {
      if (!Array.isArray(prev)) prev = [];
      if (prev.includes(lineId)) return prev.filter(l => l !== lineId);
      return [...prev, lineId];
    });
  };

  const selectMode = (next) => {
    const url = new URL(window.location.href);
    if (next === 'dashboard') url.searchParams.set('mode', 'dashboard');
    else url.searchParams.delete('mode');
    window.history.replaceState({}, '', url);
    setMode(next);
  };

  const selectModeRef = useRef(selectMode);
  selectModeRef.current = selectMode;

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
          <WelcomeScreen ready onComplete={() => setShowWelcome(false)} />
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
        <WelcomeScreen ready={mapReady} onComplete={() => setShowWelcome(false)} />
      )}
      {/* Full-screen interactive map */}
      <Suspense fallback={<div className="map-loading-placeholder" style={{ position: 'absolute', inset: 0, background: 'var(--bg-canvas)' }} />}>
        <MapView
          theme={theme}
          selectedStation={selectedStation}
          onSelectStation={handleSelectStation}
          activeLineFilter={activeLineFilter}
          hoverLine={hoverLine}
          userLocation={userLocation}
          onReady={() => setMapReady(true)}
          onUserInteract={() => autoLocatorRef.current?.interrupt()}
          onZoomedOut={() => setWalkTarget(null)}
          variant={variant}
          activeBusLine={activeBusLine}
          onSelectBusLine={handleSelectBusLine}
          activeMode={activeMode}
          selectedBusStop={selectedBusStop}
          onSelectBusStop={handleSelectBusStop}
        />
      </Suspense>

      {/* Collapsible Sidebar */}
      <Sidebar
        isOpen={isSidebarOpen}
        onToggleSidebar={handleToggleSidebar}
        trainStats={trainStats}
        onOpenAbout={() => setIsAboutOpen(true)}
        onOpenFeedback={() => setIsFeedbackOpen(true)}
        onOpenWhatsNew={() => setIsWhatsNewOpen(true)}
        onOpenDashboard={() => selectMode('dashboard')}
        onOpenAppDownload={() => setIsAppDownloadOpen(true)}
        fontSize={fontSize}
        onSelectFontSize={handleSelectFontSize}
        themeMode={themeMode}
        onSelectTheme={handleSelectTheme}
      />

      {/* Top Navigation Bar: Sidebar Toggle Button + Search Bar & Quick Actions */}
      <div className={`top-bar-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
        <button
          onClick={handleToggleSidebar}
          className="sidebar-toggle-btn glass-panel"
          title={isSidebarOpen ? t('app.closeSidebar') : t('app.openSidebar')}
          aria-label={isSidebarOpen ? t('app.closeSidebar') : t('app.openSidebar')}
        >
          <AppBadge size={40} bare />
        </button>
        <div
          className="search-bar-container glass-panel"
          style={{ padding: '8px 14px', display: 'flex', gap: '10px', alignItems: 'center' }}
        >
          {variant === 'C' && (
            <div
              className="dual-lens-mode-control"
              role="tablist"
              aria-label="Transit Mode Selector"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 2,
                padding: '2px 4px',
                background: 'rgba(0,0,0,0.18)',
                borderRadius: 999,
                border: '1px solid var(--border-color)',
                flexShrink: 0,
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeMode === 'metro'}
                onClick={() => setActiveMode('metro')}
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: 'none',
                  background: activeMode === 'metro' ? '#E2001A' : 'transparent',
                  color: activeMode === 'metro' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: '50%',
                    background: activeMode === 'metro' ? '#ffffff' : '#E2001A',
                    color: activeMode === 'metro' ? '#E2001A' : '#ffffff',
                    fontSize: '0.58rem',
                    fontWeight: 900,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}
                >
                  m
                </span>
                <span>Metro</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeMode === 'bus'}
                onClick={() => setActiveMode('bus')}
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: 'none',
                  background: activeMode === 'bus' ? '#D62828' : 'transparent',
                  color: activeMode === 'bus' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <span
                  style={{
                    fontSize: '0.54rem',
                    fontWeight: 900,
                    background: activeMode === 'bus' ? '#ffffff' : '#D62828',
                    color: activeMode === 'bus' ? '#D62828' : '#ffffff',
                    padding: '1px 3px',
                    borderRadius: 2,
                    letterSpacing: '0.04em',
                    lineHeight: 1,
                  }}
                >
                  EMT
                </span>
                <span>Bus</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeMode === 'all'}
                onClick={() => setActiveMode('all')}
                style={{
                  padding: '3px 8px',
                  borderRadius: 999,
                  border: 'none',
                  background: activeMode === 'all' ? '#1565C0' : 'transparent',
                  color: activeMode === 'all' ? '#ffffff' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: '0.74rem',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                }}
              >
                <span>✨</span>
                <span>All</span>
              </button>
            </div>
          )}
          <SearchBar
            onSelectStation={handleSelectStation}
            onSelectLine={handleSelectLine}
            activeLineFilter={activeLineFilter}
            selectedStation={selectedStation}
            onSelectBusLine={handleSelectBusLine}
            variant={variant}
          />
          <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', flexShrink: 0 }} />
          <LanguageToggle className="topbar-icon-btn" />
          <button
            onClick={toggleTheme}
            className="topbar-icon-btn"
            title={theme === 'dark' ? t('app.switchToLightTheme') : t('app.switchToDarkTheme')}
            aria-label={theme === 'dark' ? t('app.switchToLightTheme') : t('app.switchToDarkTheme')}
          >
            {theme === 'dark'
              ? <Sun size={18} color="#FFD100" />
              : <Moon size={18} color="#004D99" />}
          </button>
          <button
            type="button"
            onClick={() => setIsFeedbackOpen(true)}
            className="topbar-icon-btn feedback-trigger-btn"
            title={t('feedback.buttonTitle')}
            aria-label={t('feedback.buttonTitle')}
            aria-haspopup="dialog"
          >
            <MessageSquare size={18} />
          </button>
        </div>
      </div>


      {/* On a retired address (Netlify, workers.dev): ask the visitor to move to xarxa.net */}
      {!showWelcome && <MovedNotice />}

      {/* Popular stops, and one chip per active Line filter */}
      {!searchFocused && (
        <div className={`hub-chips-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
          {variant === 'B' ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                padding: '2px 4px',
              }}
            >
              <span
                style={{
                  fontSize: '0.70rem',
                  fontWeight: 800,
                  color: '#ff6369',
                  background: 'rgba(214, 40, 40, 0.2)',
                  padding: '3px 8px',
                  borderRadius: 999,
                  whiteSpace: 'nowrap',
                }}
              >
                EMT Trunks
              </span>
              {EMT_LINES.map((line) => {
                const isSelected = activeBusLine?.id === line.id;
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => handleSelectBusLine(isSelected ? null : line)}
                    className="glass-panel"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 999,
                      border: isSelected ? `2px solid ${line.color}` : '1px solid var(--border-color)',
                      background: isSelected ? 'rgba(255, 255, 255, 0.22)' : 'var(--bg-panel)',
                      color: 'var(--text-primary)',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <BusBadge line={line.id} color={line.color} type={line.type} size="sm" />
                    <span>{line.name}</span>
                  </button>
                );
              })}
            </div>
          ) : variant === 'C' && activeMode === 'bus' ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                overflowX: 'auto',
                scrollbarWidth: 'none',
                padding: '2px 4px',
              }}
            >
              <span
                style={{
                  fontSize: '0.70rem',
                  fontWeight: 800,
                  color: '#ff6369',
                  background: 'rgba(214, 40, 40, 0.2)',
                  padding: '3px 8px',
                  borderRadius: 999,
                  whiteSpace: 'nowrap',
                }}
              >
                Bus Network Trunks
              </span>
              {EMT_LINES.slice(0, 5).map((line) => {
                const isSelected = activeBusLine?.id === line.id;
                return (
                  <button
                    key={line.id}
                    type="button"
                    onClick={() => handleSelectBusLine(isSelected ? null : line)}
                    className="glass-panel"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '4px 10px',
                      borderRadius: 999,
                      border: isSelected ? `2px solid ${line.color}` : '1px solid var(--border-color)',
                      background: isSelected ? 'rgba(255, 255, 255, 0.22)' : 'var(--bg-panel)',
                      color: 'var(--text-primary)',
                      fontWeight: 700,
                      fontSize: '0.78rem',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <BusBadge line={line.id} color={line.color} type={line.type} size="sm" />
                    <span>{line.name}</span>
                  </button>
                );
              })}
            </div>
          ) : activeLineFilter.length > 0 ? (
            <HubChips
              activeLines={activeLineFilter}
              onClearLine={handleSelectLine}
            />
          ) : null}
        </div>
      )}

      {/* What the locate button found, or why it found nothing */}
      {locateNotice && locateNotice.action && (
        <div className="locate-notice md-snackbar glass-panel" role="status">
          <span className="md-snackbar-text">{locateNotice.text}</span>
          <button
            type="button"
            className="md-snackbar-action"
            onClick={() => {
              setLocateNotice(null);
              openAppSettings();
            }}
          >
            {t('locate.openSettings')}
          </button>
        </div>
      )}
      {locateNotice && !locateNotice.action && (
        <button
          className="locate-notice glass-panel"
          onClick={() => setLocateNotice(null)}
          title={t('app.dismissTitle')}
        >
          {locateNotice.text}
        </button>
      )}

      {/* One column, bottom right: the walking box above the locate button,
          lifted over the sheet in portrait and set beside it in landscape */}
      <div
        className="bottom-stack"
        data-sheet={sheetBox ? (sheetBox.landscape ? 'landscape' : 'portrait') : 'none'}
        style={sheetBox && !sheetBox.landscape ? { '--sheet-lift': `${sheetBox.height + 12}px` } : undefined}
      >
        {variant !== 'A' && walkTarget && userLocation && sheetBox?.landscape && (
          <WalkBanner
            station={walkTarget.station}
            userLocation={userLocation}
            onDismiss={() => setWalkTarget(null)}
          />
        )}
        <LocateButton
          state={locateState}
          showingLocation={Boolean(userLocation)}
          onLocate={handleLocate}
          onHide={handleHideLocation}
        />
      </div>

      {/* The walking box, portrait: left-aligned with the Station list, just above it, clear of the locate button */}
      {variant !== 'A' && walkTarget && userLocation && !sheetBox?.landscape && (
        <div
          className="walk-dock"
          style={sheetBox ? { '--sheet-lift': `${sheetBox.height + 12}px` } : undefined}
        >
          <WalkBanner
            station={walkTarget.station}
            userLocation={userLocation}
            onDismiss={() => setWalkTarget(null)}
          />
        </div>
      )}

      {/* Station Focus panel — right in landscape, bottom in portrait */}
      {selectedStation && (
        <StationPanel
          key={selectedStation?.properties?.name || selectedStation?.properties?.apiId || 'station-panel'}
          station={selectedStation}
          theme={theme}
          onClose={() => {
            setSelectedStation(null);
            if (userLocationRef.current?.isMapClick || selectedStation?.isPin || selectedStation?.properties?.name === "Where you're at") {
              setUserLocation(null);
              userLocationRef.current = null;
            }
          }}
          variant={variant}
          onSelectFeederStop={handleSelectBusStop}
          onSelectStation={handleSelectStation}
          userLocation={userLocation}
          isPin={Boolean(
            selectedStation?.isPin ||
            selectedStation?.properties?.isPin ||
            selectedStation?.properties?.name === 'Map Ping' ||
            selectedStation?.properties?.name === "Where you're at"
          )}
        />
      )}

      {/* Bus Line Inspector Card (Variant B & C) */}
      {activeBusLine && (
        <BusLineInspector
          line={activeBusLine}
          liveBuses={LIVE_BUS_TELEMETRY}
          onClose={() => setActiveBusLine(null)}
          onSelectStop={handleSelectBusStop}
        />
      )}

      {/* Bus Stop Board (Variant B & C) */}
      {selectedBusStop && (
        <BusStopBoard
          stop={selectedBusStop}
          theme={theme}
          onClose={() => {
            setSelectedBusStop(null);
            if (userLocationRef.current?.isMapClick) {
              setUserLocation(null);
              userLocationRef.current = null;
            }
          }}
          onSelectLine={(lineId) => {
            const found = EMT_LINES.find(l => l.id.toLowerCase() === String(lineId).toLowerCase());
            if (found) handleSelectBusLine(found);
          }}
        />
      )}

      {rationale && (
        <LocationRationale
          onAllow={() => answerRationale(true)}
          onDecline={() => answerRationale(false)}
        />
      )}

      {/* Feedback & Support Modal */}
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
      />

      {/* What's New Popout Modal */}
      <WhatsNewModal
        isOpen={isWhatsNewOpen}
        onClose={handleCloseWhatsNew}
        onOpenFeedback={handleContactAuthorFromWhatsNew}
      />

      {/* App Download Sheet */}
      {isAppDownloadOpen && (
        <AppDownloadSheet
          ios={typeof navigator !== 'undefined' && isIosDevice(navigator.userAgent, navigator.maxTouchPoints)}
          onClose={() => setIsAppDownloadOpen(false)}
        />
      )}

      {/* About, Legal & Licenses Modal */}
      <AboutModal
        isOpen={isAboutOpen}
        onClose={() => setIsAboutOpen(false)}
        trainStats={trainStats}
      />
    </div>
  );
}

export default App;
