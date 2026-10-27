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
    useRef: (v) => ({ current: v }),
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

  const texts = (node) =>
    findAll(node, () => true)
      .flatMap((e) => (Array.isArray(e.props.children) ? e.props.children : [e.props.children]))
      .filter((c) => typeof c === 'string');

  it('compact metro card: prime mark, no dots, short due label, slim 16px badges', () => {
    const nearbyMetro = [
      { feature: { properties: { name: 'A' } }, name: 'A', lines: ['3'], arrivals: [
        { line: '3', destination: 'X', seconds: 120 },
        { line: '3', destination: 'Y', seconds: 10, isLive: true },
      ] },
    ];
    const tree = CompactMetroSection({ isPinMode: true, nearbyMetro, compact: true });
    const t = texts(tree);
    expect(t).toContain('′');
    expect(t).not.toContain('common.min');
    expect(t).toContain('common.dueShort');
    expect(t).not.toContain('common.due');
    expect(findAll(tree, (e) => e.props.className === 'station-arriving-dot pulse')).toHaveLength(0);
    expect(findAll(tree, (e) => e.props.title === 'Live FGV Telemetry')).toHaveLength(0);
    const rowBadges = findAll(tree, (e) => e.props.style?.fontSize === '0.60rem' && e.props.style?.border);
    expect(rowBadges.length).toBeGreaterThan(0);
  });

  it('non-compact metro card keeps min and full due label', () => {
    const nearbyMetro = [
      { feature: { properties: { name: 'A' } }, name: 'A', lines: ['3'], arrivals: [
        { line: '3', destination: 'X', seconds: 120 },
        { line: '3', destination: 'Y', seconds: 10 },
      ] },
    ];
    const t = texts(CompactMetroSection({ isPinMode: true, nearbyMetro }));
    expect(t).toContain('common.min');
    expect(t).toContain('common.due');
    expect(t).not.toContain('′');
  });

  it('compact bus card: prime mark, short due, two-line stop code, no live dot', () => {
    const feeders = [{ stopCode: '2309', stopName: 'S', arrivals: [
      { line: '1', destination: 'D', dueSeconds: 120, isLive: true },
      { line: '2', destination: 'D', dueSeconds: 5 },
    ] }];
    const tree = ConnectingBusSection({ feeders, compact: true });
    const t = texts(tree);
    expect(t).toContain('′');
    expect(t).toContain('common.dueShort');
    expect(t).toContain('P-');
    expect(t).toContain('2309');
    expect(t).not.toContain('P-2309');
    expect(findAll(tree, (e) => e.props.title === 'Live GPS AVL Telemetry')).toHaveLength(0);
    const full = texts(ConnectingBusSection({ feeders }));
    expect(full).toContain('common.min');
    expect(full).toContain('common.due');
    expect(full).toContain('P-2309');
  });
});
