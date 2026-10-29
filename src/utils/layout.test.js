import { describe, it, expect } from 'vitest';
import { lineViewFrame } from './layout';

describe('lineViewFrame', () => {
  it('phone portrait: full width gutters, no sidebar offset, sidebar covers when open', () => {
    const f = lineViewFrame({ viewportW: 390, sidebarOpen: true });
    expect(f).toMatchObject({ left: 12, width: 366, top: 76, sidebarCovers: true });
    expect(lineViewFrame({ viewportW: 390 }).sidebarCovers).toBe(false);
  });
  it('desktop with the docked sidebar starts right of it and clears the right rail', () => {
    const f = lineViewFrame({ viewportW: 1280, sidebarOpen: true });
    expect(f.left).toBe(360);
    expect(f.left + f.width).toBeLessThanOrEqual(1280 - Math.round(1280 * 0.34) - 28);
    expect(f.sidebarCovers).toBe(false);
  });
  it('wide desktop uses the roomier sidebar and chips push the top down', () => {
    expect(lineViewFrame({ viewportW: 1800, sidebarOpen: true }).left).toBe(460);
    expect(lineViewFrame({ viewportW: 1800, chipsShown: true }).top).toBe(120);
  });
});
