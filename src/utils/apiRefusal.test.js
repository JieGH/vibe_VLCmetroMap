import { describe, it, expect, vi } from 'vitest';
import {
  classifyFetchFailure,
  createRefusalTracker,
  REFUSAL_WINDOW_MS,
  BACKOFF_FIRST_MS,
  BACKOFF_MAX_MS,
} from './apiRefusal';

describe('classifyFetchFailure', () => {
  it.each([401, 403, 451])('HTTP %i is blocked', (status) => {
    expect(classifyFetchFailure({ status })).toEqual({ kind: 'blocked', status });
  });

  it('HTTP 429 is rate-limited, not blocked', () => {
    expect(classifyFetchFailure({ status: 429 })).toEqual({ kind: 'rate-limited', status: 429 });
  });

  it.each([500, 502, 504])('HTTP %i is a server error, even with an HTML body', (status) => {
    expect(classifyFetchFailure({ status, body: '<html>Bad gateway</html>' }))
      .toEqual({ kind: 'server-error', status });
  });

  it('a 200 answer whose body is an HTML page is blocked', () => {
    expect(classifyFetchFailure({ status: 200, body: '<!doctype html><title>Access denied</title>' }))
      .toEqual({ kind: 'blocked', status: 200 });
  });

  it('a 4xx answer with a non-JSON body is blocked', () => {
    expect(classifyFetchFailure({ status: 404, body: '<html>captcha</html>' }))
      .toEqual({ kind: 'blocked', status: 404 });
  });

  it('a CDN challenge header is blocked whatever the status', () => {
    const headers = { get: (h) => (h.toLowerCase() === 'cf-mitigated' ? 'challenge' : null) };
    expect(classifyFetchFailure({ status: 200, headers })).toEqual({ kind: 'blocked', status: 200 });
  });

  it('an empty body is no evidence of a block page', () => {
    expect(classifyFetchFailure({ status: 404, body: '' }).kind).toBe('server-error');
  });

  it('a JSON body on a good status is not a failure', () => {
    expect(classifyFetchFailure({ status: 200, body: '{"previsiones":[]}' })).toBeNull();
  });

  it('a timeout is unreachable, never blocked', () => {
    const err = new DOMException('aborted', 'AbortError');
    expect(classifyFetchFailure({ error: err })).toEqual({ kind: 'unreachable', status: null });
  });

  it('a network error is unreachable', () => {
    expect(classifyFetchFailure({ error: new TypeError('Failed to fetch') }))
      .toEqual({ kind: 'unreachable', status: null });
  });
});

