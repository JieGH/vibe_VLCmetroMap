// Centralized rendering & smoothing configuration for metro lines
const lineRenderConfig = {
  // Smoothing parameters applied via Chaikin subdivision
  smoothing: {
    iterations: 2,
    // Real OSM tracks already have true physical curves; no aggressive subdivision needed
    applyTo: []
  },
  // All lines now use authentic OSM physical track geometries from data/valencia_rails.json
  useGTFS: [],
  // Visual offset spacing (pixels) when lines are displayed side-by-side
  offsetSpacing: 4,
  // Tolerance (meters) to consider two geometries as "shared" (no offset)
  sharedToleranceMeters: 12
};

export default lineRenderConfig;
