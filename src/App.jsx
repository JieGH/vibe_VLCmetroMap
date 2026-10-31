import React, { useState, useEffect, useRef, lazy, Suspense } from 'react';
// Early preload: initiates MapView bundle fetch immediately on module evaluation
const mapViewPromise = import('./components/MapView');
// A chunk that 404s after a deploy reloads once to pick up the new build; the pending promise keeps the
// splash up meanwhile. If the reload was already tried, the error reaches the ErrorBoundary.
const MapView = lazy(() =>
  mapViewPromise.catch((err) => {
    if (isChunkLoadError(err) && reloadOnceForNewBuild()) return new Promise(() => {});
    throw err;
  }),
);
import Sidebar from './components/Sidebar';
import SearchBar from './components/SearchBar';
import DestinationPreview from './components/DestinationPreview';
import JourneyPlanner from './components/JourneyPlanner';
import JourneyProgress from './components/JourneyProgress';
import JourneyArrivals from './components/JourneyArrivals';
import { createJourneySession } from './services/journeySession';
import journeyNative from './services/journeyNative';
import { createJourneyRecovery } from './services/journeyRecovery';
import StationPanel from './components/StationPanel';
import DashboardBoard from './components/DashboardBoard';
import AboutModal from './components/AboutModal';
import LocateButton from './components/LocateButton';
import HubChips from './components/HubChips';
import WelcomeScreen from './components/WelcomeScreen';
import { AppDownloadSheet } from './components/AppDownloadBanner';
import { isIosDevice } from './utils/appDownload';
import FeedbackModal from './components/FeedbackModal';
import WhatsNewModal from './components/WhatsNewModal';
import { markWhatsNewSeen } from './utils/whatsNew';
import MovedNotice from './components/MovedNotice';
import { locate, findNearestStation, NEAREST_STATION_RANGE_M } from './services/userLocation';
import { createLiveTracker, createLiveFixChannel } from './services/liveTracking';
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
import { getWindowScreenPreset, getInitialSidebarOpen, getPresetFontSize } from './utils/screenPreset';
import { getStoredFontSize, setStoredFontSize, applyFontSize } from './utils/fontSize';
import { useTranslation } from './i18n';
import { Search, X } from 'lucide-react';
import AppBadge from './components/AppBadge';
import setupInputScrollDragPrevention from './utils/preventInputScrollDrag';
import { isChunkLoadError, reloadOnceForNewBuild, setupChunkErrorRecovery } from './utils/chunkReload';
import { startRegionCheck } from './services/regionCheck';
import { useNetworkNotice } from './services/useNetworkNotice';
import { setupIncidentReporting, reportNormalUserVisit, reportStationAccess, reportApiTrouble } from './utils/telemetry';
import { watchApiTrouble } from './services/apiTroubleWatch';
import { isCentrePinActive, shouldLeaveCentreMode } from './utils/centrePin';
import { isHubStation, captureReturnContext, resolveReturn, reconcileReturnContext, buildGpsHub, shouldRefreshGpsHub, stationPanelKey } from './utils/returnContext';
import BusLineInspector from './components/BusLineInspector';
import BusStopBoard from './components/BusStopBoard';
import { getRealBusLines } from './data/emtData';
import './index.css';

// How long a locate's answer stays on screen. Long enough to read a refusal,
// short enough that it is gone before it becomes furniture.
const LOCATE_NOTICE_MS = 6000;

// How long the floating walking box stays before it hides itself.

// Dashboard mode is bookmarkable so an unattended tablet can boot straight into
// it, and reachable from a button so it is discoverable from the map.
const readMode = () =>
  new URLSearchParams(window.location.search).get('mode') === 'dashboard' ? 'dashboard' : 'map';

