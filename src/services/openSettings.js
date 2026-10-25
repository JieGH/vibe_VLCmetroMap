// Opens this app's page in Android Settings so a viewer who refused location
// can turn it on. Needs a small native plugin, `AppSettings.open()`, that
// launches ACTION_APPLICATION_DETAILS_SETTINGS for the app's package; see
// docs/android/permissions-rationale.md. Resolves false when the plugin is not
// there, so the snackbar can simply stay on screen.
import { registerPlugin } from '@capacitor/core';

let plugin = null;
const get = () => {
  if (!plugin) plugin = registerPlugin('AppSettings');
  return plugin;
};

export const openAppSettings = async () => {
  try {
    await get().open();
    return true;
  } catch {
    return false;
  }
};
