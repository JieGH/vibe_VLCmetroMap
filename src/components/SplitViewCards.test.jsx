import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import ConnectingBusSection from './ConnectingBusSection';
import CompactMetroSection from './CompactMetroSection';

// No DOM environment here, so hooks are stubbed and the returned element tree is walked directly.
vi.mock('../i18n', () => ({ useTranslation: () => ({ t: (k) => k }) }));
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal();
  const useState = (init) => [typeof init === 'function' ? init() : init, () => {}];
  return {
    ...actual,
    default: { ...actual, useState },
    useState,
    useEffect: () => {},
    useMemo: (fn) => fn(),
  };
});

function findAll(node, pred, out = []) {
  if (Array.isArray(node)) {
    node.forEach((n) => findAll(n, pred, out));
  } else if (node && typeof node === 'object' && node.props) {
    if (pred(node)) out.push(node);
    findAll(node.props.children, pred, out);
  }
  return out;
}

const bus = (n) =>
  Array.from({ length: n }, (_, i) => ({ line: String(i + 1), destination: `D${i}`, dueSeconds: 60 * (i + 1) }));
const train = (n) =>
  Array.from({ length: n }, (_, i) => ({ line: '3', destination: `T${i}`, seconds: 60 * (i + 1) }));

describe('split-view cards', () => {
  it('bus card shows at most 3 arrivals and opens the stop on tap anywhere', () => {
    const onSelect = vi.fn();
    const feeders = [
      { stopCode: '2206', stopName: 'Plaça Amèrica', arrivals: bus(6) },
      { stopCode: '2277', stopName: 'Small', arrivals: bus(2) },
    ];
    const tree = ConnectingBusSection({ feeders, onSelectFeederStop: onSelect });
    const cards = findAll(tree, (e) => e.props['data-testid'] === 'feeder-card');
    expect(cards).toHaveLength(2);
    const rows = (card) => findAll(card, (e) => e.props.style?.padding === '3px 4px').length;
    expect(rows(cards[0])).toBe(3);
    expect(rows(cards[1])).toBe(2);
    cards[0].props.onClick();
    expect(onSelect).toHaveBeenCalledWith(feeders[0]);
  });

  it('metro card shows at most 3 arrivals and opens the station on tap anywhere', () => {
    const onSelect = vi.fn();
    const feature = { properties: { name: 'Àngel Guimerà' } };
    const nearbyMetro = [
      { feature, name: 'Àngel Guimerà', lines: ['3'], arrivals: train(6) },
      { feature: { properties: { name: 'Xàtiva' } }, name: 'Xàtiva', lines: ['3'], arrivals: train(2) },
    ];
    const tree = CompactMetroSection({ isPinMode: true, nearbyMetro, onSelectStation: onSelect });
    const cards = findAll(tree, (e) => e.props['data-testid'] === 'metro-card');
    expect(cards).toHaveLength(2);
    const rows = (card) => findAll(card, (e) => e.props.style?.padding === '3px 4px').length;
    expect(rows(cards[0])).toBe(3);
    expect(rows(cards[1])).toBe(2);
    cards[0].props.onClick();
    expect(onSelect).toHaveBeenCalledWith(feature);
  });
});
