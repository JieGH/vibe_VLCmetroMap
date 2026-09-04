const fs = require('fs');
const https = require('https');

const query = `
[out:json][timeout:25];
relation["network"="Metrovalencia"]["route"~"train|subway|light_rail|tram"];
out geom;
`;

const postData = 'data=' + encodeURIComponent(query);

const options = {
  hostname: 'overpass-api.de',
  path: '/api/interpreter',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    fs.writeFileSync('osm_data.json', data);
    console.log('Saved osm_data.json');
  });
});

req.on('error', (e) => console.error(e));
req.write(postData);
req.end();
