#!/usr/bin/env node
// Fetches the offline basemap: a PMTiles extract of the Valencia region plus
// the glyphs and sprites its style needs.
//
// The app is a Metrovalencia map and nothing else, so the basemap it needs is
// one region rather than a planet — small enough to ship with the app and read
// from disk with no network at all. On the web the same archive is read by HTTP
// range request, so a visitor downloads the few tiles they look at rather than
// the whole file.
//
// Like the GTFS Feed (ADR-0003), this is refetchable input rather than
// committed data: 34 MB of binary does not belong in git history. The app falls
// back to online raster tiles when it is absent, so a fresh clone still shows a
// map — just one that stops resolving past zoom 16.
//
//   npm run fetch:basemap

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');

// The network's own bounding box is lon -0.590..-0.326, lat 39.084..39.623.
// Padded so panning off the end of a line does not run off the edge of the map.
const BBOX = '-0.65,39.02,-0.25,39.68';

// BASEMAP_MAXZOOM caps the archive's deepest zoom. Cloudflare Workers assets allow 25 MiB per file, and the
// full archive is 36 MB; 14 is 15 MB and MapLibre overzooms vector tiles sharply past it (docs/hosting-cloudflare.md).
// Workers Builds sets WORKERS_CI, so a Cloudflare build is capped without any dashboard variable.
const MAXZOOM = Number(process.env.BASEMAP_MAXZOOM) || (process.env.WORKERS_CI ? 14 : null);
const MIN_BYTES = MAXZOOM ? 5_000_000 : 10_000_000;

const PMTILES_VERSION = '1.31.2';
const ASSETS = 'https://protomaps.github.io/basemaps-assets';

// Latin plus the punctuation range. Valencian and Spanish place names live
// entirely in the first two; the third carries the dashes and quotes labels use.
const FONTSTACKS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'];
const RANGES = ['0-255', '256-511', '8192-8447'];

// One sprite per theme the app builds a style for — see THEME_FLAVOURS in MapView.
const SPRITES = ['white', 'dark'];

const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'public', 'basemap');
// Store in node_modules/.cache so CI (Netlify) persists the CLI and extracted
// basemap across builds instead of re-walking the 100 GB remote archive every push.
const cacheDir = path.join(root, 'node_modules', '.cache', 'metrovalencia-basemap');

const download = async (url, destination) => {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} for ${url}`);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
      return fs.statSync(destination).size;
    } catch (err) {
      if (attempt >= 3) throw err;
    }
  }
};

// Protomaps publishes a build a day. Today's may not exist yet depending on the
// hour, so walk back until we find up to 3 recent candidate builds.
const findRecentBuilds = async (maxCandidates = 3) => {
  const candidates = [];
  for (let daysBack = 0; daysBack < 21 && candidates.length < maxCandidates; daysBack++) {
    const day = new Date(Date.now() - daysBack * 86400000);
    const stamp = day.toISOString().slice(0, 10).replace(/-/g, '');
    const url = `https://build.protomaps.com/${stamp}.pmtiles`;
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) candidates.push(url);
    } catch {
      // ignore transient HEAD failure
    }
  }
  if (candidates.length === 0) {
    throw new Error('No Protomaps daily build found in the last 21 days');
  }
  return candidates;
};

