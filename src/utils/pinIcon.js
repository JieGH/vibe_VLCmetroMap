/**
 * The one pin look (ADR-0013): a green ball on a thin green stick. The tip of the stick (bottom centre of
 * the box) is the anchor point. A white halo keeps it readable on both the light and dark map; flat fills
 * (no gradient ids) so several copies can sit in the DOM safely.
 */
export const PIN_WIDTH = 28;
export const PIN_HEIGHT = 44;
export const PIN_GREEN = '#22a559';
export const PIN_GREEN_DARK = '#117a3d';

const STICK = 'M12.7 19 L15.3 19 L14 44 Z';

export const pinSvg = () => `<svg class="map-pin-svg" xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 ${PIN_WIDTH} ${PIN_HEIGHT}" aria-hidden="true" focusable="false" style="display:block;overflow:visible"><g stroke="#fff" stroke-width="3" stroke-linejoin="round" fill="#fff"><circle cx="14" cy="13" r="10.5"/><path d="${STICK}"/></g><path d="${STICK}" fill="${PIN_GREEN_DARK}" stroke="${PIN_GREEN_DARK}" stroke-width="0.8" stroke-linejoin="round"/><circle cx="14" cy="13" r="10.5" fill="${PIN_GREEN}" stroke="${PIN_GREEN_DARK}" stroke-width="1.2"/><ellipse cx="10.6" cy="9.4" rx="3.6" ry="2.6" fill="#fff" fill-opacity="0.38" transform="rotate(-30 10.6 9.4)"/></svg>`;

/** Inline style shared by the geographic marker and the screen-fixed overlay. */
export const pinWrapperStyle = `display:block;width:${PIN_WIDTH}px;height:${PIN_HEIGHT}px;line-height:0;user-select:none;filter:drop-shadow(0 2px 2.5px rgba(0,0,0,0.38));`;
