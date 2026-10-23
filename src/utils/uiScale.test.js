import { describe, it, expect } from 'vitest';
import { ANDROID_UI_ZOOM, applyUiZoom, uiZoomFor } from './uiScale';

const fakeRoot = () => {
  const classes = new Set();
  const props = {};
  return {
    classes,
    props,
    classList: { add: (c) => classes.add(c) },
    style: { setProperty: (k, v) => { props[k] = v; } },
  };
};

describe('uiZoomFor', () => {
  it('draws Android a little smaller, not tiny, and every other platform at full size', () => {
    expect(uiZoomFor('android')).toBe(ANDROID_UI_ZOOM);
    expect(ANDROID_UI_ZOOM).toBeLessThan(1);
    expect(ANDROID_UI_ZOOM).toBeGreaterThan(0.7);
    expect(uiZoomFor('ios')).toBe(1);
    expect(uiZoomFor('web')).toBe(1);
  });
});

describe('applyUiZoom', () => {
  it('marks the root and records the factor on Android', () => {
    const root = fakeRoot();
    expect(applyUiZoom('android', root)).toBe(ANDROID_UI_ZOOM);
    expect(root.classes.has('ui-zoomed')).toBe(true);
    expect(root.props['--ui-zoom']).toBe(String(ANDROID_UI_ZOOM));
  });

  it('leaves the root untouched elsewhere', () => {
    const root = fakeRoot();
    expect(applyUiZoom('ios', root)).toBe(1);
    expect(root.classes.size).toBe(0);
    expect(root.props).toEqual({});
  });
});