// The extract is a range-request walk over a 100 GB remote archive, which is
// the Go tool's job rather than something worth reimplementing here.
const ensurePmtilesCli = async () => {
  const cached = path.join(cacheDir, 'pmtiles');
  if (fs.existsSync(cached)) return cached;

  const isDarwin = os.platform() === 'darwin';
  const platform = isDarwin ? 'Darwin' : 'Linux';
  const arch = os.arch() === 'arm64' ? 'arm64' : 'x86_64';
  // Darwin assets are hyphenated zips; Linux assets are underscored tarballs.
  const asset = isDarwin
    ? `go-pmtiles-${PMTILES_VERSION}_${platform}_${arch}.zip`
    : `go-pmtiles_${PMTILES_VERSION}_${platform}_${arch}.tar.gz`;
  const url = `https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_VERSION}/${asset}`;

  console.log(`  fetching the pmtiles CLI (${platform}/${arch})`);
  const archive = path.join(cacheDir, asset);
  await download(url, archive);
  if (isDarwin) {
    execFileSync('unzip', ['-o', '-q', archive, 'pmtiles', '-d', cacheDir]);
  } else {
    execFileSync('tar', ['-xzf', archive, '-C', cacheDir, 'pmtiles']);
  }
  fs.chmodSync(cached, 0o755);
  fs.unlinkSync(archive);
  return cached;
};

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} MB`;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  const archive = path.join(outDir, 'valencia.pmtiles');
  const cachedArchive = path.join(cacheDir, MAXZOOM ? `valencia-z${MAXZOOM}.pmtiles` : 'valencia.pmtiles');

  if (fs.existsSync(archive) && fs.statSync(archive).size > MIN_BYTES) {
    console.log(`  reusing existing ${path.relative(root, archive)} — ${mb(fs.statSync(archive).size)}`);
  } else if (fs.existsSync(cachedArchive) && fs.statSync(cachedArchive).size > MIN_BYTES) {
    fs.copyFileSync(cachedArchive, archive);
    console.log(`  restored cached ${path.relative(root, archive)} — ${mb(fs.statSync(archive).size)}`);
  } else {
    const cli = await ensurePmtilesCli();
    const builds = await findRecentBuilds(3);
    let extracted = false;
    let lastError = null;
    for (const build of builds) {
      try {
        console.log(`Extracting ${BBOX} from ${build}`);
        execFileSync(cli, ['extract', build, archive, `--bbox=${BBOX}`, ...(MAXZOOM ? [`--maxzoom=${MAXZOOM}`] : [])], { stdio: 'inherit' });
        if (fs.existsSync(archive) && fs.statSync(archive).size > MIN_BYTES) {
          fs.copyFileSync(archive, cachedArchive);
          extracted = true;
          break;
        }
      } catch (err) {
        lastError = err;
        try { fs.unlinkSync(archive); } catch { /* ignore */ }
      }
    }
    if (!extracted) throw lastError || new Error('pmtiles extract failed');
    if (process.env.WORKERS_CI && fs.statSync(archive).size >= 25 * 1048576) {
      throw new Error(`basemap is ${mb(fs.statSync(archive).size)}; Workers assets allow 25 MiB per file. Lower BASEMAP_MAXZOOM.`);
    }
    console.log(`  ${path.relative(root, archive)} — ${mb(fs.statSync(archive).size)}`);
  }

  let glyphBytes = 0;
  for (const fontstack of FONTSTACKS) {
    for (const range of RANGES) {
      const dest = path.join(outDir, 'fonts', fontstack, `${range}.pbf`);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        glyphBytes += fs.statSync(dest).size;
      } else {
        glyphBytes += await download(
          `${ASSETS}/fonts/${encodeURIComponent(fontstack)}/${range}.pbf`,
          dest
        );
      }
    }
  }
  console.log(`  fonts — ${mb(glyphBytes)} across ${FONTSTACKS.length * RANGES.length} files`);

  let spriteBytes = 0;
  for (const sprite of SPRITES) {
    for (const extension of ['json', 'png']) {
      const dest = path.join(outDir, 'sprites', `${sprite}.${extension}`);
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        spriteBytes += fs.statSync(dest).size;
      } else {
        spriteBytes += await download(
          `${ASSETS}/sprites/v4/${sprite}.${extension}`,
          dest
        );
      }
    }
  }
  console.log(`  sprites — ${mb(spriteBytes)}`);
  console.log('Done. `npm run build` then `npx cap sync ios` puts it in the app.');
})().catch((error) => {
  console.error(`fetch:basemap failed — ${error.message}`);
  if (process.env.CI) {
    console.warn('Continuing CI build without offline PMTiles archive (app will fall back to online raster tiles).');
    process.exit(0);
  }
  process.exit(1);
});
