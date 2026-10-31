#!/usr/bin/env node
// Refetchable routing input stays in .cache, consistent with ADR-0003.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createReadStream, existsSync } from 'node:fs';
import { createJourneyRouter } from '../../server/journeyRouting.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cache = path.join(root, '.cache/navigation');
const graph = path.join(cache, 'graph');
const version = '2.7.0';
const jar = path.join(cache, `otp-${version}.jar`);
const jarSha1 = 'db8928e73f290378404f8da4a6a027e04f92baba';
const urls = {
  runtime: `https://repo.maven.apache.org/maven2/org/opentripplanner/otp-shaded/${version}/otp-shaded-${version}.jar`,
  rail: 'https://www.metrovalencia.es/google_transit_feed/google_transit.zip',
  streets: 'https://download.geofabrik.de/europe/spain/valencia-latest.osm.pbf',
  emtCatalogue: 'https://opendata.vlci.valencia.es/api/3/action/package_show?id=google-transit-lines-stops-bus-schedules',
};

async function hash(file, algorithm = 'sha256') {
  const digest = createHash(algorithm);
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

async function download(url, destination) {
  const temporary = `${destination}.partial`;
  try {
    console.log(`Downloading ${url}`);
    await run('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '600',
      '--user-agent', 'Mozilla/5.0 Xarxa-local-routing-setup', '--output', temporary, url]);
    await fs.rename(temporary, destination);
  } finally { await fs.rm(temporary, { force: true }); }
}

async function runtime() {
  if (!existsSync(jar) || await hash(jar, 'sha1') !== jarSha1) await download(urls.runtime, jar);
  if (await hash(jar, 'sha1') !== jarSha1) throw new Error('OTP binary differs from Maven Central checksum');
}

async function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', errors = '';
    child.stdout.on('data', value => { output += value; });
    child.stderr.on('data', value => { errors += value; });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(errors || `${command} exited ${code}`)));
  });
}

function csvRows(text) {
  return text.trim().split(/\r?\n/).map(line => line.match(/(?:"(?:[^"]|"")*"|[^,]*)(?:,|$)/g)
    .filter(value => value !== '').map(value => value.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim()));
}

async function calendar(zip) {
  const dates = [];
  const names = (await capture('unzip', ['-Z', '-1', zip])).split(/\r?\n/);
  for (const name of ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt']) {
    if (!names.includes(name)) throw new Error(`GTFS missing ${name}`);
  }
  for (const filename of ['calendar.txt', 'calendar_dates.txt']) {
    if (!names.includes(filename)) continue;
    const [headers, ...rows] = csvRows(await capture('unzip', ['-p', zip, filename]));
    for (const row of rows) {
      const values = Object.fromEntries(headers.map((name, index) => [name, row[index]]));
      if (filename === 'calendar.txt') dates.push(values.start_date, values.end_date);
      else if (values.exception_type === '1') dates.push(values.date);
    }
  }
  const validDates = dates.filter(value => /^\d{8}$/.test(value)).sort();
  if (!validDates.length) throw new Error('GTFS has no usable service calendar');
  return { start: validDates[0], end: validDates.at(-1) };
}

