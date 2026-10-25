import { describe, it, expect } from 'vitest';
import { resolveBackAction } from './androidBack';

describe('resolveBackAction', () => {
  it('exits when nothing is open', () => {
    expect(resolveBackAction({})).toBe('exit');
    expect(resolveBackAction()).toBe('exit');
  });
  it('closes each layer on its own', () => {
    expect(resolveBackAction({ rationaleOpen: true })).toBe('decline-rationale');
    expect(resolveBackAction({ feedbackOpen: true })).toBe('close-feedback');
    expect(resolveBackAction({ whatsNewOpen: true })).toBe('close-whats-new');
    expect(resolveBackAction({ downloadOpen: true })).toBe('close-download');
    expect(resolveBackAction({ dashboardMode: true })).toBe('exit-dashboard');
    expect(resolveBackAction({ aboutOpen: true })).toBe('close-about');
    expect(resolveBackAction({ welcomeVisible: true })).toBe('dismiss-welcome');
    expect(resolveBackAction({ searchFocused: true })).toBe('close-search');
    expect(resolveBackAction({ sidebarOpen: true })).toBe('close-sidebar');
    expect(resolveBackAction({ stationOpen: true })).toBe('close-station');
    expect(resolveBackAction({ lineFilterActive: true })).toBe('clear-filter');
  });
  it('picks the top-most layer when several are open', () => {
    const all = {
      rationaleOpen: true, feedbackOpen: true, whatsNewOpen: true, downloadOpen: true, dashboardMode: true, aboutOpen: true, welcomeVisible: true, searchFocused: true,
      sidebarOpen: true, stationOpen: true, lineFilterActive: true,
    };
    const order = [];
    const state = { ...all };
    const flags = ['rationaleOpen', 'feedbackOpen', 'whatsNewOpen', 'downloadOpen', 'aboutOpen', 'welcomeVisible', 'dashboardMode', 'searchFocused', 'sidebarOpen', 'stationOpen', 'lineFilterActive'];
    for (const f of flags) {
      order.push(resolveBackAction(state));
      state[f] = false;
    }
    expect(order).toEqual([
      'decline-rationale', 'close-feedback', 'close-whats-new', 'close-download', 'close-about', 'dismiss-welcome', 'exit-dashboard', 'close-search', 'close-sidebar', 'close-station', 'clear-filter',
    ]);
    expect(resolveBackAction(state)).toBe('exit');
  });
  it('closes the sidebar before the station sheet', () => {
    expect(resolveBackAction({ sidebarOpen: true, stationOpen: true })).toBe('close-sidebar');
  });
});
