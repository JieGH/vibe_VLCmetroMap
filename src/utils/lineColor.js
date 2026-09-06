// The sampled-from-the-official-map color for a Line, by id.
//
// Not the same lookup as MapView's `lineColorMap`, which layers these same
// image colors as overrides on top of colors read from the track GeoJSON —
// that richer merge only makes sense where the map already has GeoJSON
// features loaded. Surfaces with no such geometry (the Station panel, the
// Dashboard board) just want the flat image-sampled color with a grey
// fallback, which is what this is.
import lineColors from '../data/line_colors_from_image.json';

export const FALLBACK_LINE_COLOR = '#8a8a8a';

export const lineColor = (id) => lineColors[String(id)] || FALLBACK_LINE_COLOR;

export default lineColor;
