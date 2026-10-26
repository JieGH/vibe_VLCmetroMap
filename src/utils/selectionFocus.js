// True when a real metro station or EMT stop is selected (not a ping /
// "Where you're at" pin). Drives the fade-others state in GPS and ping modes.
export const hasMapSelection = (selectedStation, selectedBusStop) => {
  if (selectedBusStop) return true;
  if (!selectedStation) return false;
  const name = selectedStation.properties?.name;
  return !(
    selectedStation.isPin ||
    selectedStation.properties?.isPin ||
    name === 'Map Ping' ||
    name === "Where you're at"
  );
};

// An EMT stop is selected and no real metro station is: every train fades (#114).
// With a metro station selected the line-based rule (lineDim.js) applies instead.
export const fadesAllVehicles = (selectedStation, selectedBusStop) =>
  Boolean(selectedBusStop) && !hasMapSelection(selectedStation, null);
