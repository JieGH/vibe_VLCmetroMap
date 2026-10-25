// Benchmark DOM marker updates vs GeoJSON serialization
import { performance } from 'perf_hooks';

// Simulate MapLibre Marker._update logic:
// Projects lng/lat to screen px, then sets element.style.transform
class MockElement {
  constructor() {
    this.style = {};
  }
}

class MockMap {
  project(lnglat) {
    // Mercator projection math (lightweight trigonometry)
    const d = Math.PI / 180;
    const max = 85.0511287798;
    const lat = Math.max(Math.min(max, lnglat[1]), -max);
    const x = 512 * (lnglat[0] + 180) / 360;
    const sin = Math.sin(lat * d);
    const y = 512 * (0.5 - 0.25 * Math.log((1 + sin) / (1 - sin)) / Math.PI);
    return { x: x * 100, y: y * 100 };
  }
}

class MockMarker {
  constructor(map) {
    this.map = map;
    this.element = new MockElement();
    this.lng = 0;
    this.lat = 0;
  }
  setLngLat([lng, lat]) {
    this.lng = lng;
    this.lat = lat;
    const pos = this.map.project([lng, lat]);
    this.element.style.transform = `translate3d(${Math.round(pos.x)}px, ${Math.round(pos.y)}px, 0)`;
  }
}

function benchDomMarkers(count, runs = 1000) {
  const map = new MockMap();
  const markers = Array.from({ length: count }, () => new MockMarker(map));
  
  const start = performance.now();
  for (let r = 0; r < runs; r++) {
    for (let i = 0; i < count; i++) {
      markers[i].setLngLat([-0.375 + i * 0.001, 39.469 + i * 0.001]);
    }
  }
  const total = performance.now() - start;
  return {
    count,
    runs,
    totalMs: total.toFixed(2),
    perFrameMs: (total / runs).toFixed(4),
  };
}

function benchGeoJsonSerialization(count, runs = 1000) {
  const start = performance.now();
  for (let r = 0; r < runs; r++) {
    const features = [];
    for (let i = 0; i < count; i++) {
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [-0.375 + i * 0.001, 39.469 + i * 0.001],
        },
        properties: { id: i, line: '3', bearing: 45 },
      });
    }
    const fc = { type: 'FeatureCollection', features };
    // structuredClone simulates structured cloning done by worker postMessage
    structuredClone(fc);
  }
  const total = performance.now() - start;
  return {
    count,
    runs,
    totalMs: total.toFixed(2),
    perFrameMs: (total / runs).toFixed(4),
  };
}

console.log('=== BENCHMARK: DOM Marker Updates vs GeoJSON Worker Clones (1000 frames) ===\n');
const domResults = [10, 25, 50, 100].map(c => benchDomMarkers(c));
console.log('DOM Markers (Mock transform updates):');
console.table(domResults);

const geoResults = [10, 25, 50, 100].map(c => benchGeoJsonSerialization(c));
console.log('GeoJSON Data Serialization (Worker postMessage overhead):');
console.table(geoResults);
