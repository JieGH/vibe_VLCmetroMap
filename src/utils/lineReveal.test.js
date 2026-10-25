import { describe, it, expect } from 'vitest';
import { lineRanks, allowedRank, REVEAL_MAJOR, REVEAL_MID, REVEAL_MINOR } from './lineReveal';

const st = (name, lonIdx, ...lines) => ({
  geometry: { coordinates: [-0.4 + lonIdx * 0.0116, 39.47] },
  properties: { name, lines },
});
// Nine stations 1 km apart on line 1; the middle one is also on line 3.
const line = Array.from({ length: 9 }, (_, i) => st(`s${i}`, i, '1', ...(i === 4 ? ['3'] : [])));

describe('lineRanks', () => {
  it('makes the ends and interchanges major', () => {
    const r = lineRanks(line, ['1']);
    expect(r.get(line[0])).toBe(REVEAL_MAJOR);
    expect(r.get(line[8])).toBe(REVEAL_MAJOR);
    expect(r.get(line[4])).toBe(REVEAL_MAJOR);
  });
  it('ranks only stations on the filtered line', () => {
    const other = st('x', 30, '9');
    expect(lineRanks([...line, other], ['1']).has(other)).toBe(false);
  });
  it('fills the biggest gaps first, half mid and half minor', () => {
    const r = lineRanks(line, ['1']);
    expect(r.get(line[2])).toBe(REVEAL_MID);
    expect(r.get(line[6])).toBe(REVEAL_MID);
    expect([...r.values()].filter((v) => v === REVEAL_MID)).toHaveLength(3);
    expect([...r.values()].filter((v) => v === REVEAL_MINOR)).toHaveLength(3);
  });
});

describe('allowedRank', () => {
  it('reveals more ranks as the map zooms in', () => {
    expect(allowedRank(7)).toBe(-1);
    expect(allowedRank(9)).toBe(0);
    expect(allowedRank(11.5)).toBe(1);
    expect(allowedRank(13)).toBe(2);
  });
});
