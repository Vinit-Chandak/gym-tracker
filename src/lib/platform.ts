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

/**
 * The reader's text size, in the app installed on an iPhone or iPad.
 *
 * Every word follows the root font size (foundation.css), but iOS passes its Larger Text setting
 * (Dynamic Type) to a web page only through its own font keywords, and the installed app has no
 * browser menu or page zoom to enlarge text instead. So the installed app measures
 * `-apple-system-body`, 17 pt at the standard setting, and gives the root the same proportion of
 * 16 px: 16 at the standard setting, larger as the setting grows. It stops at 32 px, the 200% the
 * layouts are drawn for (the accessibility sizes reach about 310%), and never goes under 16, the
 * size the design is drawn at. A setting changed while the app was in the background is read
 * again as it comes back. A browser tab keeps the browser's own text size, and Android's setting
 * arrives through the text-scale meta tag (layout.tsx). Any failure leaves the browser's size.
 */
export const TEXT_SIZE_INIT_SCRIPT = `try{if(navigator.standalone===true){var r=document.documentElement,s=function(){var p=document.createElement("span");p.style.font="-apple-system-body";p.style.position="absolute";p.style.visibility="hidden";r.appendChild(p);var b=parseFloat(getComputedStyle(p).fontSize);p.remove();var x=Math.min(32,Math.max(16,(16*b)/17));if(x>16)r.style.fontSize=x+"px";else r.style.removeProperty("font-size")};s();document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")s()})}}catch(e){}`;
