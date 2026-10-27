// EMT València Bus Prototype Data
// Grounded in EMT Open Data specifications and TCRP Report 45 design guidelines.

import { getDistance } from '../utils/geoUtils';
import { WALK_RADIUS_METRES } from '../utils/walkRadius';
import { walkingMinutes } from '../utils/walking';
import REAL_EMT_STOPS from './emt_stops.json';
import { buildDisplayCoordinates, displayCoordinatesFor } from '../utils/stopOffsets';

export const EMT_LINES = [
  {
    id: 'C1',
    number: 'C1',
    name: 'Centre Històric',
    type: 'circular',
    color: '#D62828', // Official EMT Red
    accent: '#B71C1C',
    headway: '5–7 min',
    activeVehicles: 4,
    description: 'Circular ring passing Plaça de l’Ajuntament, Xàtiva, Torres de Quart & Serrans',
    coordinates: [
      [-0.3768, 39.4699], // Pl. Ajuntament
      [-0.3775, 39.4670], // Xàtiva / Estació del Nord
      [-0.3805, 39.4665], // Sant Pau
      [-0.3830, 39.4715], // Guillem de Castro
      [-0.3838, 39.4755], // Torres de Quart
      [-0.3795, 39.4785], // Blanqueries
      [-0.3755, 39.4792], // Torres de Serrans
      [-0.3725, 39.4770], // Pintor López
      [-0.3705, 39.4735], // Plaça de Tetuan
      [-0.3735, 39.4715], // Carrer del Poeta Querol
      [-0.3768, 39.4699]  // back to Pl. Ajuntament
    ],
    stops: [
      { code: '1002', name: 'Xàtiva - Institut Lluís Vives', coordinates: [-0.3775, 39.4670], connectingMetro: 'Xàtiva' },
      { code: '1120', name: 'Guillem de Castro - Quart', coordinates: [-0.3838, 39.4755], connectingMetro: null },
      { code: '1205', name: 'Torres dels Serrans', coordinates: [-0.3755, 39.4792], connectingMetro: 'Pont de Fusta' },
      { code: '1240', name: 'Tetuan - Exterior', coordinates: [-0.3705, 39.4735], connectingMetro: 'Colón' },
      { code: '1245', name: 'Plaça de l’Ajuntament - Correus', coordinates: [-0.3768, 39.4699], connectingMetro: 'Xàtiva' },
    ]
  },
  {
    id: 'C2',
    number: 'C2',
    name: 'General Elio / Campanar',
    type: 'circular',
    color: '#E05A47',
    accent: '#C0392B',
    headway: '6–8 min',
    activeVehicles: 6,
    description: 'Inner ring boulevard: Gran Via Ferran el Catòlic & Marqués del Túria',
    coordinates: [
      [-0.3860, 39.4720], // Gran Via Ferran el Catòlic
      [-0.3820, 39.4660], // Gran Via Ramon y Cajal
      [-0.3750, 39.4640], // Gran Via Germanies
      [-0.3680, 39.4670], // Gran Via Marqués del Túria
      [-0.3620, 39.4700], // Pont d'Aragó
      [-0.3580, 39.4750], // Avinguda d'Aragó
      [-0.3600, 39.4770], // Blasco Ibáñez
      [-0.3650, 39.4800], // General Elio / Jardins del Real
      [-0.3715, 39.4785], // Pont de Fusta
      [-0.3800, 39.4760], // Menéndez Pidal
      [-0.3860, 39.4720]  // Ferran el Catòlic
    ],
    stops: [
      { code: '128', name: 'Gran Via Ferran el Catòlic - Àngel Guimerà', coordinates: [-0.3860, 39.4720], connectingMetro: 'Àngel Guimerà' },
      { code: '130', name: 'Gran Via Germanies - Estació del Nord', coordinates: [-0.3750, 39.4640], connectingMetro: 'Bailén' },
      { code: '135', name: 'Marqués del Túria - Russafa', coordinates: [-0.3680, 39.4670], connectingMetro: 'Colón' },
      { code: '142', name: 'Plaça Saragossa - Aragó', coordinates: [-0.3580, 39.4750], connectingMetro: 'Aragó' },
      { code: '150', name: 'General Elio - Facultats', coordinates: [-0.3650, 39.4800], connectingMetro: 'Facultats' },
    ]
  },
  {
    id: 'C3',
    number: 'C3',
    name: 'Trànsits',
    type: 'circular',
    color: '#2E7D32', // Emerald green ring
    accent: '#1B5E20',
    headway: '7–9 min',
    activeVehicles: 8,
    description: 'Outer ring avenue: Pérez Galdós, Peris i Valero, Primat Reig',
    coordinates: [
      [-0.3920, 39.4680], // Pérez Galdós
      [-0.3880, 39.4580], // César Giorgeta
      [-0.3720, 39.4540], // Peris i Valero
      [-0.3580, 39.4580], // Eduard Boscà
      [-0.3500, 39.4680], // Manuel Candela
      [-0.3520, 39.4770], // Ramon Llull
      [-0.3650, 39.4850], // Primat Reig
      [-0.3820, 39.4860], // Peset Aleixandre
      [-0.3920, 39.4790], // General Avilés
      [-0.3920, 39.4680]  // back to start
    ],
    stops: [
      { code: '1650', name: 'Vicent Zaragozà - Benimaclet', coordinates: [-0.3600, 39.4815], connectingMetro: 'Benimaclet' },
      { code: '1662', name: 'Primat Reig - Alboraya', coordinates: [-0.3650, 39.4850], connectingMetro: 'Machado' },
      { code: '1705', name: 'Peris i Valero - Cuba', coordinates: [-0.3720, 39.4540], connectingMetro: 'Joaquim Sorolla' },
      { code: '1720', name: 'Pérez Galdós - Calixt III', coordinates: [-0.3920, 39.4680], connectingMetro: 'Avinguda del Cid' },
    ]
  },
  {
    id: '19',
    number: '19',
    name: 'La Malva-rosa ↔ Estació del Nord',
    type: 'radial',
    color: '#1565C0', // Rich Cobalt Blue
    accent: '#0D47A1',
    headway: '6–8 min',
    activeVehicles: 6,
    description: 'High-frequency city-to-beach trunk linking Central Metro hubs to Port and Malva-rosa Beach',
    coordinates: [
      [-0.3775, 39.4670], // Xàtiva / Estació del Nord
      [-0.3715, 39.4695], // Carrer de Colón
      [-0.3690, 39.4718], // Porta de la Mar
      [-0.3620, 39.4695], // Pont d'Aragó
      [-0.3520, 39.4665], // Avinguda del Port (Inici)
      [-0.3420, 39.4635], // Av. del Port / Serreria
      [-0.3300, 39.4610], // Dr. J.J. Dòmine / Marina de València
      [-0.3260, 39.4670], // Reina / El Cabanyal
      [-0.3245, 39.4740]  // Platja de la Malva-rosa
    ],
    stops: [
      { code: '1002', name: 'Estació del Nord - Xàtiva', coordinates: [-0.3775, 39.4670], connectingMetro: 'Xàtiva' },
      { code: '1248', name: 'Colón - Roger de Lloria', coordinates: [-0.3715, 39.4695], connectingMetro: 'Colón' },
      { code: '1310', name: 'Porta de la Mar', coordinates: [-0.3690, 39.4718], connectingMetro: 'Alameda' },
      { code: '1420', name: 'Av. del Port - Tomàs de Montañana', coordinates: [-0.3520, 39.4665], connectingMetro: 'Amistat' },
      { code: '1515', name: 'Av. del Port - Serreria', coordinates: [-0.3420, 39.4635], connectingMetro: 'Marítim' },
      { code: '1602', name: 'Eugènia Viñes - Platja de la Malva-rosa', coordinates: [-0.3245, 39.4740], connectingMetro: 'Les Arenes' },
    ]
  },
  {
    id: '95',
    number: '95',
    name: 'Parc de Capçalera ↔ Ciutat Arts i Ciències',
    type: 'radial',
    color: '#E65100', // Deep Orange
    accent: '#BF360C',
    headway: '8–10 min',
    activeVehicles: 5,
    description: 'Scenic Turia riverbed arterial traversing the green corridor from Bioparc to City of Arts & Sciences',
    coordinates: [
      [-0.4050, 39.4770], // Parc de Capçalera / Bioparc
      [-0.3950, 39.4820], // Pont de les Glòries
      [-0.3850, 39.4825], // Nou d'Octubre
      [-0.3755, 39.4800], // Pont dels Serrans
      [-0.3715, 39.4775], // Pont de Fusta
      [-0.3640, 39.4710], // Pont de l'Exposició (Alameda)
      [-0.3580, 39.4650], // Pont de les Flors
      [-0.3540, 39.4600], // Palau de la Música
      [-0.3520, 39.4540], // Ciutat de les Arts i les Ciències
      [-0.3420, 39.4510], // Moreres
      [-0.3340, 39.4490]  // Natzaret
    ],
    stops: [
      { code: '2100', name: 'Menéndez Pidal - Estació d\'Autobusos', coordinates: [-0.3850, 39.4825], connectingMetro: 'Túria' },
      { code: '2115', name: 'Pont dels Serrans - Museu Sant Pius V', coordinates: [-0.3755, 39.4800], connectingMetro: 'Pont de Fusta' },
      { code: '2130', name: 'Pont de l\'Exposició - Albereda', coordinates: [-0.3640, 39.4710], connectingMetro: 'Alameda' },
      { code: '2180', name: 'Ciutat de les Arts i les Ciències (Museu)', coordinates: [-0.3520, 39.4540], connectingMetro: 'Ciutat Arts i Ciències - Justícia' },
    ]
  },
  {
    id: '70',
    number: '70',
    name: 'Alboraia ↔ La Fontsanta',
    type: 'radial',
    color: '#6A1B9A', // Purple
    accent: '#4A148C',
    headway: '8–11 min',
    activeVehicles: 5,
    description: 'Cross-city radial connecting Alboraia through Benimaclet, Colón, and Àngel Guimerà',
    coordinates: [
      [-0.3520, 39.5000], // Alboraia
      [-0.3600, 39.4815], // Benimaclet
      [-0.3660, 39.4750], // Jardins del Real
      [-0.3720, 39.4690], // Colón
      [-0.3775, 39.4670], // Xàtiva
      [-0.3846, 39.4704], // Àngel Guimerà
      [-0.3950, 39.4680], // Avinguda del Cid
      [-0.4100, 39.4650]  // La Fontsanta
    ],
    stops: [
      { code: '1642', name: 'Emili Baró - Benimaclet', coordinates: [-0.3600, 39.4815], connectingMetro: 'Benimaclet' },
      { code: '1245', name: 'Colón - Pascual i Genís', coordinates: [-0.3720, 39.4690], connectingMetro: 'Colón' },
      { code: '128', name: 'Gran Via Ferran el Catòlic - Àngel Guimerà', coordinates: [-0.3846, 39.4704], connectingMetro: 'Àngel Guimerà' },
      { code: '1850', name: 'Av. del Cid - Hospital General', coordinates: [-0.4100, 39.4650], connectingMetro: 'Nou d\'Octubre' },
    ]
  },
  {
    id: '92',
    number: '92',
    name: 'La Malva-rosa ↔ Campanar',
    type: 'radial',
    color: '#00838F', // Cyan Teal
    accent: '#006064',
    headway: '7–9 min',
    activeVehicles: 6,
    description: 'High-capacity connection from Campanar to Gran Via and the Beachfront',
    coordinates: [
      [-0.3950, 39.4850], // Campanar
      [-0.3860, 39.4720], // Gran Via Ferran el Catòlic
      [-0.3775, 39.4670], // Xàtiva
      [-0.3680, 39.4670], // Gran Via Marqués del Túria
      [-0.3520, 39.4635], // Av. de França
      [-0.3245, 39.4740]  // Malva-rosa
    ],
    stops: [
      { code: '1305', name: 'Marqués del Túria - Cánovas', coordinates: [-0.3680, 39.4670], connectingMetro: 'Colón' },
      { code: '1002', name: 'Xàtiva - Estació del Nord', coordinates: [-0.3775, 39.4670], connectingMetro: 'Xàtiva' },
      { code: '1580', name: 'Campanar - Vall de la Ballestera', coordinates: [-0.3950, 39.4850], connectingMetro: 'Campanar' }
    ]
  }
];

