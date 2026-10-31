import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * JourneyGuidance bridge V1. Every operation reports actual OS capability;
 * registering a JS proxy is not evidence that a native implementation exists.
 *
 * Session: {version:1,id,journey,legIndex,callIndex,boardingConfirmed,
 * progressSource,startedAt,updatedAt,scheduleOffset,soundEnabled,labels}.
 * Call indices include leg.from, intermediateStops, and leg.to.
 */
export function createJourneyNativeAdapter({
  isNative = () => Capacitor.isNativePlatform(),
  isAvailable = () => Capacitor.isPluginAvailable('JourneyGuidance'),
  platform = () => Capacitor.getPlatform(),
  plugin = null,
} = {}) {
  let bridge = plugin;
  const invoke = async (operation, input) => {
    if (!isNative()) return { supported: false, status: 'unavailable', platform: 'web', session: null };
    try {
      if (!bridge) {
        if (!isAvailable()) return { supported: false, status: 'unavailable', platform: platform(), session: null };
        bridge = registerPlugin('JourneyGuidance');
      }
      if (typeof bridge[operation] !== 'function') return { supported: false, status: 'unavailable', platform: platform(), session: null };
      const result = await bridge[operation](input);
      return { ...result, supported: result?.supported === true, platform: platform() };
    } catch (error) {
      const denied = /denied|permission/i.test(String(error?.message || ''));
      return { supported: false, status: denied ? 'denied' : 'unavailable', platform: platform(), session: null };
    }
  };
  return {
    startSession: input => invoke('startSession', input),
    updateSession: input => invoke('updateSession', input),
    stopSession: input => invoke('stopSession', input),
    getSession: () => invoke('getSession'),
    requestPermissions: () => invoke('requestPermissions'),
  };
}

export default createJourneyNativeAdapter();
