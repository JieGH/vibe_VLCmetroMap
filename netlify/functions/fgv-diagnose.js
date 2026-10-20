// TEMPORARY diagnostic: why can't this function reach FGV? Delete after use.
const FGV = 'https://www.fgv.es/fgv/app/es/api/v1/V/horarios-prevision-3/17';
const BROWSER = {
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Referer': 'https://www.fgv.es/',
  'Origin': 'https://www.fgv.es',
};

async function probe(name, url, headers = {}) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(7000) });
    const text = await res.text();
    return { name, ok: true, status: res.status, ms: Date.now() - started, bytes: text.length, head: text.slice(0, 80) };
  } catch (err) {
    return { name, ok: false, ms: Date.now() - started, error: String(err.name), cause: err.cause && (err.cause.code || String(err.cause)) };
  }
}

export default async () => {
  const results = await Promise.all([
    probe('fgv-endpoint default headers', FGV, { Accept: 'application/json' }),
    probe('fgv-endpoint browser headers', FGV, BROWSER),
    probe('fgv homepage', 'https://www.fgv.es/'),
    probe('alexbadi relay', 'https://metroapi.alexbadi.es/prevision/17/parse', { 'User-Agent': 'vib-metro-valencia/1.0 (Web; contact=dev@example.com)' }),
    probe('outbound ip', 'https://api.ipify.org?format=json'),
  ]);
  return new Response(JSON.stringify({ region: process.env.AWS_REGION, node: process.version, results }, null, 1), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const config = { path: '/api/diag' };
