// Benchmark React StationPanel rendering vs Direct DOM transform updates during touch drag
import React from 'react';
import { renderToString } from 'react-dom/server';
import StationPanel from '../../../src/components/StationPanel.jsx';
import { I18nProvider } from '../../../src/i18n/I18nContext.jsx';
import arrivalStore from '../../../src/services/arrivalStore.js';

// Setup station data
const station = {
  type: 'Feature',
  properties: {
    id: 1,
    name: 'Colón',
    lines: ['3', '5', '7', '9'],
  },
  geometry: {
    type: 'Point',
    coordinates: [-0.371, 39.469],
  },
};

const now = Date.now();
arrivalStore.memory.set('1', {
  stationId: 1,
  stationName: 'Colón',
  fetchedAt: now - 5000,
  arrivals: [
    { line: '3', destination: 'Rafelbunyol', vehicleId: '3901', targetTimestamp: now + 65000, isLive: true },
    { line: '5', destination: 'Marítim', vehicleId: '4302', targetTimestamp: now + 125000, isLive: true },
    { line: '7', destination: 'Torrent Av.', vehicleId: '4305', targetTimestamp: now + 185000, isLive: true },
    { line: '9', destination: 'Riba-roja', vehicleId: '3910', targetTimestamp: now + 245000, isLive: true },
  ],
});

function benchReactRender(runs = 120) {
  const times = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    renderToString(
      React.createElement(I18nProvider, null,
        React.createElement(StationPanel, {
          station,
          theme: 'dark',
          onClose: () => {},
        })
      )
    );
    times.push(performance.now() - start);
  }
  const sum = times.reduce((a, b) => a + b, 0);
  return {
    runs,
    totalMs: sum.toFixed(2),
    meanMs: (sum / runs).toFixed(4),
    p95Ms: times.sort((a,b)=>a-b)[Math.floor(runs * 0.95)].toFixed(4),
  };
}

function benchDirectDomTransform(runs = 120) {
  // Simulate what direct transform / CSS variable update does
  const mockElement = { style: { transform: '' } };
  const times = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    const offset = i * 0.5;
    mockElement.style.transform = `translateY(${offset}px)`;
    times.push(performance.now() - start);
  }
  const sum = times.reduce((a, b) => a + b, 0);
  return {
    runs,
    totalMs: sum.toFixed(2),
    meanMs: (sum / runs).toFixed(4),
    p95Ms: times.sort((a,b)=>a-b)[Math.floor(runs * 0.95)].toFixed(4),
  };
}

console.log('=== BENCHMARK: 120Hz Touch Drag - React Re-render vs Direct DOM Transform ===\n');
const reactResult = benchReactRender(120);
const domResult = benchDirectDomTransform(120);

console.table([
  { approach: 'React Component Re-render (Current)', ...reactResult },
  { approach: 'Direct DOM Transform / rAF (Optimized)', ...domResult },
]);
