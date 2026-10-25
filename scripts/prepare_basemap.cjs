#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const basemapDir = path.join(root, 'public', 'basemap');
const archive = path.join(basemapDir, 'valencia.pmtiles');
const manifest = path.join(basemapDir, 'valencia.pmtiles.json');

// 1. In CI / Cloudflare Workers Builds, fetch basemap if missing
if (process.env.WORKERS_CI) {
  try {
    execFileSync('node', ['scripts/fetch_basemap.cjs'], { stdio: 'inherit', cwd: root });
  } catch (err) {
    console.warn('[prepare_basemap] fetch_basemap failed in CI:', err.message);
  }
}

// 2. If valencia.pmtiles exists, ensure it is split into chunks for web hosting
if (fs.existsSync(archive)) {
  const needsSplit = !fs.existsSync(manifest) || fs.statSync(archive).mtimeMs > fs.statSync(manifest).mtimeMs;
  if (needsSplit) {
    console.log('[prepare_basemap] Splitting valencia.pmtiles into web-friendly chunks...');
    const { split } = require('./split_basemap.cjs');
    // Keep archive for iOS bundle, create chunks for web deploy
    split(false);
  } else {
    console.log('[prepare_basemap] Basemap chunks are already up to date.');
  }
}
