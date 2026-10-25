// Benchmark zoom scaling DOM operations across 144 station markers and 25 vehicle markers
import { performance } from 'perf_hooks';

class MockElement {
  constructor() {
    this.style = {
      visibility: '',
      pointerEvents: '',
      transform: 'scale(1)',
    };
  }
}

function runCurrentZoomScale(stElements, vehElements, zoom, curve) {
  const hide = curve < 0.55;
  const scaleStr = `scale(${curve.toFixed(3)})`;

  // Current: Unconditional style writes on all 144 elements every frame
  for (let i = 0; i < stElements.length; i++) {
    const el = stElements[i];
    if (hide) {
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
    } else {
      el.style.visibility = '';
      el.style.pointerEvents = '';
      el.style.transform = scaleStr;
    }
  }

  for (let i = 0; i < vehElements.length; i++) {
    const el = vehElements[i];
    if (curve < 0.3) {
      el.style.visibility = 'hidden';
      el.style.pointerEvents = 'none';
    } else {
      el.style.visibility = '';
      el.style.pointerEvents = '';
      el.style.transform = scaleStr;
    }
  }
}

function runOptimizedZoomScale(stElements, vehElements, zoom, curve, state) {
  // Optimized:
  // 1. Threshold visibility changes ONLY when boolean state flips (crossing 0.55 or 0.3)
  // 2. Use a CSS variable (--marker-scale) on a single container or class, OR
  //    guarded property assignment so unchanged values are never written to DOM.
  const hideSt = curve < 0.55;
  const hideVeh = curve < 0.3;
  const scaleStr = `scale(${curve.toFixed(3)})`;

  if (state.stHidden !== hideSt) {
    state.stHidden = hideSt;
    const vis = hideSt ? 'hidden' : '';
    const pe = hideSt ? 'none' : '';
    for (let i = 0; i < stElements.length; i++) {
      stElements[i].style.visibility = vis;
      stElements[i].style.pointerEvents = pe;
    }
  }

  if (!hideSt && state.lastScaleStr !== scaleStr) {
    state.lastScaleStr = scaleStr;
    for (let i = 0; i < stElements.length; i++) {
      stElements[i].style.transform = scaleStr;
    }
  }

  if (state.vehHidden !== hideVeh) {
    state.vehHidden = hideVeh;
    const vis = hideVeh ? 'hidden' : '';
    const pe = hideVeh ? 'none' : '';
    for (let i = 0; i < vehElements.length; i++) {
      vehElements[i].style.visibility = vis;
      vehElements[i].style.pointerEvents = pe;
    }
  }

  if (!hideVeh && state.lastVehScaleStr !== scaleStr) {
    state.lastVehScaleStr = scaleStr;
    for (let i = 0; i < vehElements.length; i++) {
      vehElements[i].style.transform = scaleStr;
    }
  }
}

function benchZoomUpdates(runs = 1000) {
  const stElements = Array.from({ length: 144 }, () => new MockElement());
  const vehElements = Array.from({ length: 25 }, () => new MockElement());

  // Benchmark Current
  const startCurrent = performance.now();
  for (let r = 0; r < runs; r++) {
    const zoom = 10 + (r % 60) * 0.1;
    const curve = Math.max(0, Math.min(1.2, (zoom - 7.5) / 4.0));
    runCurrentZoomScale(stElements, vehElements, zoom, curve);
  }
  const totalCurrent = performance.now() - startCurrent;

  // Benchmark Optimized
  const state = { stHidden: false, vehHidden: false, lastScaleStr: '', lastVehScaleStr: '' };
  const startOpt = performance.now();
  for (let r = 0; r < runs; r++) {
    const zoom = 10 + (r % 60) * 0.1;
    const curve = Math.max(0, Math.min(1.2, (zoom - 7.5) / 4.0));
    runOptimizedZoomScale(stElements, vehElements, zoom, curve, state);
  }
  const totalOpt = performance.now() - startOpt;

  return {
    runs,
    currentTotalMs: totalCurrent.toFixed(2),
    currentPerFrameMs: (totalCurrent / runs).toFixed(4),
    optTotalMs: totalOpt.toFixed(2),
    optPerFrameMs: (totalOpt / runs).toFixed(4),
    speedup: (totalCurrent / totalOpt).toFixed(1) + 'x',
  };
}

console.log('=== BENCHMARK: Zoom Scale Operations (144 Stations + 25 Vehicles) ===\n');
console.table([benchZoomUpdates(1000)]);
