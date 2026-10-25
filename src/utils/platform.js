import { Capacitor } from '@capacitor/core';

/**
 * True only inside the native Android app (Capacitor's Android shell). The web
 * build, including a phone's Chrome, and the iOS app answer false, so the
 * Material 3 design stays exclusive to the Android app.
 */
export const isAndroid = () => {
  try {
    return Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
};