function App() {
  const { t } = useTranslation();
  const android = isAndroid();
  // The animated splash covers initial loading on web and iOS while MapView and train arrivals
  // initialize in the background, smoothly fading out once the map is ready. Skipped on Android
  // because the OS system window splash already covers it.
  const [showWelcome, setShowWelcome] = useState(() => !android);
  const [mapReady, setMapReady] = useState(false);
  // Same default on every platform: Auto, following the OS dark/light setting until the viewer picks Light or Dark.
  const [theme, setTheme] = useState(() => initialTheme(true));
  const [themeMode, setThemeMode] = useState('system');
  const [rationale, setRationale] = useState(null);
  const [mode, setMode] = useState(readMode);
  const [activeBusLine, setActiveBusLine] = useState(null);
  const [selectedBusStop, setSelectedBusStop] = useState(null);
  const selectedBusStopRef = useRef(null);
  selectedBusStopRef.current = selectedBusStop;
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    getInitialSidebarOpen(getWindowScreenPreset(), { isNative: Capacitor.isNativePlatform() }),
  );
  const [isSearchOpen, setIsSearchOpen] = useState(false);
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
  const latestGpsFixRef = useRef(null);
  const [planningStartingPoint, setPlanningStartingPoint] = useState(null);
  useEffect(() => {
    if (userLocation?.status === 'located' && !userLocation.isMapClick) latestGpsFixRef.current = userLocation;
  }, [userLocation]);
  // Destination is independent of the GPS fix and the existing nearby-transit pin.
  const [destination, setDestination] = useState(null);
  const [planningDestination, setPlanningDestination] = useState(null);
  const [journeySnapshot, setJourneySnapshot] = useState(null);
  const [journeyRecovery] = useState(() => createJourneyRecovery());
  const [savedJourney, setSavedJourney] = useState(() => journeyRecovery.load());
  const [offline, setOffline] = useState(() => navigator.onLine === false);
  const [resumingJourney, setResumingJourney] = useState(false);
  const startingJourneyRef = useRef(false);
  const webAlertAudioRef = useRef(null);
  const [journeySession] = useState(() => createJourneySession({
    nativeAdapter: journeyNative,
    onChange: setJourneySnapshot,
    onAlert: () => {
      if (Capacitor.isNativePlatform()) return;
      navigator.vibrate?.([250, 120, 250]);
      const audio = webAlertAudioRef.current;
      if (audio?.state === 'running') {
        const tone = audio.createOscillator();
        const gain = audio.createGain();
        gain.gain.setValueAtTime(0.12, audio.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.35);
        tone.frequency.value = 880;
        tone.connect(gain).connect(audio.destination);
        tone.start();
        tone.stop(audio.currentTime + 0.35);
      }
    },
  }));
  const activeJourney = journeySnapshot?.status === 'active' ? journeySnapshot.journey : null;
  useEffect(() => () => journeySession.dispose(), [journeySession]);
  useEffect(() => journeySession.subscribe(snapshot => { journeyRecovery.save(snapshot); }), [journeySession, journeyRecovery]);
  useEffect(() => {
    const update = () => setOffline(navigator.onLine === false);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);
  const journeyLabels = () => ({
      journeyTitle: t('navigation.journeyTitle'),
      alightNext: t('navigation.alightNext'),
      estimatedAlightNext: t('navigation.estimatedAlightNext'),
  });
  const prepareWebAlerts = (soundEnabled) => {
    if (Capacitor.isNativePlatform()) return;
    void webAlertAudioRef.current?.close();
    webAlertAudioRef.current = null;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (soundEnabled && Audio) {
      try {
        webAlertAudioRef.current = new Audio();
        void webAlertAudioRef.current.resume().catch(() => {});
      } catch { /* Visual guidance remains available if sound is unsupported. */ }
    }
  };
  const startJourney = async (journey, { soundEnabled = false } = {}) => {
    if (startingJourneyRef.current) return;
    startingJourneyRef.current = true;
    prepareWebAlerts(soundEnabled);
    try {
      if (Capacitor.isNativePlatform()) await journeyNative.requestPermissions();
      journeySession.start(journey, { soundEnabled, labels: journeyLabels() });
      setSavedJourney(null);
      setPlanningDestination(null);
      if (!userLocation?.coordinates || userLocation.isMapClick) void handleLocate();
    } finally { startingJourneyRef.current = false; }
  };
  const resumeJourney = async () => {
    if (resumingJourney || !savedJourney) return;
    setResumingJourney(true);
    prepareWebAlerts(savedJourney.soundEnabled);
    try {
      const fix = await locate();
      if (fix.status === 'located') {
        latestGpsFixRef.current = fix;
        setUserLocation(fix);
      }
      if (Capacitor.isNativePlatform()) await journeyNative.requestPermissions();
      await journeySession.resume(savedJourney, { labels: journeyLabels() });
      if (fix.status === 'located') journeySession.updateLocation(fix);
      setDestination(savedJourney.journey.to);
      setSavedJourney(null);
    } catch {
      // Corrupt/incompatible stored sessions are discarded, never presented as active.
      journeyRecovery.clear();
      setSavedJourney(null);
    } finally { setResumingJourney(false); }
  };
  const discardSavedJourney = () => {
    if (savedJourney?.sessionId) void journeyNative.stopSession({ sessionId: savedJourney.sessionId });
    journeyRecovery.clear();
    setSavedJourney(null);
  };
  const endJourney = (completed = false) => {
    if (completed) journeySession.complete();
    else journeySession.cancel();
    prepareWebAlerts(false);
    setDestination(null);
    setPlanningDestination(null);
  };
  const selectDestination = (place) => {
    setDestination(place);
    setPlanningDestination(null);
    setIsSearchOpen(false);
    setFollowing(false);
  };
  const openDirections = (place) => {
    const fix = latestGpsFixRef.current;
    const fresh = fix && Date.now() - (fix.updatedAt ?? fix.fetchedAt ?? 0) < 60_000;
    setPlanningStartingPoint(fresh ? { name: t('navigation.useCurrentLocation'), coordinates: fix.coordinates } : null);
    setDestination(place);
    setPlanningDestination(place);
    setFollowing(false);
  };
  const navigationOpen = Boolean(destination || planningDestination || activeJourney || savedJourney);
  const [locateState, setLocateState] = useState('idle');
  const [locateNotice, setLocateNotice] = useState(null);
  // The Station the floating walking box points at; null hides the box. The
  // distance is not stored: the box recomputes it from the latest fix.
  const userLocationRef = useRef(null);
  useEffect(() => {
    userLocationRef.current = userLocation;
  }, [userLocation]);
  // Live tracking (#104, ADR-0012). Per-fix positions travel on a channel straight to the map marker, so a fix
  // every few seconds never re-renders the app; only the larger-movement anchor below updates React state.
  const liveFixChannelRef = useRef(null);
  if (!liveFixChannelRef.current) liveFixChannelRef.current = createLiveFixChannel();
  useEffect(() => liveFixChannelRef.current.subscribe(fix => {
    latestGpsFixRef.current = { ...fix, status: 'located' };
    journeySession.updateLocation(fix);
  }), [journeySession]);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return undefined;
    let handle;
    let disposed = false;
    CapApp.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void journeySession.reconcileNative();
    }).then(listener => { if (disposed) void listener.remove(); else handle = listener; });
    return () => { disposed = true; void handle?.remove(); };
  }, [journeySession]);
  const liveTrackerRef = useRef(null);
  // True while the camera follows the dot; broken by a manual pan or by choosing a stop, restored by locate.
  const [following, setFollowing] = useState(false);
  // Centre-pin mode (#135): entered by a locate press or a map tap; while on, a manual pan moves the pin to the map centre.
  // `{ fix }` (the GPS fix the dot stays at; null for a map tap without GPS) while on, null otherwise.
  const [centre, setCentre] = useState(null);
  const centreMode = Boolean(centre);
  const centreModeRef = useRef(false);
  centreModeRef.current = centreMode;
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

  // The train API refusing this network (VPN, blocked IP) after repeated
  // evidence, #123. Dismissing hides it until a good answer clears the state and
  // a new refusal follows.
  const [trainRefused, setTrainRefused] = useState(() => arrivalStore.isApiRefused());
  const [refusalDismissed, setRefusalDismissed] = useState(false);
  const networkNotice = useNetworkNotice();
  const networkNoticeText = networkNotice ? t(`app.${networkNotice}Notice`) : '';
  const [regionDismissed, setRegionDismissed] = useState(false);
  // A notice that comes back (VPN switched on again) or changes kind is news again, even if an earlier one was dismissed.
  useEffect(() => { setRegionDismissed(false); }, [networkNotice]);
  useEffect(() => { startRegionCheck(); }, []);
  useEffect(() => arrivalStore.subscribe(() => {
    const refused = arrivalStore.isApiRefused();
    setTrainRefused(refused);
    if (!refused) setRefusalDismissed(false);
  }), []);

  // Set up incident reporting and report normal human user access to Telegram
  useEffect(() => {
    setupIncidentReporting();
    setupChunkErrorRecovery();
    // Telegram alert when EMT or FGV starts refusing this client (#144).
    const stopApiWatch = watchApiTrouble({ report: reportApiTrouble });
    const timer = setTimeout(() => {
      const initialStation = selectedStationRef.current?.properties?.name || selectedStationRef.current?.name;
      reportNormalUserVisit({ station: initialStation });
    }, 2000);
    return () => { clearTimeout(timer); stopApiWatch(); };
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

  // The split-view hub a stop/station was opened from; closing that view
  // returns to it (#105). Any other way of selecting something clears it.
  const returnCtxRef = useRef(null);
  // State twin of the ref, so effects (centre-mode exit) derive from state rather than reading the ref.
  const [hasReturnContext, setHasReturnContext] = useState(false);
  const setReturnCtx = (ctx) => {
    returnCtxRef.current = ctx;
    setHasReturnContext(Boolean(ctx));
  };

  // Drop the context once what it was opened from is no longer what is showing.
  useEffect(() => {
    setReturnCtx(reconcileReturnContext(returnCtxRef.current, { selectedStation, selectedBusStop, activeBusLine }));
  }, [selectedStation, selectedBusStop, activeBusLine]);

  const openBusStop = (busStop, ctx) => {
    setReturnCtx(ctx || null);
    setSelectedBusStop(busStop);
    if (busStop) {
      setSelectedStation(null);
      if (!ctx && userLocationRef.current?.isMapClick) {
        setUserLocation(null);
        userLocationRef.current = null;
      }
    }
  };

  // Map markers and the bus line inspector: closing goes back to the map.
  const handleSelectBusStop = (busStop) => openBusStop(busStop, null);
  // Tapped inside the split view: remember the hub.
  const handleSelectBusStopFromHub = (busStop) =>
    openBusStop(busStop, busStop ? captureReturnContext({ selectedStation, userLocation }) : null);

  // Leave the stop/station view: back to the remembered hub, else the map.
  const restoreReturnContext = () => {
    const back = resolveReturn(returnCtxRef.current, userLocationRef.current);
    setReturnCtx(null);
    if (!back) return false;
    setSelectedStation(back.selectedStation);
    setUserLocation(back.userLocation);
    userLocationRef.current = back.userLocation;
    return true;
  };

  const [fontSize, setFontSize] = useState(() =>
    getStoredFontSize(
      getPresetFontSize(getWindowScreenPreset(), { isNative: Capacitor.isNativePlatform() }),
    ),
  );
  useEffect(() => {
    applyFontSize(fontSize);
  }, [fontSize]);

  const handleSelectFontSize = (newSize) => {
    setFontSize(newSize);
    setStoredFontSize(newSize);
  };

  // Auto follows the OS dark/light setting on every platform and is the default.
  // Picking Light or Dark (sidebar or top-bar toggle) stops following.
  const applyTheme = (next) => {
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#1D1D29' : '#f0f2f5');
  };
  useEffect(() => {
    if (themeMode !== 'system') return undefined;
    const sync = () => applyTheme(initialTheme(true));
    sync();
    // The change event can be missed while the app is in the background; re-read on return.
    const onVisible = () => { if (document.visibilityState === 'visible') sync(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', sync);
    const unwatch = watchSystemTheme(applyTheme);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', sync);
      unwatch();
    };
  }, [themeMode]);

  const handleSelectTheme = (mode) => {
    setThemeMode(mode);
    if (mode !== 'system') applyTheme(mode);
  };

  // Station click — opens the multimodal hub card with walking metrics
  const handleSelectStation = (station, options = {}, ctx = null) => {
    autoLocatorRef.current?.interrupt();
    setReturnCtx(ctx);
    setSelectedStation(station);
    if (!station) {
      if (userLocationRef.current?.isMapClick || userLocationRef.current?.status === 'located') {
        setUserLocation(null);
        userLocationRef.current = null;
      }
    } else {
      setSelectedBusStop(null);
    }
    // A map tap (Map Ping) enters centre mode without needing a GPS fix (no blue dot to keep); the centre pin's
    // own republish (options.centrePin) leaves it as it is.
    if (options.userLocation?.isMapClick && !options.centrePin) setCentre((prev) => prev || { fix: null });
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

    const stName = station?.properties?.name || station?.name;
    if (stName) {
      reportStationAccess(stName, {
        lines: station?.properties?.lines,
        zone: station?.properties?.zona || station?.properties?.zone,
      });
    }
  };

  // Tapped inside the split view: a real metro station remembers the hub.
  const handleSelectStationFromHub = (station, options = {}) =>
    handleSelectStation(
      station,
      options,
      station && !isHubStation(station) ? captureReturnContext({ selectedStation, userLocation }) : null
    );

  // Toggle sidebar menu. Opening the menu exits active station focus
  // so the menu has clear visibility without panel collision.
  const handleToggleSidebar = () => {
    setIsSidebarOpen((prev) => {
      const next = !prev;
      if (next && selectedStationRef.current) {
        setSelectedStation(null);
        // The pin belongs to the sheet it opened: hiding the sheet removes it too.
        if (userLocationRef.current?.isMapClick) {
          setUserLocation(null);
          userLocationRef.current = null;
        }
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

  // A locate press enters centre-pin mode (#135), keeping the fix so the blue dot stays where it was.
  const enterCentreMode = (fix) => setCentre({ fix });

  // Applies a User Location fix to the state. Does not displace a Station
  // the viewer has chosen manually while a background refinement was in flight.
  const applyUserLocation = (fix, updateStation = true) => {
    setUserLocation(fix);
    userLocationRef.current = fix;
    if (fix.status === 'located' && fix.coordinates) {
      // A fresh fix resets the live dot and (re)starts following and tracking from it.
      liveFixChannelRef.current.publish(null);
      liveTrackerRef.current.start({ coordinates: fix.coordinates, accuracy: fix.accuracy });
      setFollowing(true);
    }
    if (fix.nearestStation) {
      // The multimodal hub answers a successful fix; the notice is for errors only.
    } else {
      setLocateNotice({ text: describeLocateResult(fix), _ts: Date.now() });
    }
    if (updateStation) {
      const targetStation = fix.coordinates
        ? buildGpsHub(fix)
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
          enterCentreMode(interim);
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
      enterCentreMode(result);
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
    latestGpsFixRef.current = null;
    if (!userLocation) return;
    setUserLocation(null);
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
        // The launch fix behaves like a locate press: the first drag turns the hub into the centre pin.
        if (fix.status === 'located' && fix.coordinates) enterCentreMode(fix);
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

  // Live tracking: once located, follow the viewer while the app is visible. The tracker (liveTracking.js) owns
  // cadence, gating and pausing; this wires its three outputs. Per fix: the dot only. Past ANCHOR_RECOMPUTE_M:
  // the nearest station, the walk-radius nodes and the "Where you're at" hub (all driven by `userLocation`,
  // whose `fetchedAt` is kept so the camera is not re-framed). No EMT request is made from here (ADR-0011).
  const describeRef = useRef(null);
  describeRef.current = describeLocateResult;
  if (!liveTrackerRef.current) {
    liveTrackerRef.current = createLiveTracker({
      onFix: (fix) => {
        liveFixChannelRef.current.publish(fix);
      },
      onAnchor: (fix) => {
        const nearest = findNearestStation(fix.coordinates);
        const inRange = nearest && nearest.distance <= NEAREST_STATION_RANGE_M;
        const prev = userLocationRef.current;
        if (!prev || prev.status !== 'located' || prev.isMapClick) return;
        const next = {
          ...prev,
          coordinates: fix.coordinates,
          accuracy: fix.accuracy,
          updatedAt: fix.updatedAt,
          nearestStation: inRange ? nearest.station : null,
          distance: inRange ? nearest.distance : null,
        };
        userLocationRef.current = next;
        setUserLocation(next);
        // Refresh the GPS hub (geometry, nearest station) in place; fetchedAt is untouched so the camera is not
        // re-framed. Only when the hub itself is showing; a stop opened from it is refreshed on return.
        if (shouldRefreshGpsHub({ selectedStation: selectedStationRef.current, selectedBusStop: selectedBusStopRef.current, centreMode: centreModeRef.current })) {
          setSelectedStation(buildGpsHub(next));
        }
      },
      onError: (status) => {
        // Permission revoked or GPS lost: stop quietly, say why once through the existing notice.
        setFollowing(false);
        setLocateNotice({ text: describeRef.current({ status }), _ts: Date.now() });
      },
    });
  }
  useEffect(() => {
    const tracker = liveTrackerRef.current;
    let handle = null;
    let cleaned = false;
    if (Capacitor.isNativePlatform()) {
      Promise.resolve(CapApp.addListener('appStateChange', ({ isActive }) => tracker.setForeground(isActive)))
        .then((h) => {
          handle = h;
          if (cleaned) h?.remove?.(); // cleanup ran before the listener registered
        })
        .catch(() => {});
    }
    return () => {
      cleaned = true;
      tracker.stop();
      handle?.remove?.();
    };
  }, []);
  // Every way of ending the located state (hold-to-hide, closing the hub, dismissing GPS mode, dropping a ping)
  // clears `userLocation`; tracking ends with it.
  const liveEligible = Boolean(userLocation) && userLocation.status === 'located' && !userLocation.isMapClick;
  useEffect(() => {
    if (!liveEligible) {
      liveTrackerRef.current.stop();
      liveFixChannelRef.current.publish(null);
      setFollowing(false);
    }
  }, [liveEligible]);
  // Centre mode ends with the hub it belongs to (closed, hidden, GPS mode dismissed, or a station chosen from the map).
  useEffect(() => {
    if (shouldLeaveCentreMode({
      centreMode,
      userLocation,
      selectedStation,
      selectedBusStop,
      hasReturnContext,
    })) {
      setCentre(null);
    }
  }, [centreMode, userLocation, selectedStation, selectedBusStop, hasReturnContext]);
  const centrePinActive = isCentrePinActive({ centreMode, selectedStation, selectedBusStop });
  // The GPS dot stays where the fix was while the pin (a Map Ping) has taken over `userLocation`.
  const gpsFix = centrePinActive && userLocation?.isMapClick ? centre?.fix ?? null : null;
  // Choosing a station or bus stop is the viewer steering the camera elsewhere (#95): stop following.
  useEffect(() => {
    if (selectedBusStop || (selectedStation && !isHubStation(selectedStation))) setFollowing(false);
  }, [selectedStation, selectedBusStop]);

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
    searchOpen: isSearchOpen,
    feedbackOpen: isFeedbackOpen,
    whatsNewOpen: isWhatsNewOpen,
    downloadOpen: isAppDownloadOpen,
    aboutOpen: isAboutOpen,
    welcomeVisible: showWelcome,
    dashboardMode: mode === 'dashboard',
    sidebarOpen: isSidebarOpen,
    busStopOpen: Boolean(selectedBusStop),
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
        st.searchOpen || (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'))
      );
      switch (resolveBackAction({ ...st, rationaleOpen: Boolean(st.rationale), searchFocused })) {
        case 'decline-rationale': st.rationale.resolve(false); setRationale(null); break;
        case 'close-feedback': setIsFeedbackOpen(false); break;
        case 'close-whats-new': handleCloseWhatsNew(); break;
        case 'close-download': setIsAppDownloadOpen(false); break;
        case 'close-about': setIsAboutOpen(false); break;
        case 'dismiss-welcome': setShowWelcome(false); break;
        case 'exit-dashboard': selectModeRef.current('map'); break;
        case 'close-search': active?.blur?.(); setIsSearchOpen(false); break;
        case 'close-sidebar': setIsSidebarOpen(false); break;
        case 'close-bus-stop': setSelectedBusStop(null); restoreReturnContext(); break;
        case 'close-station': if (!restoreReturnContext()) setSelectedStation(null); break;
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
          destination={destination}
          navigationReady={mapReady}
          journey={activeJourney}
          onReady={() => setMapReady(true)}
          onUserInteract={() => { autoLocatorRef.current?.interrupt(); setFollowing(false); }}
          liveFixChannel={liveFixChannelRef.current}
          following={following}
          centrePinActive={centrePinActive}
          gpsFix={gpsFix}
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

      {/* Top Navigation Bar: Sidebar Toggle Button + Search Toggle Button */}
      <div className={`top-bar-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
        <button
          onClick={handleToggleSidebar}
          className="sidebar-toggle-btn glass-panel"
          title={isSidebarOpen ? t('app.closeSidebar') : t('app.openSidebar')}
          aria-label={isSidebarOpen ? t('app.closeSidebar') : t('app.openSidebar')}
        >
          <AppBadge size={40} bare />
        </button>
        <button
          type="button"
          onClick={() => setIsSearchOpen((prev) => !prev)}
          className={`search-toggle-btn glass-panel ${isSearchOpen ? 'active' : ''}`}
          title={t('searchBar.ariaLabel')}
          aria-label={t('searchBar.ariaLabel')}
          aria-expanded={isSearchOpen}
        >
          <Search size={22} />
        </button>
      </div>

      {/* Search Overlay Modal */}
      {isSearchOpen && (
        <div className="search-overlay" role="dialog" aria-modal="true" aria-label={t('searchBar.ariaLabel')}>
          <div className="search-backdrop" onClick={() => setIsSearchOpen(false)} />
          <div
            className="search-bar-container glass-panel"
            style={{ padding: '8px 14px', display: 'flex', gap: '10px', alignItems: 'center' }}
          >
            <SearchBar
              autoFocus
              onSelectStation={handleSelectStation}
              onSelectLine={handleSelectLine}
              activeLineFilter={activeLineFilter}
              selectedStation={selectedStation}
              onSelectBusLine={handleSelectBusLine}
              onSelectBusStop={handleSelectBusStop}
              onSelectDestination={selectDestination}
              locationCoordinates={!userLocation?.isMapClick ? userLocation?.coordinates : null}
              onClose={() => setIsSearchOpen(false)}
            />
            <button
              type="button"
              onClick={() => setIsSearchOpen(false)}
              className="search-close-btn"
              title={t('searchBar.closeTitle')}
              aria-label={t('searchBar.closeTitle')}
            >
              <X size={20} />
            </button>
          </div>
        </div>
      )}


      {/* On a retired address (Netlify, workers.dev): ask the visitor to move to xarxa.net */}
      {!showWelcome && <MovedNotice />}

      {/* One dismissible chip per active Line filter */}
      {!isSearchOpen && !searchFocused && activeLineFilter.length > 0 && (
        <div className={`hub-chips-container ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
          <HubChips
            activeLines={activeLineFilter}
            onClearLine={handleSelectLine}
          />
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

      {networkNotice && !regionDismissed && (
        <button
          className={`region-notice ${networkNotice === 'outsideSpain' ? '' : 'region-notice-network'}`}
          role="status"
          onClick={() => setRegionDismissed(true)}
          title={t('app.dismissTitle')}
          aria-label={networkNoticeText}
        >
          {networkNoticeText}
        </button>
      )}

      {trainRefused && !refusalDismissed && (
        <button
          className="locate-notice refusal-notice glass-panel"
          role="status"
          onClick={() => setRefusalDismissed(true)}
          title={t('app.trainApiRefusedLong')}
          aria-label={t('app.trainApiRefusedLong')}
        >
          {t('app.trainApiRefused')}
        </button>
      )}

      {/* One column, bottom right: the walking box above the locate button,
          lifted over the sheet in portrait and set beside it in landscape */}
      <div
        className="bottom-stack"
        data-sheet={sheetBox ? (sheetBox.landscape ? 'landscape' : 'portrait') : 'none'}
        style={sheetBox && !sheetBox.landscape ? { '--sheet-lift': `${sheetBox.height + 12}px` } : undefined}
      >
        <LocateButton
          state={locateState}
          showingLocation={Boolean(userLocation)}
          onLocate={handleLocate}
          onHide={handleHideLocation}
        />
      </div>

      {/* Station Focus panel — right in landscape, bottom in portrait */}
      {selectedStation && !navigationOpen && (
        <StationPanel
          key={stationPanelKey(selectedStation)}
          station={selectedStation}
          theme={theme}
          onClose={() => {
            if (returnCtxRef.current && !isHubStation(selectedStation) && restoreReturnContext()) return;
            setReturnCtx(null);
            setSelectedStation(null);
            if (userLocationRef.current?.isMapClick || selectedStation?.isPin || selectedStation?.properties?.name === "Where you're at") {
              setUserLocation(null);
              userLocationRef.current = null;
            }
          }}
          onSelectFeederStop={handleSelectBusStopFromHub}
          onSelectStation={handleSelectStationFromHub}
          onDirections={!isHubStation(selectedStation) && !selectedStation.isPin ? () => openDirections({
            id: `station:${selectedStation.properties?.name}`,
            name: selectedStation.properties?.name,
            coordinates: selectedStation.geometry.coordinates,
            source: 'station',
          }) : null}
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
      {activeBusLine && !navigationOpen && (
        <BusLineInspector
          line={activeBusLine}
          onClose={() => setActiveBusLine(null)}
          onSelectStop={handleSelectBusStop}
        />
      )}

      {/* Bus Stop Board (Variant B & C) */}
      {selectedBusStop && !navigationOpen && (
        <BusStopBoard
          stop={selectedBusStop}
          theme={theme}
          onClose={() => {
            setSelectedBusStop(null);
            if (restoreReturnContext()) return;
            if (userLocationRef.current?.isMapClick) {
              setUserLocation(null);
              userLocationRef.current = null;
            }
          }}
          onSelectLine={(lineId) => {
            const found = getRealBusLines().find(l => l.id.toLowerCase() === String(lineId).toLowerCase());
            if (found) handleSelectBusLine(found);
          }}
        />
      )}

      {destination && !planningDestination && !activeJourney && (
        <DestinationPreview destination={destination} onDirections={openDirections} onClose={() => setDestination(null)} />
      )}

      {planningDestination && (
        <JourneyPlanner
          key={planningDestination.id || planningDestination.name}
          destination={planningDestination}
          initialStartingPoint={planningStartingPoint}
          onStartJourney={startJourney}
          onClose={() => setPlanningDestination(null)}
        />
      )}

      {activeJourney && !planningDestination && (
        <JourneyProgress
          snapshot={journeySnapshot}
          onConfirmBoarding={journeySession.confirmBoarding}
          onCorrectCall={journeySession.correctCall}
          onAdvanceLeg={journeySession.advanceLeg}
          onComplete={() => endJourney(true)}
          onCancel={() => endJourney(false)}
          offline={offline}
          onFindAnotherRoute={() => openDirections(activeJourney.to)}
        >
          <JourneyArrivals journey={activeJourney} legIndex={journeySnapshot.legIndex} callIndex={journeySnapshot.callIndex} />
        </JourneyProgress>
      )}

      {savedJourney && !activeJourney && !planningDestination && !destination && (
        <section className="journey-planner glass-panel" aria-label={t('navigation.resumeJourney')}>
          <h2>{t('navigation.resumeJourney')}</h2>
          <p>{savedJourney.journey.to?.name}</p>
          <p className="journey-muted">{t(offline ? 'navigation.offlineInstructions' : 'navigation.resumeRefresh')}</p>
          <button type="button" className="journey-primary-action" disabled={resumingJourney} onClick={() => void resumeJourney()}>
            {t(resumingJourney ? 'navigation.resumingJourney' : 'navigation.resumeJourney')}
          </button>
          <button type="button" className="journey-secondary-action" onClick={discardSavedJourney}>{t('navigation.discardJourney')}</button>
        </section>
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
