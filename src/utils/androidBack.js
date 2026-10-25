// What the Android system back button does, as a pure decision. The first
// open layer wins, top-most first, so back peels the interface one layer at a
// time and only leaves the app when nothing is left to close.
export const BACK_PRIORITY = [
  ['rationaleOpen', 'decline-rationale'],
  ['feedbackOpen', 'close-feedback'],
  ['downloadOpen', 'close-download'],
  ['aboutOpen', 'close-about'],
  ['welcomeVisible', 'dismiss-welcome'],
  ['dashboardMode', 'exit-dashboard'],
  ['searchFocused', 'close-search'],
  ['sidebarOpen', 'close-sidebar'],
  ['stationOpen', 'close-station'],
  ['lineFilterActive', 'clear-filter'],
];

/**
 * @param {object} state booleans named in BACK_PRIORITY
 * @returns {string} an action name, or 'exit' when nothing is open
 */
export const resolveBackAction = (state = {}) => {
  for (const [flag, action] of BACK_PRIORITY) {
    if (state[flag]) return action;
  }
  return 'exit';
};
