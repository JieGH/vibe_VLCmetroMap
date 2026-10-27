// Guard (#122): prototype dummy data must never come back into production code.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve(__dirname, '..');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.(js|jsx)$/.test(e.name) && !/\.test\.(js|jsx)$/.test(e.name) ? [p] : [];
  });

const files = walk(SRC).map((p) => ({ rel: path.relative(SRC, p), text: fs.readFileSync(p, 'utf8') }));

const offenders = (re) => files.filter((f) => re.test(f.text)).map((f) => f.rel);

describe('no prototype dummy data in production source', () => {
  it('scans a meaningful set of files', () => {
    expect(files.length).toBeGreaterThan(30);
  });

  it('has no Math.random()', () => {
    expect(offenders(/Math\.random\s*\(/)).toEqual([]);
  });

  it("has no hard-coded vehicleId: 'EMT-", () => {
    expect(offenders(/vehicleId:\s*['"`]EMT-/)).toEqual([]);
  });

  it('has no hard-coded arrivals array', () => {
    expect(offenders(/arrivals\s*[:=]\s*\[\s*\{/)).toEqual([]);
    expect(offenders(/:\s*\[\s*\{\s*line:\s*['"][^'"]+['"],\s*destination:/)).toEqual([]);
  });

  it('has no fabricated default lines 19 / C1', () => {
    expect(offenders(/\[\s*'19'\s*,\s*'C1'\s*\]/)).toEqual([]);
  });
});
