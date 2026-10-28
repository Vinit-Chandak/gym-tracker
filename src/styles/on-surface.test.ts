import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

/**
 * Every control reads as a shape on what it stands on (DESIGN.md, Neutral). In light the
 * control surface is the surface itself, and a tray is the surface, so on a card filled with that
 * same surface, Save under a select read as a stray word and a segmented tray left its unchosen
 * words bare; a waiting button is the surface too, so Saving… lost its shape. A card is the
 * panel's white on the grey ground (DESIGN.md, The One Card Rule; owner, 28 October 2026), and
 * what stands in it steps back to the ground's tone; kept actions stand on the ground itself.
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

it("is the trouble: in light the control surface, a tray and a wait are the surface itself", () => {
  expect(colour("light", "surface-control")).toBe(colour("light", "surface"));
  expect(colour("light", "tray")).toBe(colour("light", "surface"));
  for (const mode of MODES) expect(colour(mode, "waiting")).toBe(colour(mode, "surface"));
});

it("gives a tray, a waiting button and a tonal button a fill of their own on the ground", () => {
  for (const mode of MODES) {
    const ground = colour(mode, "ground");
    expect(colour(mode, "tray")).not.toBe(ground);
    expect(colour(mode, "waiting")).not.toBe(ground);
    expect(colour(mode, "surface-control")).not.toBe(ground);
    expect(colour(mode, "surface-control-pressed")).not.toBe(colour(mode, "surface-control"));
  }
});

it("stands a card in the panel's white, and what stands in it a step back to the ground", () => {
  for (const utility of ["box", "box-rows"]) {
    const body = block(globals, `@utility ${utility} {`);
    expect(declared(body, "background"), utility).toBe("var(--ov-panel)");
  }
  // Kept actions stand on the ground itself, so the fills that stand off the ground hold.
  const kept = block(globals, "@utility sticky-actions {");
  expect(declared(kept, "background")).toBe("var(--ov-ground)");
  for (const token of ["tray", "waiting", "surface-control", "surface-control-pressed"])
    expect(() => declared(kept, `--ov-${token}`), `sticky-actions ${token}`).toThrow();
  // One rule for every card: a tray, a wait and a tonal button take the panel's tray, a tone off
  // the card, in both palettes, and what a thing stands on is the card's own white.
  const inCard = block(globals, /:where\(\s*\.box,\s*\.box-rows,[^{]*\{/.exec(globals)![0]);
  expect(declared(inCard, "--ov-tray")).toBe("var(--ov-panel-tray)");
  expect(declared(inCard, "--ov-waiting")).toBe("var(--ov-panel-tray)");
  expect(declared(inCard, "--ov-surface-control")).toBe("var(--ov-surface-control-on-surface)");
  expect(declared(inCard, "--ov-backdrop")).toBe("var(--ov-panel)");
  for (const mode of MODES) {
    expect(colour(mode, "panel-tray")).not.toBe(colour(mode, "panel"));
    expect(colour(mode, "surface-control-on-surface")).not.toBe(colour(mode, "panel"));
  }
});

it("gives a box standing as a panel on the grouped ground a panel's control fills", () => {
  const forms = read("form-v2/forms.css");
  const panel = block(forms, ".ov-panel {");
  const boxed = block(forms, ":where(.ov-grouped, .ov-grouped-page) .box-rows {");
  expect(declared(boxed, "background")).toBe(declared(panel, "background"));
  for (const token of ["tray", "waiting", "surface-control", "surface-control-pressed"])
    expect(declared(boxed, `--ov-${token}`), token).toBe(declared(panel, `--ov-${token}`));
  for (const mode of MODES) expect(colour(mode, "panel-tray")).not.toBe(colour(mode, "panel"));
});

it("names every Tailwind colour it adds from a token", () => {
  const theme = block(globals, "@theme inline {");
  for (const token of ["tray", "waiting", "surface-control-on-surface"])
    expect(declared(theme, `--color-${token}`)).toBe(`var(--ov-${token})`);
});
