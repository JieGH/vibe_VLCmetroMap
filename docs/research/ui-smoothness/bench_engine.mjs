import engine from '../../../src/services/trainPositionEngine.js';
import arrivalStore from '../../../src/services/arrivalStore.js';

// Setup realistic network sightings
function setupSightings(vehicleCount) {
  arrivalStore.memory.clear();
  engine.renderState.clear();

  const lines = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];
  const stations = [
    'Colón', 'Xàtiva', 'Àngel Guimerà', 'Benimaclet', 'Marítim',
    'Alameda', 'Empalme', 'Bétera', 'Torrent Avinguda', 'Aeroport',
    'Rafelbunyol', 'Platja Malva-rosa', 'Dr. Lluch', 'Vicent Andrés Estellés',
    'Tossal del Rei', 'Natzaret', 'Plaça Espanya', 'Amistat', 'Ayora'
  ];

  const now = Date.now();
  let vId = 1000;

  for (let i = 0; i < vehicleCount; i++) {
    const line = lines[i % lines.length];
    const stName = stations[i % stations.length];
    const dest = stations[(i + 5) % stations.length];
    const vehicleId = String(vId++);
    const key = `st-${i}`;

    arrivalStore.memory.set(key, {
      stationId: i,
      stationName: stName,
      fetchedAt: now - (i % 30) * 1000,
      arrivals: [{
        line,
        destination: dest,
        vehicleId,
        targetTimestamp: now + (30 + (i * 17) % 600) * 1000,
        isLive: true,
      }],
    });
  }
}

function runBenchmark(vehicleCount, frameRate = 120, durationSec = 5) {
  setupSightings(vehicleCount);
  const now = Date.now();
  const dtMs = 1000 / frameRate;
  const totalFrames = Math.round(durationSec * frameRate);

  // Warmup
  for (let f = 0; f < 50; f++) {
    const t = now + f * dtMs;
    const vehicles = engine.getLiveVehiclesFromMemory(t);
    for (let i = 0; i < vehicles.length; i++) {
      engine.smoothVehicle(vehicles[i], t);
    }
  }

  const times = [];
  let t = now;

  for (let f = 0; f < totalFrames; f++) {
    t += dtMs;
    const start = performance.now();
    const vehicles = engine.getLiveVehiclesFromMemory(t);
    for (let i = 0; i < vehicles.length; i++) {
      engine.smoothVehicle(vehicles[i], t);
    }
    const elapsed = performance.now() - start;
    times.push(elapsed);
  }

  times.sort((a, b) => a - b);
  const sum = times.reduce((acc, v) => acc + v, 0);
  const mean = sum / times.length;
  const p50 = times[Math.floor(times.length * 0.50)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const max = times[times.length - 1];

  const budgetMs = 1000 / frameRate;
  const frameBudgetPercent = (mean / budgetMs) * 100;
  const droppedFrames = times.filter(t => t > budgetMs).length;

  return {
    vehicleCount,
    frameRate,
    totalFrames,
    budgetMs: budgetMs.toFixed(2),
    meanMs: mean.toFixed(4),
    p50Ms: p50.toFixed(4),
    p95Ms: p95.toFixed(4),
    p99Ms: p99.toFixed(4),
    maxMs: max.toFixed(4),
    frameBudgetPercent: frameBudgetPercent.toFixed(2) + '%',
    droppedFrames,
  };
}

console.log('=== BENCHMARK: TrainPositionEngine Calculation at 60 FPS & 120 FPS ===\n');
const results = [];
for (const vCount of [10, 25, 50, 100]) {
  results.push(runBenchmark(vCount, 60, 3));
  results.push(runBenchmark(vCount, 120, 3));
}

console.table(results);