async function prepare() {
  await runtime();
  const streetFile = path.join(cache, 'valencia.osm.pbf');
  if (!existsSync(streetFile)) await download(urls.streets, streetFile);
  const streetLink = path.join(graph, 'valencia.osm.pbf');
  if (!existsSync(streetLink)) await fs.symlink('../valencia.osm.pbf', streetLink);
  const zip = path.join(graph, 'metrovalencia.gtfs.zip');
  const flag = process.argv.indexOf('--rail-dir');
  let source = urls.rail;
  if (flag >= 0) {
    if (!process.argv[flag + 1]) throw new Error('--rail-dir needs a directory');
    const directory = path.resolve(process.argv[flag + 1]);
    const files = (await fs.readdir(directory)).filter(name => name.endsWith('.txt'));
    const temporary = `${zip}.partial.zip`;
    try {
      await fs.rm(temporary, { force: true });
      await run('zip', ['-q', temporary, ...files], { cwd: directory });
      await calendar(temporary);
      await fs.rename(temporary, zip);
    } finally { await fs.rm(temporary, { force: true }); }
    source = `local snapshot: ${path.basename(directory)}`;
  } else {
    const temporary = `${zip}.download.zip`;
    try {
      await download(urls.rail, temporary);
      await calendar(temporary);
      await fs.rename(temporary, zip);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  const manifest = {
    preparedAt: new Date().toISOString(), otpVersion: version,
    rail: { source, sha256: await hash(zip), calendar: await calendar(zip) },
    streets: { source: urls.streets, sha256: await hash(streetFile) },
  };
  const transitFeeds = [{ type: 'gtfs', feedId: 'metrovalencia', source: 'metrovalencia.gtfs.zip' }];
  if (process.argv.includes('--include-emt')) {
    const metadata = JSON.parse(await capture('curl', ['--fail', '--silent', '--show-error', '--location', '--max-time', '30', urls.emtCatalogue]));
    const resource = metadata.result?.resources?.find(item => item.format?.toUpperCase() === 'ZIP');
    const resourceUrl = new URL(resource?.url);
    if (resourceUrl.protocol !== 'https:' || resourceUrl.hostname !== 'opendata.vlci.valencia.es') throw new Error('Unexpected EMT GTFS resource host');
    const emtZip = path.join(graph, 'emt.gtfs.zip');
    const temporary = `${emtZip}.download.zip`;
    try {
      await download(resourceUrl.href, temporary);
      await calendar(temporary);
      await fs.rename(temporary, emtZip);
    } finally { await fs.rm(temporary, { force: true }); }
    manifest.emt = { source: resourceUrl.href, sha256: await hash(emtZip), calendar: await calendar(emtZip) };
    transitFeeds.push({ type: 'gtfs', feedId: 'emt', source: 'emt.gtfs.zip' });
  }
  await fs.writeFile(path.join(graph, 'build-config.json'), `${JSON.stringify({ transitFeeds }, null, 2)}\n`);
  await fs.writeFile(path.join(cache, 'inputs.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify(manifest, null, 2));
  console.log('Inputs prepared. Rebuild the graph before serving changed feeds.');
}

async function java(action) {
  await runtime();
  const javaPath = process.env.OTP_JAVA || (process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, 'bin/java') :
    existsSync('/opt/homebrew/opt/openjdk@21/bin/java') ? '/opt/homebrew/opt/openjdk@21/bin/java' : 'java');
  const heap = process.env.OTP_HEAP || '3G';
  if (!/^[1-4]G$/.test(heap)) throw new Error('OTP_HEAP must be 1G, 2G, 3G, or 4G');
  const args = action === 'build' ? ['--build', '--save', graph] : ['--load', '--bindAddress', '127.0.0.1', '--port', '8801', '--maxThreads', '4', graph];
  await run(javaPath, [`-Xmx${heap}`, '-jar', jar, ...args]);
  if (action === 'build') {
    const inputs = JSON.parse(await fs.readFile(path.join(cache, 'inputs.json'), 'utf8'));
    await fs.writeFile(path.join(cache, 'built.json'), `${JSON.stringify({ ...inputs, builtAt: new Date().toISOString() }, null, 2)}\n`);
  }
}

async function probe() {
  const result = await createJourneyRouter({ otpUrl: 'http://127.0.0.1:8801/otp/gtfs/v1' })({
    from: { name: 'Àngel Guimerà', coordinates: [-0.3843, 39.4695] },
    to: { name: 'Benimaclet', coordinates: [-0.3629, 39.4854] },
    departureTime: new Date().toISOString(),
  });
  await fs.writeFile(path.join(cache, 'probe.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ httpStatus: result.status, status: result.body.status,
    journeys: result.body.journeys?.map(journey => ({ id: journey.id, startTime: journey.startTime,
      endTime: journey.endTime, modes: journey.legs.map(leg => leg.mode) })), error: result.body.error }, null, 2));
  if (result.status !== 200 || !result.body.journeys?.some(journey => journey.legs.some(leg => leg.mode !== 'WALK'))) process.exitCode = 1;
}

await fs.mkdir(graph, { recursive: true });
const action = process.argv[2];
try {
  if (action === 'prepare') await prepare();
  else if (action === 'build' || action === 'serve') await java(action);
  else if (action === 'probe') await probe();
  else {
    console.log('Usage: node scripts/navigation/otp.mjs prepare [--rail-dir PATH] [--include-emt] | build | serve | probe');
    process.exitCode = 1;
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
