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
import React, { useEffect, useState } from 'react';
import { Navigation, NavigationOff, LoaderCircle } from 'lucide-react';
import { LANDSCAPE_BREAKPOINT_PX } from '../utils/layout';

const LABELS = {
  idle: 'Centre on me and show my nearest station',
  locating: 'Finding your location…',
  unavailable: 'Location is unavailable — tap for details',
};

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

const LocateButton = ({ state = 'idle', lifted = false, onLocate }) => {
  const clearance = usePanelClearance(lifted);
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
      onClick={onLocate}
      title={LABELS[state] || LABELS.idle}
      aria-label={LABELS[state] || LABELS.idle}
    >
      <Icon size={20} className={state === 'locating' ? 'spin' : undefined} />
    </button>
  );
};

export default LocateButton;
