import { describe, it, expect } from 'vitest';
import {
  APP_LEGAL_INFO,
  APP_LEGAL_INFO_CA,
  APP_LEGAL_INFO_ES,
  containsRepoUrls,
  hasRawRepoLinks,
  validateLegalMetadata,
} from './legalInfo';

describe('APP_LEGAL_INFO metadata', () => {
  it('has correct copyright owner and current year', () => {
    expect(APP_LEGAL_INFO.copyright).toBe('© 2026 Jie');
    expect(APP_LEGAL_INFO.author).toBe('Jie');
    expect(APP_LEGAL_INFO.year).toBe('2026');
  });

  it('specifies the all-rights-reserved source-available license', () => {
    expect(APP_LEGAL_INFO.licenseSpdx).toBe('LicenseRef-Xarxa-All-Rights-Reserved');
    expect(APP_LEGAL_INFO.licenseName).toBe('All Rights Reserved (source-available)');
    expect(APP_LEGAL_INFO.licenseSummary).toContain('All rights reserved');
  });

  it('includes required third-party legal attributions', () => {
    const { attributions } = APP_LEGAL_INFO;
    expect(attributions).toBeDefined();

    // FGV / Metrovalencia operator & trademark notice
    expect(attributions.operator.title).toContain('FGV');
    expect(attributions.operator.text).toContain('Ferrocarrils de la Generalitat Valenciana');
    expect(attributions.operator.text).toContain('Metrovalencia');

    // OpenStreetMap
    expect(attributions.osm.title).toContain('OpenStreetMap');
    expect(attributions.osm.text).toContain('OpenStreetMap contributors');
    expect(attributions.osm.text).toContain('ODbL');

    // Protomaps
    expect(attributions.protomaps.title).toContain('Protomaps');
    expect(attributions.protomaps.text).toContain('Protomaps');

    // MapLibre
    expect(attributions.maplibre.title).toContain('MapLibre');
    expect(attributions.maplibre.text).toContain('MapLibre GL');

    // Live arrival feed
    expect(attributions.arrivals.title).toContain('Arrivals');
  });

  // Live Arrivals come straight from FGV's own feed (ADR-0005); crediting a
  // relay, or calling the feed GTFS-RT, would misstate where they come from.
  it.each([['en', APP_LEGAL_INFO], ['es', APP_LEGAL_INFO_ES]])(
    'credits FGV for live arrivals in %s, naming no third-party API',
    (_lang, info) => {
      const { text } = info.attributions.arrivals;
      expect(text).toContain('Ferrocarrils de la Generalitat Valenciana');
      expect(text).not.toMatch(/alexbadi|GTFS-RT|https?:\/\//i);
    },
  );

  // #131: the typeface is Overpass under the SIL Open Font License, which asks for the notice to travel with it.
  it.each([['en', APP_LEGAL_INFO], ['es', APP_LEGAL_INFO_ES], ['ca', APP_LEGAL_INFO_CA]])(
    'credits the Overpass typeface and its SIL Open Font License in %s',
    (_lang, info) => {
      expect(info.attributions.overpass.title).toContain('Overpass');
      expect(info.attributions.overpass.text).toContain('SIL Open Font License');
      expect(info.attributions.overpass.text).toContain('The Overpass Project Authors');
    },
  );

  it('includes privacy and on-device location policy', () => {
    const { privacy } = APP_LEGAL_INFO;
    expect(privacy).toBeDefined();
    expect(privacy.points.length).toBeGreaterThanOrEqual(2);
    expect(privacy.points.some((p) => p.includes('on-device'))).toBe(true);
    expect(privacy.points.some((p) => p.includes('telemetry') || p.includes('analytics'))).toBe(true);
  });
});

describe('Legal metadata sanitation (no raw developer repository links)', () => {
  it('detects raw GitHub and git repository URLs correctly', () => {
    expect(containsRepoUrls('https://github.com/JieGH/vib_metroValencia')).toBe(true);
    expect(containsRepoUrls('http://github.com/foo/bar')).toBe(true);
    expect(containsRepoUrls('git@github.com:JieGH/vib_metroValencia.git')).toBe(true);
    expect(containsRepoUrls('Visit our github.com page')).toBe(true);
    expect(containsRepoUrls('© 2026 Jie Lei. All rights reserved')).toBe(false);
    expect(containsRepoUrls('© OpenStreetMap contributors')).toBe(false);
  });

  it('ensures no raw developer repository links exist in any client-facing legal metadata', () => {
    expect(hasRawRepoLinks(APP_LEGAL_INFO)).toBe(false);
    const validation = validateLegalMetadata();
    expect(validation.isValid).toBe(true);
    expect(validation.violations).toEqual([]);
  });
});
