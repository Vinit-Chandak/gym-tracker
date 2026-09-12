/**
 * Light/dark appearance. One design (Form), three preferences: System, Light and Dark.
 *
 * The palette itself is chosen in CSS — `system` is the plain `prefers-color-scheme`
 * media query in foundation.css, so the common case needs no JavaScript at all. Only an
 * explicit override needs a marker on the document, which is what the initializer below
 * writes. The preference is device-local: no profile column, no request, no cookie, and
 * nothing about a workout or account goes in it.
 */

export const APPEARANCE_MODES = ["system", "light", "dark"] as const;

export type Appearance = (typeof APPEARANCE_MODES)[number];

export const APPEARANCE_LABELS: Record<Appearance, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export const APPEARANCE_STORAGE_KEY = "overload:appearance";

/** The document attribute foundation.css keys the explicit palettes off. */
export const APPEARANCE_ATTRIBUTE = "data-overload-mode";

/** Browser chrome colours. These are Form's two canvases, kept in step with form.css. */
export const CANVAS_LIGHT = "#f4f3ee";
export const CANVAS_DARK = "#171c1c";

function parseAppearance(value: unknown): Appearance {
  return APPEARANCE_MODES.includes(value as Appearance) ? (value as Appearance) : "system";
}

export function readStoredAppearance(): Appearance {
  try {
    return parseAppearance(localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    // Storage blocked or full: System is the documented fallback.
    return "system";
  }
}

/**
 * Browser theme-color for an explicit choice.
 *
 * Keep Next's two metadata nodes in place. React can adopt a manually inserted meta during
 * hydration; removing it later makes route navigation try to remove an already detached node.
 * For an explicit choice both scheme entries use that colour; System restores each default.
 */
function overrideThemeColor(color: string | null): void {
  for (const meta of document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    if (meta.getAttribute("media") === "(prefers-color-scheme: light)")
      meta.content = color ?? CANVAS_LIGHT;
    if (meta.getAttribute("media") === "(prefers-color-scheme: dark)")
      meta.content = color ?? CANVAS_DARK;
  }
}

/** Applies a mode to the live document. Colour only: no reload, refetch or remount. */
export function applyAppearance(mode: Appearance): void {
  const root = document.documentElement;
  if (mode === "system") {
    root.removeAttribute(APPEARANCE_ATTRIBUTE);
    overrideThemeColor(null);
  } else {
    root.setAttribute(APPEARANCE_ATTRIBUTE, mode);
    overrideThemeColor(mode === "dark" ? CANVAS_DARK : CANVAS_LIGHT);
  }
}

/**
 * Runs synchronously before the first paint, from the top of the body.
 *
 * Deliberately bounded: it reads one short string and sets one attribute.
 * It imports nothing, queries no layout and waits for no hydration, so it cannot
 * become the reason the first screen is late. Any failure leaves System in place.
 */
export const APPEARANCE_INIT_SCRIPT = `try{var m=localStorage.getItem(${JSON.stringify(
  APPEARANCE_STORAGE_KEY,
)});if(m==="light"||m==="dark"){document.documentElement.setAttribute(${JSON.stringify(
  APPEARANCE_ATTRIBUTE,
)},m)}}catch(e){}`;
