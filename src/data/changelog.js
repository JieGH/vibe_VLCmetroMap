// What the "What's new" sheet lists, newest first. Add an entry on top for each
// release worth announcing; its id is what marks the banner as seen, so a new
// id brings the banner back for everyone who dismissed the last one.
export const CHANGELOG = [
  {
    id: '2026-10-20',
    date: '2026-10-20',
    en: {
      title: 'Live trains, straight from FGV',
      items: [
        'The iPhone app now reads live arrivals from FGV directly, with a retry for the requests FGV never answers.',
        'The map fills with live trains within seconds of opening, instead of after two minutes.',
        'Stations are now chosen by how many live trains they can see, so more trains show up: about 80% of those due within 20 minutes, up from about 37%.',
        'Trams 8 and 10 are now timed like trams 4 and 6, so their trains sit where they really are.',
        'The website still uses the earlier data source for now, because FGV does not answer our web host. It may show fewer trains than the app.',
      ],
    },
    es: {
      title: 'Trenes en directo, directos desde FGV',
      items: [
        'La app para iPhone lee ahora las llegadas en directo de FGV, con un reintento para las peticiones que FGV nunca responde.',
        'El mapa se llena de trenes en directo a los pocos segundos de abrirlo, en vez de a los dos minutos.',
        'Las estaciones se eligen ahora por cuántos trenes en directo ven, así que aparecen más trenes: cerca del 80 % de los que llegan en 20 minutos, frente al 37 % anterior.',
        'Los tranvías 8 y 10 se ajustan ahora como el 4 y el 6, y sus trenes se colocan donde realmente están.',
        'La web sigue usando por ahora la fuente de datos anterior, porque FGV no responde a nuestro servidor web. Puede mostrar menos trenes que la app.',
      ],
    },
  },
];

export const LATEST_RELEASE_ID = CHANGELOG[0].id;
