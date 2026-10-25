import { describe, it, expect } from 'vitest';
import { newAddressFor, isPostponed, postpone, MOVED_POSTPONE_MS, MOVED_POSTPONED_KEY } from './movedNotice';

const at = (hostname, pathname = '/', search = '', hash = '') => ({ hostname, pathname, search, hash });
const memory = () => { const d = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = String(v); }, d }; };

describe('newAddressFor', () => {
  it('sends the retired Netlify and workers.dev addresses to xarxa.net, keeping the page', () => {
    expect(newAddressFor(at('tangerine-panda-1aeea5.netlify.app', '/', '?mode=dashboard', '#x'))).toBe('https://xarxa.net/?mode=dashboard#x');
    expect(newAddressFor(at('vibe-vlcmetromap.jie-lei-contact.workers.dev'))).toBe('https://xarxa.net/');
  });
  it('says nothing on the new address, localhost or a LAN address', () => {
    for (const host of ['xarxa.net', 'www.xarxa.net', 'localhost', '127.0.0.1', '192.168.8.152']) {
      expect(newAddressFor(at(host))).toBeNull();
    }
  });
});

describe('postponing', () => {
  it('honours "not now" for a day, then asks again', () => {
    const storage = memory();
    expect(isPostponed(1000, storage)).toBe(false);
    postpone(1000, storage);
    expect(isPostponed(1000 + MOVED_POSTPONE_MS - 1, storage)).toBe(true);
    expect(isPostponed(1000 + MOVED_POSTPONE_MS, storage)).toBe(false);
    expect(storage.d[MOVED_POSTPONED_KEY]).toBe('1000');
  });
  it('asks again when storage is unreadable', () => {
    expect(isPostponed(1, { getItem: () => { throw new Error('blocked'); } })).toBe(false);
  });
});
