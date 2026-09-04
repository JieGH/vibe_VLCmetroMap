const fs = require('fs');

const data = JSON.parse(fs.readFileSync('osm_data.json', 'utf8'));

const features = [];
const stations = new Map();

data.elements.forEach(el => {
  if (el.type === 'relation' && el.tags) {
    const lineRef = el.tags.ref || el.tags.name;
    const color = el.tags.colour || '#ffffff';
    
    // Extract route geometries
    let lineCoordinates = [];
    
    el.members.forEach(member => {
      if (member.type === 'way' && member.geometry) {
        // Just extract coordinates. To be precise we might need to order them, 
        // but for a simple visual representation, a MultiLineString works best.
        const coords = member.geometry.map(g => [g.lon, g.lat]);
        
        features.push({
          type: "Feature",
          properties: {
            line: lineRef,
            color: color,
            name: el.tags.name
          },
          geometry: {
            type: "LineString",
            coordinates: coords
          }
        });
      } else if (member.type === 'node' && (member.role === 'stop' || member.role === 'station' || member.role === 'platform')) {
        if (!stations.has(member.ref)) {
          stations.set(member.ref, {
            id: member.ref,
            name: member.tags ? member.tags.name : "Station",
            lat: member.lat,
            lon: member.lon,
            lines: new Set([lineRef])
          });
        } else {
          stations.get(member.ref).lines.add(lineRef);
        }
      }
    });
  }
});

// Since out geom gives nodes directly for ways, but stations might not have lat/lon in the member if it's just a ref, 
// wait, `out geom` does not add lat/lon to node members of a relation unless we specify it.
// Let's modify the process script to extract stations properly or just rely on the line shapes for now.

const geojson = {
  type: "FeatureCollection",
  features: features
};

if (!fs.existsSync('src/data')) {
    fs.mkdirSync('src/data');
}
fs.writeFileSync('src/data/metro_lines.geojson', JSON.stringify(geojson));
console.log('Saved src/data/metro_lines.geojson');
