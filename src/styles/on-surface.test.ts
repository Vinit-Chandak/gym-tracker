import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

/**
 * Every control reads as a shape on what it stands on (DESIGN.md, Neutral). In light the
 * control surface is the surface itself, and a tray is the surface, so on a card (a box, a
 * list's box, kept actions), filled with that same surface, Save under a select read as a stray
 * word and a segmented tray left its unchosen words bare. There a tray takes surface 2 and a
 * tonal or round button its on-surface fill, in both palettes.
 */

const read = (path: string) =>
  readFileSync(resolve(__dirname, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const palette = read("form-v2/palette.css");
const foundation = read("form-v2/foundation.css");
const globals = read("../app/globals.css");

type Mode = "light" | "dark";
const MODES: Mode[] = ["light", "dark"];

/** The body of the block that `opening` (up to its brace) starts. */
function block(css: string, opening: string): string {
  const start = css.indexOf(opening);
  if (start < 0) throw new Error(`No ${opening}`);
  let depth = 0;
  for (let end = start + opening.length - 1; end < css.length; end++) {
    if (css[end] === "{") depth++;
    else if (css[end] === "}" && --depth === 0) return css.slice(start + opening.length, end);
  }
  throw new Error(`Unclosed ${opening}`);
}

/** A custom property's value as one block declares it. */
function declared(body: string, property: string): string {
  const match = new RegExp(`(?:^|[;{\\s])${property}:\\s*([^;]+);`).exec(body);
  if (!match) throw new Error(`No ${property}`);
  return match[1]!.trim();
}

/**
 * A token's colour in a palette: a semantic name is the mode's own value wherever foundation.css
 * picks it (the light set, and the dark set under both of dark's selectors), and an alias such
 * as the tray's is followed to the token it names.
 */
function colour(mode: Mode, token: string): string {
  const own = new RegExp(`--ov-${mode}-${token}:\\s*([^;]+);`).exec(palette);
  if (own) {
    const picks = foundation.split(`--ov-${token}: var(--ov-${mode}-${token});`).length - 1;
    expect(picks, `foundation.css picks ${mode} ${token}`).toBe(mode === "light" ? 1 : 2);
    return own[1]!.trim();
  }
  const alias = /^var\(--ov-([\w-]+)\)$/.exec(declared(foundation, `--ov-${token}`));
  if (!alias) throw new Error(`No colour for ${token}`);
  return colour(mode, alias[1]!);
}

/** The colour a surface utility gives a token to whatever stands on it. */
function onSurface(mode: Mode, utility: string, token: string): string {
  const named = /^var\(--ov-([\w-]+)\)$/.exec(
    declared(block(globals, `@utility ${utility} {`), `--ov-${token}`),
  );
  if (!named) throw new Error(`${utility} names no token for ${token}`);
  return colour(mode, named[1]!);
}

it("is the trouble: in light the control surface and a tray are the surface itself", () => {
  expect(colour("light", "surface-control")).toBe(colour("light", "surface"));
  expect(colour("light", "tray")).toBe(colour("light", "surface"));
});

it("gives a tray and a tonal button a fill of their own on the ground", () => {
  for (const mode of MODES) {
    const ground = colour(mode, "ground");
    expect(colour(mode, "tray")).not.toBe(ground);
    expect(colour(mode, "surface-control")).not.toBe(ground);
    expect(colour(mode, "surface-control-pressed")).not.toBe(colour(mode, "surface-control"));
  }
});

it("steps a tray and a tonal button a tone off a card, a list's box and kept actions", () => {
  for (const utility of ["box", "box-rows", "sticky-actions"]) {
    const body = block(globals, `@utility ${utility} {`);
    expect(declared(body, "background")).toBe("var(--ov-surface)");
    for (const mode of MODES) {
      const surface = colour(mode, "surface");
      const tonal = onSurface(mode, utility, "surface-control");
      const pressed = onSurface(mode, utility, "surface-control-pressed");
      expect(onSurface(mode, utility, "tray"), `${utility} tray, ${mode}`).not.toBe(surface);
      expect(tonal, `${utility} tonal, ${mode}`).not.toBe(surface);
      expect(pressed, `${utility} pressed, ${mode}`).not.toBe(tonal);
      expect(pressed, `${utility} pressed, ${mode}`).not.toBe(surface);
    }
  }
});

it("keeps dark's lifted control surface on a card, where it already reads", () => {
  expect(onSurface("dark", "box", "surface-control")).toBe(colour("dark", "surface-control"));
  expect(onSurface("light", "box", "surface-control")).toBe(colour("light", "surface-2"));
});

it("names every Tailwind colour it adds from a token", () => {
  expect(declared(block(globals, "@theme inline {"), "--color-tray")).toBe("var(--ov-tray)");
});
