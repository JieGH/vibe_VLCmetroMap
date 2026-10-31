/** The web and native UI use the same fixed Journey API and normalized results. */
export function createJourneyPlanner({ fetchFn = globalThis.fetch,
  baseUrl = import.meta.env?.VITE_NAVIGATION_API_URL || '', timeoutMs = 15000 } = {}) {
  const base = baseUrl.replace(/\/+$/, '');
  const endpoint = base.endsWith('/api/journeys') ? base : `${base}/api/journeys`;
  return async function planJourney(input, { signal } = {}) {
    if (signal?.aborted) throw new DOMException('Journey planning cancelled', 'AbortError');
    const controller = new AbortController();
    let timer, onAbort;
    try {
      const interrupted = new Promise((_, reject) => {
        onAbort = () => { controller.abort(); reject(new DOMException('Journey planning cancelled', 'AbortError')); };
        signal?.addEventListener('abort', onAbort, { once: true });
        timer = setTimeout(() => {
          controller.abort();
          reject(Object.assign(new Error('Journey planning did not answer in time'), { code: 'routing-timeout' }));
        }, timeoutMs);
      });
      const operation = (async () => {
        const response = await fetchFn(endpoint, { method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(input), signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw Object.assign(new Error(payload.error?.message || 'Journey planning unavailable'), {
          code: payload.error?.code || 'routing-unavailable',
        });
        if (!['ok', 'no-route', 'walking-limit'].includes(payload.status) || !Array.isArray(payload.journeys) || !Number.isFinite(payload.generatedAt)) {
          throw Object.assign(new Error('Journey planning returned an invalid response'), { code: 'routing-unavailable' });
        }
        return payload;
      })();
      return await Promise.race([operation, interrupted]);
    } catch (error) {
      if (error.name === 'AbortError' || error.code) throw error;
      throw Object.assign(new Error('Journey planning unavailable'), { code: 'routing-unavailable' });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      controller.abort();
    }
  };
}
