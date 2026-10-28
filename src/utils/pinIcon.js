/**
 * The one pin look (ADR-0013): a flat green ball on a thin flat green stick, nothing else (no gloss,
 * gradient, halo or shadow). The tip of the stick (bottom centre of the box) is the anchor point.
 */
export const PIN_WIDTH = 22;
export const PIN_HEIGHT = 35;
export const PIN_GREEN = '#1fa355';

const CX = PIN_WIDTH / 2;
const R = 8;
const BALL_Y = R + 1;

export const pinSvg = () => `<svg class="map-pin-svg" xmlns="http://www.w3.org/2000/svg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 ${PIN_WIDTH} ${PIN_HEIGHT}" aria-hidden="true" focusable="false" style="display:block;overflow:visible"><path d="M${CX} ${BALL_Y} L${CX} ${PIN_HEIGHT}" fill="none" stroke="${PIN_GREEN}" stroke-width="2"/><circle cx="${CX}" cy="${BALL_Y}" r="${R}" fill="${PIN_GREEN}"/></svg>`;

/** Wrapper markup: the inner span carries the (optional) drop animation so the outer element's transform stays free. */
export const pinMarkup = () => `<span class="map-pin-drop" style="display:block;line-height:0">${pinSvg()}</span>`;

/** Inline style shared by the geographic marker and the screen-fixed overlay. */
export const pinWrapperStyle = `display:block;width:${PIN_WIDTH}px;height:${PIN_HEIGHT}px;line-height:0;user-select:none;`;
