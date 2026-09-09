import { describe, it, expect } from 'vitest';
import {
  APP_LEGAL_INFO,
  containsRepoUrls,
  hasRawRepoLinks,
  validateLegalMetadata,
} from './legalInfo';

describe('APP_LEGAL_INFO metadata', () => {
  it('has correct copyright owner and current year', () => {
    expect(APP_LEGAL_INFO.copyright).toBe('© 2026 Jie Lei');
    expect(APP_LEGAL_INFO.author).toBe('Jie Lei');
    expect(APP_LEGAL_INFO.year).toBe('2026');
  });

  it('specifies Apache-2.0 open-source license', () => {
    expect(APP_LEGAL_INFO.licenseSpdx).toBe('Apache-2.0');
    expect(APP_LEGAL_INFO.licenseName).toBe('Apache License 2.0');
    expect(APP_LEGAL_INFO.licenseSummary).toContain('Apache License, Version 2.0');
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
    expect(attributions.arrivals.text).toContain('GTFS');
  });

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
    expect(containsRepoUrls('© 2026 Jie Lei. Apache 2.0')).toBe(false);
    expect(containsRepoUrls('© OpenStreetMap contributors')).toBe(false);
  });

  it('ensures no raw developer repository links exist in any client-facing legal metadata', () => {
    expect(hasRawRepoLinks(APP_LEGAL_INFO)).toBe(false);
    const validation = validateLegalMetadata();
    expect(validation.isValid).toBe(true);
    expect(validation.violations).toEqual([]);
  });
});
