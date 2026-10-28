// Buses offered before anything is typed (#142): the lines people use to get between the main train
// stations and the city centre. The first five serve Plaça de l'Ajuntament, Estació del Nord and
// Joaquín Sorolla alike; the rest link Nord and the square. Picked from emt_stops.json stop
// proximity; popularBus.test.js keeps them honest against that data. The data has no night lines yet,
// so none are listed (nothing is invented, ADR-0011).
export const POPULAR_BUS_LINE_IDS = ['10', '31', '8', '9', '59', '70', '11', '7', '6'];
