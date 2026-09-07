// The locate button.
//
// One press, four states. It reports the press and renders what it is told;
// the fix itself belongs to `userLocation`, and what to do with the answer
// belongs to App.
//
// Bottom-right rather than in the search bar's control row, because "centre on
// me" is a camera control and belongs with the map — and because on a phone it
// is the only control here you press one-handed. The `lifted` flag moves it
// clear of the docked Station panel; index.css owns which direction that is,
// since only the stylesheet knows which dock the panel is currently in.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigation, NavigationOff, LoaderCircle } from 'lucide-react';
import { LANDSCAPE_BREAKPOINT_PX } from '../utils/layout';

const LABELS = {
  idle: 'Centre on me and show my nearest station',
  locating: 'Finding your location…',
  unavailable: 'Location is unavailable — tap for details',
};

// Advertised on the button itself once there is a dot to remove, because a
// long press is invisible otherwise — nothing on screen suggests holding is
// worth trying.
const HIDE_HINT = ' — hold to hide your location';

// Long enough not to fire on a slow tap, short enough not to feel like the
// button has stopped responding. The platform convention on both iOS and
// Android is around half a second.
const LONG_PRESS_MS = 500;

// How far the pointer may drift before the hold is treated as abandoned.
// Distance rather than pointerleave, because a touch pointer is implicitly
// captured by the element it went down on: slide a finger off the button and
// no leave event ever arrives, only the eventual pointerup. Watching how far
// it has moved is the only thing that catches that — and it also catches the
// press that turned into a drag of the map.
const LONG_PRESS_SLOP_PX = 10;

// How far to step to clear the docked panel, measured from the panel itself.
// index.css falls back to the bottom sheet's full 58vh cap, but the panel
// renders well short of that whenever its arrivals table is short, and a button
// hovering a hand's width above it reads as misplaced rather than deferential.
// MapView measures the same element, for the same reason.
const usePanelClearance = (lifted) => {
  const [clearance, setClearance] = useState(null);

  useEffect(() => {
    if (!lifted) {
      setClearance(null);
      return undefined;
    }

    const measure = () => {
      const panel = document.querySelector('.station-panel');
      if (!panel) return setClearance(null);
      const rect = panel.getBoundingClientRect();
      // Landscape docks the panel right, so there the clearance is horizontal.
      return setClearance(
        window.innerWidth >= LANDSCAPE_BREAKPOINT_PX
          ? { right: Math.round(window.innerWidth - rect.left + 16) }
          : { bottom: Math.round(window.innerHeight - rect.top + 16) }
      );
    };

    measure();
    // The panel's height moves with its contents — an arrival dropping off the
    // table shortens it — so measuring once at open time is not enough.
    const panel = document.querySelector('.station-panel');
    const observer = panel && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(measure)
      : null;
    if (observer) observer.observe(panel);
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
    };
  }, [lifted]);

  return clearance;
};

const LocateButton = ({ state = 'idle', lifted = false, showingLocation = false, onLocate, onHide }) => {
  const clearance = usePanelClearance(lifted);
  const pressTimer = useRef(null);
  const pressOrigin = useRef(null);
  // Set when the hold has already acted, so the click that follows releasing
  // the finger does not then go and re-locate — which would undo the hide in
  // the same gesture that asked for it.
  const longPressActed = useRef(false);

  const cancelPress = useCallback(() => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressOrigin.current = null;
  }, []);

  const beginPress = useCallback((event) => {
    if (state === 'locating' || !showingLocation) return;
    longPressActed.current = false;
    cancelPress();
    pressOrigin.current = { x: event.clientX, y: event.clientY };
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      longPressActed.current = true;
      onHide();
    }, LONG_PRESS_MS);
  }, [state, showingLocation, cancelPress, onHide]);

  const trackPress = useCallback((event) => {
    if (!pressOrigin.current) return;
    const dx = event.clientX - pressOrigin.current.x;
    const dy = event.clientY - pressOrigin.current.y;
    if (Math.hypot(dx, dy) > LONG_PRESS_SLOP_PX) cancelPress();
  }, [cancelPress]);

  const handleClick = useCallback(() => {
    if (longPressActed.current) {
      longPressActed.current = false;
      return;
    }
    onLocate();
  }, [onLocate]);

  useEffect(() => cancelPress, [cancelPress]);

  const label = (LABELS[state] || LABELS.idle) + (showingLocation ? HIDE_HINT : '');
  const Icon = state === 'locating'
    ? LoaderCircle
    : state === 'unavailable' ? NavigationOff : Navigation;

  return (
    <button
      type="button"
      className="locate-button glass-panel"
      data-state={state}
      data-lifted={lifted ? 'true' : 'false'}
      style={clearance
        ? (clearance.bottom !== undefined
          ? { bottom: `calc(${clearance.bottom}px + env(safe-area-inset-bottom, 0px))` }
          : { right: `${clearance.right}px` })
        : undefined}
      // A press while a fix is already in flight is ignored rather than queued:
      // the spinner already says what is happening, and a second fix would
      // land on top of the first for no gain.
      disabled={state === 'locating'}
      onClick={handleClick}
      // Pointer events rather than touch or mouse ones, so the same handful of
      // handlers covers finger, mouse and stylus. Every way the press can end
      // has to cancel the timer, or the hide fires for a gesture the viewer had
      // already abandoned — including the finger sliding off, which on touch
      // shows up as movement rather than as a leave.
      onPointerDown={beginPress}
      onPointerMove={trackPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      onPointerCancel={cancelPress}
      // iOS raises its own callout on a long press, which would cover the map
      // and swallow the gesture.
      onContextMenu={(event) => event.preventDefault()}
      title={label}
      aria-label={label}
    >
      <Icon size={20} className={state === 'locating' ? 'spin' : undefined} />
    </button>
  );
};

export default LocateButton;
