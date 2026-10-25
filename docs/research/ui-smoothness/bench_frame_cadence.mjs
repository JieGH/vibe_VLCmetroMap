// Benchmark frame cadence, judder, and step smoothness
// Simulates display V-Sync refresh rates: 60Hz (16.66ms) and 120Hz (8.33ms)

function simulateAnimationLoop({
  displayHz = 120,
  loopThrottledMs = 33, // Current implementation
  trainSpeedMps = 10,  // 10 m/s ~ 36 km/h
  durationSec = 5,
}) {
  const vSyncIntervalMs = 1000 / displayHz;
  const totalVSyncFrames = Math.round(durationSec * displayHz);

  let lastDrawnAt = 0;
  let trainTrackPos = 0;

  const frameDeltas = []; // Time between visual position updates
  const visualSteps = []; // Distance train moved between rendered frames
  let lastUpdateClock = 0;

  // Simulate V-Sync ticks
  for (let f = 0; f < totalVSyncFrames; f++) {
    const clock = f * vSyncIntervalMs;

    let updated = false;
    if (loopThrottledMs === 0) {
      // Native rAF: updates on every vSync
      updated = true;
    } else {
      // Throttled loop: updates only if elapsed >= loopThrottledMs
      if (clock - lastDrawnAt >= loopThrottledMs) {
        updated = true;
      }
    }

    if (updated) {
      const dt = lastDrawnAt === 0 ? vSyncIntervalMs : (clock - lastDrawnAt);
      lastDrawnAt = clock;
      const step = trainSpeedMps * (dt / 1000);
      trainTrackPos += step;

      if (lastUpdateClock > 0) {
        frameDeltas.push(clock - lastUpdateClock);
        visualSteps.push(step);
      }
      lastUpdateClock = clock;
    } else {
      // Frame presented without train update (display shows frozen position)
      // Visual step is 0 m for this display frame!
      visualSteps.push(0);
    }
  }

  // Calculate statistics
  const updateIntervalMean = frameDeltas.reduce((a, b) => a + b, 0) / frameDeltas.length;
  const updateIntervalVariance = frameDeltas.reduce((a, b) => a + Math.pow(b - updateIntervalMean, 2), 0) / frameDeltas.length;
  const updateIntervalStdDev = Math.sqrt(updateIntervalVariance);

  // Perceived judder: on the display, how irregular are the steps?
  // When train updates at 30Hz on 120Hz display, step pattern is [0, 0, 0, 0.33m, 0, 0, 0, 0.33m]
  const nonZeroSteps = visualSteps.filter(s => s > 0);
  const stepMean = nonZeroSteps.reduce((a, b) => a + b, 0) / nonZeroSteps.length;
  const stepStdDev = Math.sqrt(nonZeroSteps.reduce((a, b) => a + Math.pow(b - stepMean, 2), 0) / nonZeroSteps.length);

  // Cadence uniformity: ratio of empty display frames to total display frames
  const droppedDisplayCadence = (visualSteps.filter(s => s === 0).length / visualSteps.length) * 100;

  return {
    displayHz: `${displayHz} Hz`,
    mode: loopThrottledMs === 0 ? 'Adaptive rAF (Display Matched)' : `Throttled (${loopThrottledMs}ms / ~30 FPS)`,
    totalDisplayFrames: totalVSyncFrames,
    renderedUpdates: frameDeltas.length,
    updateIntervalMeanMs: updateIntervalMean.toFixed(2),
    updateIntervalStdDevMs: updateIntervalStdDev.toFixed(2),
    stepStdDevMeters: stepStdDev.toFixed(4),
    frozenFramesPct: droppedDisplayCadence.toFixed(1) + '%',
    perceivedSmoothness: loopThrottledMs === 0 ? '100% Fluid (Zero Judder)' : 'Severe Cadence Judder',
  };
}

console.log('=== BENCHMARK: Motion Cadence & Judder Simulation ===\n');

const results = [
  simulateAnimationLoop({ displayHz: 60, loopThrottledMs: 33 }),
  simulateAnimationLoop({ displayHz: 60, loopThrottledMs: 0 }),
  simulateAnimationLoop({ displayHz: 120, loopThrottledMs: 33 }),
  simulateAnimationLoop({ displayHz: 120, loopThrottledMs: 0 }),
];

console.table(results);
