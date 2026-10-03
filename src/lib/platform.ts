/**
 * The platform the app is running on, where the design differs by it: Android's targets are
 * 48 dp, iOS's 44 pt (DESIGN.md, Components). foundation.css keys the larger targets off this
 * attribute, so the first paint already has them.
 */
export const PLATFORM_ATTRIBUTE = "data-overload-platform";

/**
 * Runs before the first paint, beside the appearance initializer. It reads the user agent and
 * sets one attribute; any failure leaves the iOS sizes, which are the smaller of the two.
 */
export const PLATFORM_INIT_SCRIPT = `try{if(/Android/i.test(navigator.userAgent)){document.documentElement.setAttribute(${JSON.stringify(
  PLATFORM_ATTRIBUTE,
)},"android")}}catch(e){}`;
