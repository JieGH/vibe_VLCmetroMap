// The two hub places (the dropped map pin and the GPS "Where you're at") are told apart in code by these
// English names, so they must not change. What the person reads is the translation.
export const MAP_PING_NAME = 'Map Ping';
export const WHERE_YOURE_AT_NAME = "Where you're at";

/** The name to show for a station or hub: hubs are translated, real stations keep their own name. */
export const hubDisplayName = (name, t) => {
  if (name === WHERE_YOURE_AT_NAME) return t('hub.whereYoureAt');
  if (name === MAP_PING_NAME) return t('hub.mapPing');
  return name;
};
