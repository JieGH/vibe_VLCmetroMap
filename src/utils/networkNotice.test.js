import { describe, it, expect } from 'vitest';
import { pickNetworkNotice } from './networkNotice';

describe('pickNetworkNotice', () => {
  it('says nothing when all is well in Spain', () => {
    expect(pickNetworkNotice({ outsideSpain: false, trainOk: true, busOk: true })).toBeNull();
  });

  it('warns about times when data loads but the connection is outside Spain', () => {
    expect(pickNetworkNotice({ outsideSpain: true, trainOk: true, busOk: true })).toBe('outsideSpain');
    expect(pickNetworkNotice({ outsideSpain: true, trainOk: false, busOk: true })).toBe('outsideSpain');
  });

  it('points at the connection or the provider when neither feed loads outside Spain', () => {
    expect(pickNetworkNotice({ outsideSpain: true, trainOk: false, busOk: false })).toBe('noLiveOutside');
  });

  it('points at the provider when neither feed loads inside Spain', () => {
    expect(pickNetworkNotice({ outsideSpain: false, trainOk: false, busOk: false })).toBe('noLiveProvider');
  });

  it('stays quiet when only one feed is down in Spain (the status panel covers that)', () => {
    expect(pickNetworkNotice({ outsideSpain: false, trainOk: false, busOk: true })).toBeNull();
    expect(pickNetworkNotice({ outsideSpain: false, trainOk: true, busOk: false })).toBeNull();
  });
});
