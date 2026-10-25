#!/usr/bin/env node
// Cuts public/basemap/valencia.pmtiles into fixed-size parts (valencia.pmtiles.p0, .p1, ...) and writes
// valencia.pmtiles.json describing them. Hosts that cannot answer HTTP Range requests (Cloudflare Workers
// static assets) read the basemap through src/utils/chunkedSource.js instead. fetch_basemap.cjs runs this on
// Workers Builds; run it by hand with `node scripts/split_basemap.cjs` to try the chunked path locally.
//
// With --only-parts (what Workers Builds uses) the whole archive is deleted afterwards, so the deploy carries
// the data once.

const fs = require('node:fs');
const path = require('node:path');

const CHUNK_SIZE = 512 * 1024;
const dir = path.resolve(__dirname, '..', 'public', 'basemap');
const archive = path.join(dir, 'valencia.pmtiles');

const split = (removeArchive) => {
  const size = fs.statSync(archive).size;
  const parts = Math.ceil(size / CHUNK_SIZE);
  const fd = fs.openSync(archive, 'r');
  const buffer = Buffer.alloc(CHUNK_SIZE);
  for (let i = 0; i < parts; i++) {
    const read = fs.readSync(fd, buffer, 0, CHUNK_SIZE, i * CHUNK_SIZE);
    fs.writeFileSync(path.join(dir, `valencia.pmtiles.p${i}`), buffer.subarray(0, read));
  }
  fs.closeSync(fd);
  fs.writeFileSync(path.join(dir, 'valencia.pmtiles.json'), JSON.stringify({ size, chunkSize: CHUNK_SIZE, parts }));
  if (removeArchive) fs.unlinkSync(archive);
  console.log(`  basemap split into ${parts} parts of ${CHUNK_SIZE / 1024} KiB${removeArchive ? ' (archive removed)' : ''}`);
};

module.exports = { split };

if (require.main === module) split(process.argv.includes('--only-parts'));