// Precomputed spatial mapping of Metro Stations to nearby EMT feeder bus stops (<200m)
export const STATION_BUS_TRANSFERS = {
  'Xàtiva': [
    {
      stopCode: '1002',
      stopName: 'Carrer de Xàtiva - Estació del Nord',
      walkMetres: 40,
      walkMin: 1,
      bearingDegrees: 180,
      coordinates: [-0.3772, 39.4672],
      lines: [
        { line: '19', destination: 'La Malva-rosa', dueSeconds: 110, isLive: true, vehicleId: 'EMT-9201' },
        { line: 'C1', destination: 'Centre Històric (Loop)', dueSeconds: 240, isLive: true, vehicleId: 'EMT-8412' },
        { line: '70', destination: 'La Fontsanta', dueSeconds: 390, isLive: true, vehicleId: 'EMT-7014' },
        { line: '92', destination: 'Campanar', dueSeconds: 620, isLive: false, vehicleId: 'EMT-9280' },
      ]
    },
    {
      stopCode: '1005',
      stopName: 'Carrer de Xàtiva - Institut Lluís Vives',
      walkMetres: 75,
      walkMin: 1,
      bearingDegrees: 45,
      coordinates: [-0.3768, 39.4678],
      lines: [
        { line: 'C1', destination: 'Centre Històric (Loop)', dueSeconds: 160, isLive: true, vehicleId: 'EMT-8415' },
        { line: '35', destination: 'Ciutat de les Arts i les Ciències', dueSeconds: 310, isLive: true, vehicleId: 'EMT-3508' },
        { line: '6', destination: 'Torrefiel', dueSeconds: 520, isLive: true, vehicleId: 'EMT-6003' },
      ]
    },
    {
      stopCode: '1245',
      stopName: 'Plaça de l’Ajuntament - Cotanda',
      walkMetres: 140,
      walkMin: 2,
      bearingDegrees: 15,
      coordinates: [-0.3765, 39.4690],
      lines: [
        { line: '19', destination: 'La Malva-rosa', dueSeconds: 220, isLive: true, vehicleId: 'EMT-9208' },
        { line: 'C1', destination: 'Centre Històric (Loop)', dueSeconds: 460, isLive: true, vehicleId: 'EMT-8419' },
        { line: '40', destination: 'Universitats', dueSeconds: 580, isLive: true, vehicleId: 'EMT-4012' },
      ]
    }
  ],
  'Àngel Guimerà': [
    {
      stopCode: '128',
      stopName: 'Gran Via Ferran el Catòlic - Àngel Guimerà',
      walkMetres: 55,
      walkMin: 1,
      bearingDegrees: 330,
      coordinates: [-0.3849, 39.4709],
      lines: [
        { line: 'C2', destination: 'General Elio / Campanar', dueSeconds: 150, isLive: true, vehicleId: 'EMT-8201' },
        { line: '70', destination: 'Alboraia', dueSeconds: 280, isLive: true, vehicleId: 'EMT-7022' },
        { line: '93', destination: 'Passeig Marítim', dueSeconds: 490, isLive: true, vehicleId: 'EMT-9304' },
      ]
    },
    {
      stopCode: '130',
      stopName: 'Gran Via Ferran el Catòlic - Quart',
      walkMetres: 95,
      walkMin: 2,
      bearingDegrees: 350,
      coordinates: [-0.3852, 39.4718],
      lines: [
        { line: 'C2', destination: 'Campanar', dueSeconds: 240, isLive: true, vehicleId: 'EMT-8205' },
        { line: '64', destination: 'Benicalap', dueSeconds: 450, isLive: false, vehicleId: 'EMT-6411' },
      ]
    },
    {
      stopCode: '245',
      stopName: 'Carrer d’Àngel Guimerà - Mestre Palau',
      walkMetres: 120,
      walkMin: 2,
      bearingDegrees: 250,
      coordinates: [-0.3860, 39.4698],
      lines: [
        { line: '70', destination: 'La Fontsanta', dueSeconds: 190, isLive: true, vehicleId: 'EMT-7018' },
        { line: '72', destination: 'Sant Isidre', dueSeconds: 510, isLive: true, vehicleId: 'EMT-7206' },
      ]
    }
  ],
  'Colón': [
    {
      stopCode: '1248',
      stopName: 'Carrer de Colón - Pascual i Genís',
      walkMetres: 50,
      walkMin: 1,
      bearingDegrees: 110,
      coordinates: [-0.3715, 39.4693],
      lines: [
        { line: '19', destination: 'La Malva-rosa', dueSeconds: 130, isLive: true, vehicleId: 'EMT-9204' },
        { line: '40', destination: 'Universitats', dueSeconds: 320, isLive: true, vehicleId: 'EMT-4015' },
        { line: '71', destination: 'La Llum', dueSeconds: 470, isLive: true, vehicleId: 'EMT-7109' },
      ]
    },
    {
      stopCode: '1250',
      stopName: 'Carrer de Colón - Roger de Lloria',
      walkMetres: 80,
      walkMin: 1,
      bearingDegrees: 290,
      coordinates: [-0.3728, 39.4687],
      lines: [
        { line: '92', destination: 'La Malva-rosa', dueSeconds: 220, isLive: true, vehicleId: 'EMT-9211' },
        { line: '19', destination: 'La Malva-rosa', dueSeconds: 490, isLive: true, vehicleId: 'EMT-9218' },
      ]
    },
    {
      stopCode: '1532',
      stopName: 'Carrer de Russafa - Ciril Amorós',
      walkMetres: 130,
      walkMin: 2,
      bearingDegrees: 200,
      coordinates: [-0.3725, 39.4675],
      lines: [
        { line: 'C1', destination: 'Centre Històric (Loop)', dueSeconds: 180, isLive: true, vehicleId: 'EMT-8422' },
        { line: '35', destination: 'Ciutat Arts i Ciències', dueSeconds: 360, isLive: true, vehicleId: 'EMT-3512' },
      ]
    }
  ],
  'Benimaclet': [
    {
      stopCode: '1642',
      stopName: 'Carrer d’Emili Baró - Primat Reig',
      walkMetres: 65,
      walkMin: 1,
      bearingDegrees: 350,
      coordinates: [-0.3598, 39.4822],
      lines: [
        { line: '70', destination: 'La Fontsanta', dueSeconds: 170, isLive: true, vehicleId: 'EMT-7030' },
        { line: '98', destination: 'Estació del Cabanyal', dueSeconds: 380, isLive: true, vehicleId: 'EMT-9804' },
      ]
    },
    {
      stopCode: '1650',
      stopName: 'Avinguda de Vicent Zaragozà',
      walkMetres: 110,
      walkMin: 2,
      bearingDegrees: 70,
      coordinates: [-0.3585, 39.4818],
      lines: [
        { line: 'C3', destination: 'Trànsits (Outer Ring)', dueSeconds: 260, isLive: true, vehicleId: 'EMT-8302' },
        { line: '70', destination: 'Alboraia', dueSeconds: 510, isLive: true, vehicleId: 'EMT-7035' },
      ]
    }
  ],
  'Túria': [
    {
      stopCode: '2100',
      stopName: 'Menéndez Pidal - Estació d’Autobusos',
      walkMetres: 80,
      walkMin: 1,
      bearingDegrees: 40,
      coordinates: [-0.3845, 39.4828],
      lines: [
        { line: '95', destination: 'Ciutat Arts i Ciències', dueSeconds: 190, isLive: true, vehicleId: 'EMT-7704' },
        { line: 'C2', destination: 'General Elio / Campanar', dueSeconds: 340, isLive: true, vehicleId: 'EMT-8212' },
      ]
    }
  ],
  'Marítim': [
    {
      stopCode: '1780',
      stopName: 'Carrer de Francesc Cubells - Serreria',
      walkMetres: 85,
      walkMin: 1,
      bearingDegrees: 120,
      coordinates: [-0.3340, 39.4645],
      lines: [
        { line: '19', destination: 'Pl. Ajuntament / Estació del Nord', dueSeconds: 140, isLive: true, vehicleId: 'EMT-9214' },
        { line: '92', destination: 'Campanar', dueSeconds: 390, isLive: true, vehicleId: 'EMT-9220' },
      ]
    }
  ]
};

