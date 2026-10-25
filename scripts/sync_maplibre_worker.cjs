#!/usr/bin/env node
/**
 * Automatically synchronizes MapLibre GL worker bundle from node_modules
 * to public/vendor/maplibre/maplibre-gl-worker.mjs.
 * This guarantees the worker protocol never desynchronizes from the installed package version.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC_WORKER = path.resolve(__dirname, '../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs');
const DEST_DIR = path.resolve(__dirname, '../public/vendor/maplibre');
const DEST_WORKER = path.join(DEST_DIR, 'maplibre-gl-worker.mjs');

function hashFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function sync() {
  if (!fs.existsSync(SRC_WORKER)) {
    console.warn('[sync_maplibre_worker] Warning: node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs not found.');
    return;
  }

  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
  }

  const srcHash = hashFile(SRC_WORKER);
  const destHash = hashFile(DEST_WORKER);

  if (srcHash !== destHash) {
    fs.copyFileSync(SRC_WORKER, DEST_WORKER);
    const sizeKb = (fs.statSync(DEST_WORKER).size / 1024).toFixed(1);
    console.log(`[sync_maplibre_worker] Synced maplibre-gl worker (${sizeKb} KB) to public/vendor/maplibre/`);
  } else {
    console.log('[sync_maplibre_worker] MapLibre worker bundle is already up to date.');
  }
}

sync();
