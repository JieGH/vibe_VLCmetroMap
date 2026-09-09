// Copyright, licensing, and third-party legal metadata for Metro Valencia.
// In accordance with App Store release preparation, client-facing surfaces
// display full legal provenance and third-party attributions without exposing
// raw internal developer repository URLs.

export const APP_LEGAL_INFO = {
  name: 'Metro Valencia',
  subtitle: 'Real-Time Transit Tracker',
  author: 'Jie Lei',
  year: '2026',
  copyright: '© 2026 Jie Lei',
  licenseSpdx: 'Apache-2.0',
  licenseName: 'Apache License 2.0',
  licenseSummary:
    'Licensed under the Apache License, Version 2.0 (the "License"). You may use, distribute, and modify this application in compliance with the License terms.',
  disclaimer:
    'This software is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
  attributions: {
    operator: {
      title: 'Metrovalencia / FGV',
      text: 'Metrovalencia is a registered brand of Ferrocarrils de la Generalitat Valenciana (FGV). Network lines, line designations, brand colors, and scheduled timetables are the property of FGV. This independent application is not affiliated with, maintained by, or endorsed by FGV.',
    },
    arrivals: {
      title: 'Real-Time Arrivals',
      text: 'Live arrival predictions and countdown estimations are derived from public GTFS-RT transit feeds via metroapi.alexbadi.es.',
    },
    osm: {
      title: 'OpenStreetMap Contributors',
      text: 'Street basemap and railway track geometry data © OpenStreetMap contributors, licensed under the Open Database License (ODbL).',
    },
    protomaps: {
      title: 'Protomaps Vector Tiles',
      text: 'Offline vector basemap extracts powered by Protomaps PMTiles technology.',
    },
    maplibre: {
      title: 'MapLibre GL JS',
      text: 'Interactive web and vector map rendering powered by the open-source MapLibre GL engine (BSD 3-Clause License).',
    },
  },
  privacy: {
    title: 'Privacy & Device Data',
    points: [
      'Your User Location fix is queried on-device only when requesting nearest station navigation, and is never logged, stored, or transmitted to any server.',
      'Zero telemetry: no user analytics, tracking cookies, advertising identifiers, or account requirements.',
    ],
  },
};

/**
 * Checks if a string contains raw GitHub, GitLab, or git repository links.
 * @param {string} text
 * @returns {boolean}
 */
export function containsRepoUrls(text) {
  if (typeof text !== 'string') return false;
  return /(?:https?:\/\/)?(?:www\.)?github\.com|\bgit@github\.com|\.git\b/i.test(text);
}

/**
 * Recursively scans an object for any raw repository links.
 * @param {unknown} obj
 * @returns {boolean}
 */
export function hasRawRepoLinks(obj) {
  if (!obj) return false;
  if (typeof obj === 'string') {
    return containsRepoUrls(obj);
  }
  if (Array.isArray(obj)) {
    return obj.some((item) => hasRawRepoLinks(item));
  }
  if (typeof obj === 'object') {
    return Object.values(obj).some((val) => hasRawRepoLinks(val));
  }
  return false;
}

/**
 * Validates legal metadata completeness and ensures no repository links leak to client surfaces.
 * @returns {{ isValid: boolean, violations: string[] }}
 */
export function validateLegalMetadata() {
  const violations = [];
  if (!APP_LEGAL_INFO.copyright) violations.push('Missing copyright');
  if (!APP_LEGAL_INFO.licenseSpdx) violations.push('Missing license SPDX');
  if (!APP_LEGAL_INFO.attributions?.operator) violations.push('Missing operator attribution');
  if (!APP_LEGAL_INFO.attributions?.osm) violations.push('Missing OSM attribution');
  if (!APP_LEGAL_INFO.attributions?.protomaps) violations.push('Missing Protomaps attribution');
  if (!APP_LEGAL_INFO.attributions?.maplibre) violations.push('Missing MapLibre attribution');

  if (hasRawRepoLinks(APP_LEGAL_INFO)) {
    violations.push('Legal metadata contains raw repository links');
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}