describe('createRefusalTracker', () => {
  const setup = () => {
    let t = 1_000_000;
    const tracker = createRefusalTracker({ now: () => t });
    return { tracker, advance: (ms) => { t += ms; }, clock: () => t };
  };

  it('one blocked answer is not enough', () => {
    const { tracker } = setup();
    tracker.recordFailure('blocked', 'a');
    expect(tracker.isRefused()).toBe(false);
  });

  it('two blocked answers from the same station are not enough', () => {
    const { tracker } = setup();
    tracker.recordFailure('blocked', 'a');
    tracker.recordFailure('blocked', 'a');
    expect(tracker.isRefused()).toBe(false);
  });

  it('two blocked answers from two stations inside the window turn it on', () => {
    const { tracker, advance } = setup();
    tracker.recordFailure('blocked', 'a');
    advance(10_000);
    tracker.recordFailure('blocked', 'b');
    expect(tracker.isRefused()).toBe(true);
  });

  it('evidence older than the window does not count', () => {
    const { tracker, advance } = setup();
    tracker.recordFailure('blocked', 'a');
    advance(REFUSAL_WINDOW_MS + 1);
    tracker.recordFailure('blocked', 'b');
    expect(tracker.isRefused()).toBe(false);
  });

  it('rate limits, timeouts and server errors never count', () => {
    const { tracker } = setup();
    for (const kind of ['rate-limited', 'unreachable', 'server-error']) {
      tracker.recordFailure(kind, 'a');
      tracker.recordFailure(kind, 'b');
      tracker.recordFailure(kind, 'c');
    }
    expect(tracker.isRefused()).toBe(false);
  });

  it('a success between the two blocked answers clears the evidence', () => {
    const { tracker } = setup();
    tracker.recordFailure('blocked', 'a');
    tracker.recordSuccess();
    tracker.recordFailure('blocked', 'b');
    expect(tracker.isRefused()).toBe(false);
  });

  it('one success turns it off again', () => {
    const { tracker } = setup();
    tracker.recordFailure('blocked', 'a');
    tracker.recordFailure('blocked', 'b');
    expect(tracker.isRefused()).toBe(true);
    tracker.recordSuccess();
    expect(tracker.isRefused()).toBe(false);
  });

  it('tells listeners only when the state flips', () => {
    const { tracker } = setup();
    const onChange = vi.fn();
    tracker.subscribe(onChange);
    tracker.recordFailure('blocked', 'a');
    tracker.recordFailure('blocked', 'b');
    tracker.recordFailure('blocked', 'c');
    expect(onChange).toHaveBeenCalledTimes(1);
    tracker.recordSuccess();
    tracker.recordSuccess();
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  describe('backoff while refused', () => {
    const refuse = (s) => {
      s.tracker.recordFailure('blocked', 'a');
      s.tracker.recordFailure('blocked', 'b');
    };

    it('lets everything through while not refused', () => {
      const { tracker } = setup();
      expect(tracker.tryAcquire()).toBe(true);
      expect(tracker.tryAcquire()).toBe(true);
    });

    it('waits 30 s, then lets exactly one probe through', () => {
      const s = setup();
      refuse(s);
      expect(s.tracker.tryAcquire()).toBe(false);
      s.advance(BACKOFF_FIRST_MS - 1);
      expect(s.tracker.tryAcquire()).toBe(false);
      s.advance(1);
      expect(s.tracker.tryAcquire()).toBe(true);
      expect(s.tracker.tryAcquire()).toBe(false);
    });

    it('doubles the wait after each failed probe, capped at 5 minutes', () => {
      const s = setup();
      refuse(s);
      let wait = BACKOFF_FIRST_MS;
      const waits = [];
      for (let i = 0; i < 8; i++) {
        s.advance(wait);
        expect(s.tracker.tryAcquire()).toBe(true);
        s.tracker.recordFailure('blocked', 'a');
        waits.push(s.tracker.retryInMs());
        wait = s.tracker.retryInMs();
      }
      expect(waits.slice(0, 3)).toEqual([60_000, 120_000, 240_000]);
      expect(Math.max(...waits)).toBe(BACKOFF_MAX_MS);
    });

    it('sends far fewer requests than an unbacked-off 10 s poll over 10 minutes', () => {
      const s = setup();
      refuse(s);
      let sent = 0;
      for (let sec = 0; sec < 600; sec += 10) {
        s.advance(10_000);
        if (s.tracker.tryAcquire()) { sent += 1; s.tracker.recordFailure('blocked', 'a'); }
      }
      expect(sent).toBeLessThanOrEqual(5);
    });

    it('a forced refresh goes through at once and the success clears the backoff', () => {
      const s = setup();
      refuse(s);
      expect(s.tracker.tryAcquire()).toBe(false);
      expect(s.tracker.tryAcquire({ force: true })).toBe(true);
      s.tracker.recordSuccess();
      expect(s.tracker.tryAcquire()).toBe(true);
      expect(s.tracker.tryAcquire()).toBe(true);
    });

    it('canAttempt peeks without using the probe', () => {
      const s = setup();
      refuse(s);
      s.advance(BACKOFF_FIRST_MS);
      expect(s.tracker.canAttempt()).toBe(true);
      expect(s.tracker.canAttempt()).toBe(true);
      expect(s.tracker.tryAcquire()).toBe(true);
      expect(s.tracker.canAttempt()).toBe(false);
    });
  });
});
