// Downloads the current Metrovalencia GTFS feed into a dated directory.
//
// A GTFS feed carries a service calendar with an expiry. The feed bundled here
// on 2026-07-28 had already lapsed on 2026-08-30, which meant its timetable
// listed no trips for the current day, and it predated line 5 and 7 returning
// to service east of Alameda. Refetching is the cure for both, so it is one
// command rather than a manual download.
//
// Usage: npm run fetch:gtfs

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const FEED_URL = 'https://www.metrovalencia.es/google_transit_feed/google_transit.zip';
const projectRoot = path.resolve(__dirname, '..');

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_` +
  `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

const tmpZip = path.join(projectRoot, '.gtfs_download.zip');
const tmpDir = path.join(projectRoot, '.gtfs_download');

const cleanup = () => {
  fs.rmSync(tmpZip, { force: true });
  fs.rmSync(tmpDir, { recursive: true, force: true });
};

try {
  console.log(`Fetching ${FEED_URL}`);
  execFileSync('curl', ['-sSL', '--max-time', '180', '-o', tmpZip, FEED_URL], { stdio: 'inherit' });

  fs.rmSync(tmpDir, { recursive: true, force: true });
  execFileSync('unzip', ['-q', '-o', tmpZip, '-d', tmpDir]);

  const stops = path.join(tmpDir, 'stops.txt');
  if (!fs.existsSync(stops)) throw new Error('Download did not contain stops.txt');

  // Name the directory after the feed's own export time, not the download
  // time, so refetching an unchanged feed does not create a duplicate.
  const exported = fs.statSync(stops).mtime;
  const target = path.join(projectRoot, `${stamp(exported)}_Metro_Valencia`);

  if (fs.existsSync(target)) {
    console.log(`Already have this feed: ${path.basename(target)}`);
  } else {
    fs.renameSync(tmpDir, target);
    console.log(`Wrote ${path.basename(target)}`);
  }

  const dates = fs.readFileSync(path.join(target, 'calendar_dates.txt'), 'utf8')
    .trim().split('\n').slice(1)
    .map(line => line.split(',')[1])
    .filter(Boolean)
    .sort();
  console.log(`  service calendar ${dates[0]} → ${dates[dates.length - 1]}`);
  console.log(`  ${fs.readFileSync(path.join(target, 'stops.txt'), 'utf8').trim().split('\n').length - 1} stops`);
  console.log('\nNow run: npm run build:stations && npm run build:segments');
} catch (error) {
  console.error(`Failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  cleanup();
}
