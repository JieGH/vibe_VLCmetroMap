// `npm run serve`: serves dist/ on the LAN. Port: --port N or PORT, default 8080.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');
if (!fs.existsSync(path.join(root, 'index.html'))) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}

const flag = process.argv.indexOf('--port');
const port = Number((flag > 0 && process.argv[flag + 1]) || process.env.PORT || 8080);
if (!Number.isInteger(port) || port < 0 || port > 65535) {
  console.error('Invalid port.');
  process.exit(1);
}

const lanIp = Object.values(os.networkInterfaces()).flat()
  .find(i => i && i.family === 'IPv4' && !i.internal)?.address;

console.log('Compressing assets...');
const app = createApp({ root });
app.server().listen(port, '0.0.0.0', function () {
  console.log(`Serving dist/ on http://${lanIp || 'localhost'}:${this.address().port}`);
});
