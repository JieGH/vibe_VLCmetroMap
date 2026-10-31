import { describe, expect, it, vi } from 'vitest';
import { createJourneyPlanner } from './journeyPlanner';

const input = { from: { name: 'Xàtiva', coordinates: [-0.377, 39.467] },
  to: { name: 'Benimaclet', coordinates: [-0.363, 39.485] }, departureTime: '2026-10-31T11:00:00Z' };

describe('Journey planner client boundary', () => {
  it('plans only on request through the configured native backend and returns Journey alternatives', async () => {
    const payload = { status: 'ok', generatedAt: 1, journeys: [{ id: 'journey-1', legs: [] }] };
    const fetchFn = vi.fn(async () => Response.json(payload));
    const plan = createJourneyPlanner({ baseUrl: 'https://routing.example.test/', fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
    await expect(plan(input)).resolves.toEqual(payload);
    expect(fetchFn).toHaveBeenCalledWith('https://routing.example.test/api/journeys', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(input),
    }));
  });

  it('preserves actionable server failures and rejects malformed or unreachable routing responses', async () => {
    const expired = createJourneyPlanner({ fetchFn: async () => Response.json({ error: { code: 'calendar-expired', message: 'Refresh schedules' } }, { status: 422 }) });
    await expect(expired(input)).rejects.toMatchObject({ code: 'calendar-expired', message: 'Refresh schedules' });
    const malformed = createJourneyPlanner({ fetchFn: async () => Response.json({ journeys: [] }) });
    await expect(malformed(input)).rejects.toMatchObject({ code: 'routing-unavailable' });
    const unavailable = createJourneyPlanner({ fetchFn: async () => { throw new TypeError('Network failed'); } });
    await expect(unavailable(input)).rejects.toMatchObject({ code: 'routing-unavailable' });
  });

  it('ends slow planning and lets a passenger cancel without receiving a stale route', async () => {
    vi.useFakeTimers();
    try {
      let upstreamSignal;
      const plan = createJourneyPlanner({ timeoutMs: 100, fetchFn: (_url, { signal }) => {
        upstreamSignal = signal; return new Promise(() => {});
      } });
      const pending = plan(input);
      const checked = expect(pending).rejects.toMatchObject({ code: 'routing-timeout' });
      await vi.advanceTimersByTimeAsync(100);
      await checked;
      expect(upstreamSignal.aborted).toBe(true);
      const controller = new AbortController();
      const cancelled = plan(input, { signal: controller.signal });
      controller.abort();
      await expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    } finally { vi.useRealTimers(); }
  });
});
