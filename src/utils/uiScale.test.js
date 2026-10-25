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
  it('draws every platform, Android included, at full size', () => {
    expect(ANDROID_UI_ZOOM).toBe(1);
    expect(uiZoomFor('android')).toBe(1);
    expect(uiZoomFor('ios')).toBe(1);
    expect(uiZoomFor('web')).toBe(1);
  });
});

describe('applyUiZoom', () => {
  it.each(['android', 'ios', 'web'])('leaves the root untouched on %s', (platform) => {
    const root = fakeRoot();
    expect(applyUiZoom(platform, root)).toBe(1);
    expect(root.classes.size).toBe(0);
    expect(root.props).toEqual({});
  });
});
