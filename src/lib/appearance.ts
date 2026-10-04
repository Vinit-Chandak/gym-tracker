/**
 * Light/dark appearance. One design (Form v2), three preferences: System, Light and Dark.
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

const APPEARANCE_CHANGE_EVENT = "overload:appearance-change";
// A denied write must not make the visible choice disagree with the document, or let
// metadata updates on navigation undo it. This fallback lasts for the current tab.
let transientAppearance: Appearance | null = null;

/** Browser chrome colours: Form v2's two grounds, kept in step with styles/form-v2/palette.css. */
export const CANVAS_LIGHT = "#ffffff";
export const CANVAS_DARK = "#111214";

function parseAppearance(value: unknown): Appearance {
  return APPEARANCE_MODES.includes(value as Appearance) ? (value as Appearance) : "system";
}

export function readStoredAppearance(): Appearance {
  if (transientAppearance !== null) return transientAppearance;
  try {
    return parseAppearance(localStorage.getItem(APPEARANCE_STORAGE_KEY));
  } catch {
    // Storage blocked or full: System is the documented fallback.
    return "system";
  }
}

/** Paint and publish a choice even when browser storage is unavailable. */
export function chooseAppearance(mode: Appearance): void {
  transientAppearance = mode;
  applyAppearance(mode);
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
    transientAppearance = null;
  } catch {
    // Keep the in-memory choice until a successful write or a change from another tab.
  }
  window.dispatchEvent(new Event(APPEARANCE_CHANGE_EVENT));
}

/** Both the label and palette follow changes made here or in another open tab. */
export function subscribeAppearance(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== null && event.key !== APPEARANCE_STORAGE_KEY) return;
    transientAppearance = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(APPEARANCE_CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(APPEARANCE_CHANGE_EVENT, listener);
  };
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
