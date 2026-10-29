// EMT bus rows say "Arriving" only at 20 s or less. Metro keeps the shared 30 s rule in countdownHeat.js.

export const BUS_ARRIVING_MAX_SECONDS = 20;

export const isBusArriving = (seconds) => Number.isFinite(seconds) && seconds <= BUS_ARRIVING_MAX_SECONDS;

export const busCountdownLabel = (seconds, dueLabel = 'Arriving') => {
  if (isBusArriving(seconds)) return dueLabel;
  if (seconds < 60) return String(Math.round(seconds));
  return String(Math.round(seconds / 60));
};

export const busCountdownUnit = (seconds) => {
  if (isBusArriving(seconds)) return null;
  if (seconds < 60) return 'sec';
  return 'min';
};
