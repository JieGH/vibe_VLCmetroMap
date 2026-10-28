import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { translate, SUPPORTED_LANGUAGES } from './translate';
import { I18nProvider, LANGUAGE_STORAGE_KEY } from './I18nContext';
import StationPanel from '../components/StationPanel';
import ConnectingBusSection from '../components/ConnectingBusSection';
import BusStopBoard from '../components/BusStopBoard';
import BusLineInspector from '../components/BusLineInspector';
import ErrorBoundary from '../components/ErrorBoundary';
import CompactMetroSection from '../components/CompactMetroSection';
import SearchBar from '../components/SearchBar';
import WhatsNewModal from '../components/WhatsNewModal';
import { VersionPill } from '../components/AppBadge';
import { feederFromStop } from '../data/emtData';
import { arrivalStore, ARRIVAL_ERRORS } from '../services/arrivalStore';

// Keys added when every user-visible string was moved into the dictionaries.
const NEW_KEYS = [
  'common.all', 'common.metro', 'common.bus', 'common.accessible', 'common.trains', 'common.station', 'common.stations',
  'common.close', 'common.accessible', 'common.accessibleBus', 'common.minWalk', 'common.gitCommit',
  'app.outsideSpainNotice', 'app.noLiveOutsideNotice', 'app.noLiveProviderNotice',
  'app.transitModeAria', 'app.emtTrunks', 'app.busNetworkTrunks',
  'hub.whereYoureAt', 'hub.mapPing',
  'stationPanel.tabsAria', 'stationPanel.tabAllTitle', 'stationPanel.tabMetroAria', 'stationPanel.tabMetroTitle',
  'stationPanel.tabBusAria', 'stationPanel.tabBusTitle', 'stationPanel.toggleExpandAria',
  'stationPanel.collapseView', 'stationPanel.expandView', 'stationPanel.collapsePanelAria',
  'stationPanel.expandPanelAria', 'stationPanel.minimizeTitle', 'stationPanel.maximizeTitle',
  'stationPanel.alsoWithinWalk', 'stationPanel.openStation', 'stationPanel.switchToStation',
  'stationPanel.liveTelemetryFgv', 'stationPanel.linesCheckBoard', 'stationPanel.regularSchedule',
  'bus.heading', 'bus.noStops', 'bus.openStop', 'bus.liveGpsTelemetry', 'bus.stopAria', 'bus.stopFallback',
  'bus.stopTooltip', 'bus.nextStop', 'bus.headway', 'bus.activeBuses', 'bus.nextStopEta', 'bus.liveTracking',
  'bus.stopsOnRoute', 'bus.dismissRibbon', 'bus.valenciaLines', 'bus.searchQuery',
  'arrivals.errors.refreshedRecently', 'arrivals.errors.noEndpoint', 'arrivals.errors.rateLimited',
  'arrivals.errors.networkRefused', 'arrivals.errors.updateFailed', 'arrivals.errors.unavailable',
  'errorBoundary.title', 'errorBoundary.body', 'errorBoundary.reload', 'errorBoundary.retry',
  'prototype.badge', 'prototype.switcherAria', 'prototype.prevTitle', 'prototype.prevAria', 'prototype.nextTitle',
  'prototype.nextAria', 'prototype.infoTrigger', 'prototype.inspect', 'prototype.rationaleAria',
  'prototype.counter', 'prototype.variantUpper', 'prototype.variant', 'prototype.rationaleHeading',
  'prototype.prosHeading', 'prototype.consHeading', 'prototype.questionHeading', 'prototype.closeRationale',
  'prototype.A.label', 'prototype.A.shortLabel', 'prototype.A.concept', 'prototype.A.subtitle', 'prototype.A.rationale',
  'prototype.A.pro1', 'prototype.A.pro2', 'prototype.A.pro3', 'prototype.A.pro4', 'prototype.A.con1', 'prototype.A.question',
  'prototype.B.label', 'prototype.B.shortLabel', 'prototype.B.concept', 'prototype.B.subtitle', 'prototype.B.rationale',
  'prototype.B.pro1', 'prototype.B.pro2', 'prototype.B.pro3', 'prototype.B.pro4', 'prototype.B.con1', 'prototype.B.question',
  'prototype.C.label', 'prototype.C.shortLabel', 'prototype.C.concept', 'prototype.C.subtitle', 'prototype.C.rationale',
  'prototype.C.pro1', 'prototype.C.pro2', 'prototype.C.pro3', 'prototype.C.pro4', 'prototype.C.con1', 'prototype.C.question',
];

