import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, vi } from 'vitest';
import { getLine19Route, pointAtAlongM } from '../utils/busRoute';

const live = { current: null };
vi.mock('../services/useBusFleet', () => ({ useLiveBus: () => live.current }));
import LiveBusSheet from './LiveBusSheet';

const dir = getLine19Route().directions[0];
const bus = (alongM) => ({
  id: 'bus-1', linea: '19', trayecto: dir.trayecto, directionKey: dir.id, alongM,
  snappedLonLat: pointAtAlongM(dir, alongM).lonLat, fixTimeMs: Date.now() - 12000,
});

describe('LiveBusSheet', () => {
  it('shows direction and stops away to the selected stop', () => {
    live.current = bus(500);
    const html = renderToStaticMarkup(
      <LiveBusSheet busId="bus-1" stopCode={dir.stops[5].stopCode} stopName="Regne de València - Peris i Valero" onClose={() => {}} />
    );
    expect(html).toContain('Towards La Malva-rosa');
    expect(html).toContain('3 stops away');
    expect(html).toContain('from Regne de València - Peris i Valero');
    expect(html).toContain('aria-label="Line 19 bus towards La Malva-rosa"');
    expect(html).toContain('aria-label="Close bus details"');
    expect(html).toMatch(/Position 1[0-9] s ago/);
  });
  it('without a selected stop shows the next stop', () => {
    live.current = bus(500);
    const html = renderToStaticMarkup(<LiveBusSheet busId="bus-1" stopCode={null} onClose={() => {}} />);
    expect(html).toContain('Towards La Malva-rosa');
    expect(html).toContain(`Next: ${dir.stops[2].stopName}`);
    expect(html).not.toContain('stops away');
  });
  it('renders nothing once the bus is gone', () => {
    live.current = null;
    expect(renderToStaticMarkup(<LiveBusSheet busId="bus-1" onClose={() => {}} />)).toBe('');
  });
});