// Fallback generator for stations not explicitly curated in the table above:
export const getStationBusFeeders = (stationName, stationCoords) => {
  if (!stationName) return [];
  // Direct match or partial match
  const direct = STATION_BUS_TRANSFERS[stationName];
  if (direct) return direct;

  const key = Object.keys(STATION_BUS_TRANSFERS).find(k =>
    stationName.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(stationName.toLowerCase())
  );
  if (key) return STATION_BUS_TRANSFERS[key];

  // If coordinates are provided, locate nearest real EMT bus stops from official dataset
  if (stationCoords && Array.isArray(stationCoords) && Array.isArray(REAL_EMT_STOPS) && REAL_EMT_STOPS.length > 0) {
    const nearbyReal = REAL_EMT_STOPS
      .map((stop) => ({ stop, dist: getDistance(stationCoords, stop.coordinates) }))
      .filter((item) => item.dist <= WALK_RADIUS_METRES)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 4);

    if (nearbyReal.length > 0) {
      return nearbyReal.map(({ stop, dist }) => ({
        stopCode: String(stop.stopCode),
        stopName: stop.stopName,
        walkMetres: Math.round(dist),
        walkMin: walkingMinutes(dist),
        bearingDegrees: 90,
        coordinates: stop.coordinates,
        lines: (stop.lines && stop.lines.length > 0 ? stop.lines : ['19', 'C1']).map((l) => ({
          line: String(l),
          destination: 'Centre / Platja',
          dueSeconds: Math.floor(Math.random() * 400) + 90,
          isLive: true,
          vehicleId: `EMT-${Math.floor(Math.random() * 8000) + 1000}`,
        })),
      }));
    }
  }

  // Generic realistic fallback feeder stops around the station coordinates
  const coords = stationCoords || [-0.375, 39.470];
  const lng = coords[0];
  const lat = coords[1];

  return [
    {
      stopCode: `P-${Math.abs(Math.round(lng * 1000) % 900) + 1000}`,
      stopName: `Parada Carrer Major - Feeder ${stationName}`,
      walkMetres: 60,
      walkMin: 1,
      bearingDegrees: 90,
      coordinates: [lng + 0.0006, lat + 0.0004],
      lines: [
        { line: 'C1', destination: 'Centre Històric (Loop)', dueSeconds: 210, isLive: true, vehicleId: 'EMT-8420' },
        { line: '70', destination: 'Alboraia', dueSeconds: 430, isLive: true, vehicleId: 'EMT-7011' },
      ]
    },
    {
      stopCode: `P-${Math.abs(Math.round(lat * 1000) % 900) + 2000}`,
      stopName: `Avinguda Principal - Connexió Metro`,
      walkMetres: 125,
      walkMin: 2,
      bearingDegrees: 270,
      coordinates: [lng - 0.0007, lat - 0.0005],
      lines: [
        { line: '19', destination: 'La Malva-rosa', dueSeconds: 290, isLive: true, vehicleId: 'EMT-9209' },
        { line: '92', destination: 'Campanar', dueSeconds: 540, isLive: true, vehicleId: 'EMT-9219' },
      ]
    }
  ];
};

