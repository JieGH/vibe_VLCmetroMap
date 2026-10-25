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
  licenseSpdx: 'LicenseRef-Xarxa-All-Rights-Reserved',
  licenseName: 'All Rights Reserved (source-available)',
  licenseSummary:
    'All rights reserved. You may use the official app as published. The source code is viewable, but you may not copy, modify, or distribute this application or its code, commercially or non-commercially, without prior written permission from the author.',
  disclaimer:
    'This software is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.',
  attributions: {
    operator: {
      title: 'Metrovalencia / FGV',
      text: 'Metrovalencia is a registered brand of Ferrocarrils de la Generalitat Valenciana (FGV). Network lines, line designations, brand colors, and scheduled timetables are the property of FGV. This independent application is not affiliated with, maintained by, or endorsed by FGV.',
    },
    arrivals: {
      title: 'Real-Time Arrivals',
      text: 'Live arrival predictions come from the real-time feed of Ferrocarrils de la Generalitat Valenciana (FGV), operator of Metrovalencia. Countdowns and train positions are estimated by this app from those predictions.',
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

// Spanish (Spain) translation of the same legal metadata, mirroring
// APP_LEGAL_INFO's shape exactly so AboutModal can pick either by language.
export const APP_LEGAL_INFO_ES = {
  name: 'Metro Valencia',
  subtitle: 'Seguimiento en tiempo real',
  author: 'Jie Lei',
  year: '2026',
  copyright: '© 2026 Jie Lei',
  licenseSpdx: 'LicenseRef-Xarxa-All-Rights-Reserved',
  licenseName: 'Todos los derechos reservados (código disponible)',
  licenseSummary:
    'Todos los derechos reservados. Puedes usar la app oficial tal como se publica. El código fuente es visible, pero no puedes copiar, modificar ni distribuir esta aplicación ni su código, ni con fines comerciales ni no comerciales, sin permiso previo y por escrito del autor.',
  disclaimer:
    'Este software se distribuye "TAL CUAL", SIN GARANTÍAS NI CONDICIONES DE NINGÚN TIPO, ni expresas ni implícitas.',
  attributions: {
    operator: {
      title: 'Metrovalencia / FGV',
      text: 'Metrovalencia es una marca registrada de Ferrocarrils de la Generalitat Valenciana (FGV). Las líneas de la red, sus denominaciones, los colores de marca y los horarios programados son propiedad de FGV. Esta aplicación independiente no está afiliada, mantenida ni respaldada por FGV.',
    },
    arrivals: {
      title: 'Llegadas en tiempo real',
      text: 'Las predicciones de llegada en directo proceden del servicio en tiempo real de Ferrocarrils de la Generalitat Valenciana (FGV), operadora de Metrovalencia. Las cuentas atrás y las posiciones de los trenes las estima esta aplicación a partir de esas predicciones.',
    },
    osm: {
      title: 'Colaboradores de OpenStreetMap',
      text: 'El mapa base de calles y la geometría de las vías © colaboradores de OpenStreetMap, con licencia Open Database License (ODbL).',
    },
    protomaps: {
      title: 'Mosaicos vectoriales de Protomaps',
      text: 'Extractos de mapa base vectorial sin conexión impulsados por la tecnología PMTiles de Protomaps.',
    },
    maplibre: {
      title: 'MapLibre GL JS',
      text: 'Renderizado de mapas web y vectoriales interactivos impulsado por el motor de código abierto MapLibre GL (licencia BSD de 3 cláusulas).',
    },
  },
  privacy: {
    title: 'Privacidad y datos del dispositivo',
    points: [
      'Tu ubicación se consulta solo en el dispositivo cuando solicitas la navegación a la estación más cercana, y nunca se registra, almacena ni transmite a ningún servidor.',
      'Cero telemetría: sin analíticas de usuario, cookies de seguimiento, identificadores publicitarios ni cuentas obligatorias.',
    ],
  },
};

// Valencian translation of the same legal metadata, same shape as APP_LEGAL_INFO.
export const APP_LEGAL_INFO_CA = {
  name: 'Metro Valencia',
  subtitle: 'Seguiment en temps real',
  author: 'Jie Lei',
  year: '2026',
  copyright: '© 2026 Jie Lei',
  licenseSpdx: 'LicenseRef-Xarxa-All-Rights-Reserved',
  licenseName: 'Tots els drets reservats (codi disponible)',
  licenseSummary:
    'Tots els drets reservats. Pots usar l\'app oficial tal com es publica. El codi font és visible, però no pots copiar, modificar ni distribuir esta aplicació ni el seu codi, ni amb fins comercials ni no comercials, sense permís previ i per escrit de l\'autor.',
  disclaimer:
    'Este programari es distribuïx "TAL QUAL", SENSE GARANTIES NI CONDICIONS DE CAP MENA, ni expresses ni implícites.',
  attributions: {
    operator: {
      title: 'Metrovalencia / FGV',
      text: 'Metrovalencia és una marca registrada de Ferrocarrils de la Generalitat Valenciana (FGV). Les línies de la xarxa, les seues denominacions, els colors de marca i els horaris programats són propietat de FGV. Esta aplicació independent no està afiliada, mantinguda ni avalada per FGV.',
    },
    arrivals: {
      title: 'Arribades en temps real',
      text: 'Les prediccions d\'arribada en directe procedixen del servici en temps real de Ferrocarrils de la Generalitat Valenciana (FGV), operadora de Metrovalencia. Els comptes enrere i les posicions dels trens els estima esta aplicació a partir d\'eixes prediccions.',
    },
    osm: {
      title: 'Col·laboradors d\'OpenStreetMap',
      text: 'El mapa base de carrers i la geometria de les vies © col·laboradors d\'OpenStreetMap, amb llicència Open Database License (ODbL).',
    },
    protomaps: {
      title: 'Mosaics vectorials de Protomaps',
      text: 'Extractes de mapa base vectorial sense connexió impulsats per la tecnologia PMTiles de Protomaps.',
    },
    maplibre: {
      title: 'MapLibre GL JS',
      text: 'Renderitzat de mapes web i vectorials interactius impulsat pel motor de codi obert MapLibre GL (llicència BSD de 3 clàusules).',
    },
  },
  privacy: {
    title: 'Privacitat i dades del dispositiu',
    points: [
      'La teua ubicació es consulta només en el dispositiu quan sol·licites la navegació a l\'estació més pròxima, i mai es registra, emmagatzema ni transmet a cap servidor.',
      'Zero telemetria: sense analítiques d\'usuari, galetes de seguiment, identificadors publicitaris ni comptes obligatoris.',
    ],
  },
};

/**
 * The legal metadata for `lang`, falling back to the English (canonical)
 * object for any language this app doesn't ship a translation for.
 * @param {string} lang
 */
export function getLegalInfo(lang) {
  if (lang === 'es') return APP_LEGAL_INFO_ES;
  if (lang === 'ca') return APP_LEGAL_INFO_CA;
  return APP_LEGAL_INFO;
}

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
  if (hasRawRepoLinks(APP_LEGAL_INFO_ES)) {
    violations.push('Spanish legal metadata contains raw repository links');
  }

  return {
    isValid: violations.length === 0,
    violations,
  };
}
