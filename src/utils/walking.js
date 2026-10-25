// Walking-time helpers for the nearest-station notice. Mirrors the native
// app's domain/Walking.kt so the two read identically.

/** 1.25 m/s, about 4.5 km/h. */
export const WALKING_SPEED_MPS = 1.25;
export const SHORT_WALK_MAX_MIN = 5;
export const MEDIUM_WALK_MAX_MIN = 15;

/** Whole minutes to walk `meters`, rounded up, never below 1. */
export const walkingMinutes = (meters) =>
  Math.max(1, Math.ceil(meters / WALKING_SPEED_MPS / 60));

/** "316 m" below 1000 m, otherwise kilometres with one decimal ("1.2 km"). */
export const formatDistance = (meters, language = 'en') => {
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = new Intl.NumberFormat(language, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(meters / 1000);
  return `${km} km`;
};

/** 'short' (<= 5 min), 'medium' (6-15), 'long' (> 15). */
export const walkCategory = (minutes) => {
  if (minutes <= SHORT_WALK_MAX_MIN) return 'short';
  if (minutes <= MEDIUM_WALK_MAX_MIN) return 'medium';
  return 'long';
};