// Real-time AVL bus vehicle markers for Variant B & C live tracking simulation
export const LIVE_BUS_TELEMETRY = [
  // C1 fleet
  {
    vehicleId: 'EMT-8412',
    line: 'C1',
    lineColor: '#D62828',
    coordinates: [-0.3765, 39.4680],
    bearing: 330,
    speedKmh: 24,
    nextStop: '1002 · Xàtiva - Institut Lluís Vives',
    secondsToNext: 85,
    destination: 'Centre Històric'
  },
  {
    vehicleId: 'EMT-8415',
    line: 'C1',
    lineColor: '#D62828',
    coordinates: [-0.3835, 39.4745],
    bearing: 45,
    speedKmh: 19,
    nextStop: '1120 · Torres de Quart',
    secondsToNext: 140,
    destination: 'Centre Històric'
  },
  {
    vehicleId: 'EMT-8419',
    line: 'C1',
    lineColor: '#D62828',
    coordinates: [-0.3715, 39.4750],
    bearing: 150,
    speedKmh: 22,
    nextStop: '1240 · Tetuan',
    secondsToNext: 170,
    destination: 'Centre Històric'
  },
  // Line 19 fleet
  {
    vehicleId: 'EMT-9201',
    line: '19',
    lineColor: '#1565C0',
    coordinates: [-0.3710, 39.4700],
    bearing: 85,
    speedKmh: 28,
    nextStop: '1248 · Colón - Roger de Lloria',
    secondsToNext: 110,
    destination: 'La Malva-rosa'
  },
  {
    vehicleId: 'EMT-9208',
    line: '19',
    lineColor: '#1565C0',
    coordinates: [-0.3470, 39.4645],
    bearing: 100,
    speedKmh: 34,
    nextStop: '1515 · Av. del Port - Serreria',
    secondsToNext: 180,
    destination: 'La Malva-rosa'
  },
  {
    vehicleId: 'EMT-9214',
    line: '19',
    lineColor: '#1565C0',
    coordinates: [-0.3255, 39.4710],
    bearing: 350,
    speedKmh: 26,
    nextStop: '1602 · Eugènia Viñes - Malva-rosa',
    secondsToNext: 60,
    destination: 'La Malva-rosa'
  },
  // Line 95 fleet (Riverbed)
  {
    vehicleId: 'EMT-7704',
    line: '95',
    lineColor: '#E65100',
    coordinates: [-0.3660, 39.4725],
    bearing: 130,
    speedKmh: 36,
    nextStop: '2130 · Pont de l\'Exposició',
    secondsToNext: 120,
    destination: 'Ciutat Arts i Ciències'
  },
  {
    vehicleId: 'EMT-7711',
    line: '95',
    lineColor: '#E65100',
    coordinates: [-0.3530, 39.4560],
    bearing: 145,
    speedKmh: 30,
    nextStop: '2180 · Ciutat Arts i Ciències (Museu)',
    secondsToNext: 90,
    destination: 'Ciutat Arts i Ciències'
  }
];

export const getBusLine = (id) => EMT_LINES.find(l => l.id.toLowerCase() === String(id).toLowerCase());

export const getAllBusStops = () => {
  return REAL_EMT_STOPS;
};

// Display-only marker offsets (#106), computed once on first use. Real
// coordinates stay on the stop objects; only drawing uses these.
let stopDisplayOffsets = null;
export const getStopDisplayCoordinates = (stop) => {
  if (!stopDisplayOffsets) stopDisplayOffsets = buildDisplayCoordinates(REAL_EMT_STOPS);
  return displayCoordinatesFor(stop, stopDisplayOffsets);
};
