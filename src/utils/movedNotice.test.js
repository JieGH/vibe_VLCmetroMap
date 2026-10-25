import { describe, it, expect } from 'vitest';
import { newAddressFor, MOVED_REMIND_MS } from './movedNotice';

const at = (hostname, pathname = '/', search = '', hash = '') => ({ hostname, pathname, search, hash });

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

describe('reminder', () => {
  it('comes back after an hour', () => {
    expect(MOVED_REMIND_MS).toBe(60 * 60 * 1000);
  });
});