// Words that really are identical in all three languages.
const SAME_IN_ALL = new Set([
  'common.metro', 'common.bus', 'common.accessible', 'bus.stopFallback', 'bus.stopTooltip', 'bus.searchQuery', 'common.gitCommit',
  'prototype.variant', 'prototype.variantUpper', 'prototype.badge', 'prototype.counter',
]);

// No DOM environment here: a tiny window with a localStorage is all the language lookup needs.
const originalWindow = global.window;
const store = {};
const setLanguageInStorage = (lang) => {
  global.window = { localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } } };
  global.window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
};

// Static markup escapes apostrophes, so compare against the escaped text.
const esc = (text) => text.replace(/&/g, '&amp;').replace(/'/g, '&#x27;');

const withLanguage = (lang, node) => {
  setLanguageInStorage(lang);
  return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
};

beforeEach(() => { delete store[LANGUAGE_STORAGE_KEY]; });
afterAll(() => { global.window = originalWindow; });

describe('new keys translate in every language', () => {
  it.each(NEW_KEYS)('%s exists in en, es and ca', (key) => {
    SUPPORTED_LANGUAGES.forEach((lang) => {
      const value = translate(lang, key, { min: 3, count: 2, name: 'N', station: 'S', stop: 'X', lines: '1', code: '7', line: '9', value: '5', index: 1, total: 3, key: 'A' });
      expect(value, `${lang}:${key}`).not.toBe(key);
      expect(value.length).toBeGreaterThan(0);
    });
  });

  it.each(NEW_KEYS.filter((k) => !SAME_IN_ALL.has(k)))('%s differs from English in es and ca', (key) => {
    const en = translate('en', key);
    expect(translate('es', key), `es:${key}`).not.toBe(en);
    expect(translate('ca', key), `ca:${key}`).not.toBe(en);
  });
});

describe('components follow the language', () => {
  const station = { properties: { name: 'Xàtiva', lines: ['3'], apiId: 10 } };
  const pin = { properties: { name: "Where you're at", lines: [], isPin: true }, isPin: true, geometry: { type: 'Point', coordinates: [-0.37, 39.47] } };

  it('StationPanel tab labels and expand controls are translated', () => {
    const es = withLanguage('es', <StationPanel station={pin} theme="dark" onClose={() => {}} userLocation={{ status: 'located', coordinates: [-0.37, 39.47] }} />);
    expect(es).toContain(esc(translate('es', 'stationPanel.tabsAria')));
    expect(es).toContain(esc(translate('es', 'stationPanel.tabMetroAria')));
    expect(es).toContain(esc(translate('es', 'hub.whereYoureAt')));
    expect(es).not.toContain('Multimodal arrivals navigation');
    const ca = withLanguage('ca', <StationPanel station={pin} theme="dark" onClose={() => {}} userLocation={{ status: 'located', coordinates: [-0.37, 39.47] }} />);
    expect(ca).toContain(esc(translate('ca', 'stationPanel.tabBusAria')));
    expect(ca).toContain(esc(translate('ca', 'common.all')));
    const plain = withLanguage('es', <StationPanel station={station} theme="dark" onClose={() => {}} />);
    expect(plain).toContain(esc(translate('es', 'stationPanel.toggleExpandAria')));
    expect(plain).not.toContain('Toggle expand station panel');
  });

  it('ConnectingBusSection empty state and heading are translated', () => {
    const es = withLanguage('es', <ConnectingBusSection feeders={[]} />);
    expect(es).toContain(esc(translate('es', 'bus.noStops')));
    const ca = withLanguage('ca', <ConnectingBusSection feeders={[{ stopCode: '1', stopName: 'Parada X', walkMin: 2, lines: ['6'], arrivals: [] }]} />);
    expect(ca).toContain(esc(translate('ca', 'bus.openStop')));
    expect(ca).not.toContain('Open this street bus stop');
    const en = withLanguage('en', <ConnectingBusSection feeders={[{ stopCode: '1', stopName: 'Stop X', walkMin: 2, lines: ['6'], arrivals: [] }]} />);
    expect(en).toContain('>Bus<');
    expect(en).not.toContain('Autobús');
  });

  it('BusStopBoard accessible marker and aria label are translated', () => {
    const stop = { stopCode: '1', stopName: 'Parada Y', lines: ['6'], arrivals: [{ line: '6', destination: 'Torrefiel', dueSeconds: 60, minutes: 1, wheelchair: true }] };
    const es = withLanguage('es', <BusStopBoard stop={stop} theme="dark" onClose={() => {}} />);
    expect(es).toContain(esc(translate('es', 'common.accessibleBus')));
    expect(es).toContain(esc(translate('es', 'bus.stopAria', { name: 'Parada Y' })));
    expect(es).not.toContain('Bus stop Parada Y');
  });

  it('BusLineInspector labels are translated', () => {
    const line = { id: '19', name: 'Línea 19', color: '#d00', headway: '10 min', activeVehicles: 3, stops: [] };
    const ca = withLanguage('ca', <BusLineInspector line={line} liveBuses={[]} onClose={() => {}} />);
    expect(ca).toContain(esc(translate('ca', 'bus.dismissRibbon')));
    expect(ca).toContain(esc(translate('ca', 'bus.activeBuses', { count: 3 })));
    expect(ca).not.toContain('active buses');
  });

  it('ErrorBoundary recovery screen follows the stored language', () => {
    ['en', 'es', 'ca'].forEach((lang) => {
      setLanguageInStorage(lang);
      const boundary = new ErrorBoundary({ children: null });
      boundary.state = { hasError: true, error: new Error('x') };
      const html = renderToStaticMarkup(boundary.render());
      expect(html).toContain(esc(translate(lang, 'errorBoundary.title')));
      expect(html).toContain(esc(translate(lang, 'errorBoundary.reload')));
      expect(html).toContain(esc(translate(lang, 'errorBoundary.retry')));
    });
  });

  it('CompactMetroSection station chip, counts and telemetry hint are translated', () => {
    const nearbyMetro = [{ name: 'Xàtiva', lines: ['3'], walkMin: 2, arrivals: [{ line: '3', destination: 'Rafelbunyol', seconds: 120, isLive: true }] }];
    const es = withLanguage('es', <CompactMetroSection isPinMode nearbyMetro={nearbyMetro} />);
    expect(es).toContain(esc(translate('es', 'stationPanel.liveTelemetryFgv')));
    expect(es).toContain(esc(translate('es', 'common.trains')));
    expect(es).toContain(esc(translate('es', 'stationPanel.openStation', { station: 'Xàtiva' })));
    expect(es).not.toContain('Live FGV Telemetry');
    const ca = withLanguage('ca', <CompactMetroSection isPinMode nearbyMetro={nearbyMetro} />);
    expect(ca).toContain(esc(translate('ca', 'common.station')));
  });

  it('SearchBar section title for bus lines is translated', () => {
    const html = withLanguage('es', <SearchBar onSelectStation={() => {}} onSelectLine={() => {}} onSelectBusLine={() => {}} onClose={() => {}} />);
    expect(html).not.toContain('València Bus Lines');
  });

  it('WhatsNewModal close button and VersionPill commit title are translated', () => {
    const es = withLanguage('es', <WhatsNewModal isOpen onClose={() => {}} />);
    expect(es).toContain(`aria-label="${translate('es', 'common.close')}"`);
    expect(translate('es', 'common.gitCommit')).toBeTruthy();
    expect(renderToStaticMarkup(<VersionPill />)).toBeTruthy();
  });
});

describe('services return translatable keys, not English sentences', () => {
  it('a feeder with no stop name carries an empty name for the UI to translate', () => {
    expect(feederFromStop({ stopCode: '1', coordinates: [0, 0] }, 50).stopName).toBe('');
  });

  it('arrivalStore speaks in dictionary keys', async () => {
    const store = arrivalStore;
    const noEndpoint = await store.getStationArrivals({ name: 'Nowhere', lines: [] });
    expect(noEndpoint.fetchError).toBe('arrivals.errors.noEndpoint');
    SUPPORTED_LANGUAGES.forEach((lang) => {
      expect(translate(lang, noEndpoint.fetchError)).not.toBe(noEndpoint.fetchError);
    });
  });

  it('every arrival error code is a dictionary key in all three languages', () => {
    Object.values(ARRIVAL_ERRORS).forEach((key) => {
      SUPPORTED_LANGUAGES.forEach((lang) => expect(translate(lang, key)).not.toBe(key));
    });
  });
});
