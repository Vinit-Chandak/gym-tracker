/**
 * The platform the app is running on, where the design differs by it: Android's targets are
 * 48 dp, iOS's 44 pt (DESIGN.md, Components). foundation.css keys the larger targets off this
 * attribute, so the first paint already has them.
 */
export const PLATFORM_ATTRIBUTE = "data-overload-platform";

/**
 * Present when the app was opened from the home screen rather than in a browser tab. The
 * installed app on iOS needs its page as tall as the screen (globals.css), and is the only place
 * the viewport is watched for coming back short after the keyboard (ViewportSettle).
 */
export const STANDALONE_ATTRIBUTE = "data-overload-standalone";

/**
 * Runs before the first paint, beside the appearance initializer. It reads the user agent and
 * the display mode and sets an attribute for each; any failure leaves the iOS sizes, which are
 * the smaller of the two, and a browser tab. iOS reports a home-screen launch its own way.
 */
export const PLATFORM_INIT_SCRIPT = `try{if(/Android/i.test(navigator.userAgent)){document.documentElement.setAttribute(${JSON.stringify(
  PLATFORM_ATTRIBUTE,
)},"android")}if(navigator.standalone===true||matchMedia("(display-mode: standalone)").matches){document.documentElement.setAttribute(${JSON.stringify(
  STANDALONE_ATTRIBUTE,
)},"")}}catch(e){}`;
