import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, it } from "vitest";

/**
 * The Text Never Runs Off Rule (DESIGN.md): words wrap between them, and a word breaks only
 * where it cannot fit a line of its own (`overflow-wrap: break-word`). `anywhere` also counts
 * every letter as a place to break when a box works out how narrow it may be, so a name beside
 * a button or a number in a narrow column was squeezed to a letter a line ("Leaderboar / d",
 * "85,342 / .5 kg") long before it ran out of room.
 *
 * Two kinds of text keep a break between any two letters: what has no words (a token or a key,
 * in monospace), and a meta line's fact, whose words have no box of their own beside the glyph
 * (rows.css says why).
 */

const SRC = resolve(__dirname, "..");
const TOKENS = ["app/(app)/profile/coach/page.tsx", "app/(app)/profile/coach/token-manager.tsx"];
const ANYWHERE = ["styles/form-v2/rows.css .meta-fact"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : walk(path);
    return /\.(css|tsx?)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

it("breaks a word only where it cannot fit a line of its own", () => {
  const offenders = walk(SRC).flatMap((path) => {
    const file = relative(SRC, path);
    const source = readFileSync(path, "utf8");
    const found: string[] = [];
    if (file.endsWith(".css")) {
      // Each rule by its selector, so the one allowed rule is told from any other.
      for (const [, selector, body] of source.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const name = selector!.replace(/\/\*[\s\S]*?\*\//g, "").trim();
        if (/overflow-wrap:\s*anywhere|word-break:\s*break-all/.test(body!))
          found.push(`${file} ${name}`);
      }
    } else {
      for (const match of source.matchAll(/overflow-wrap:\s*anywhere|wrap-anywhere|\bbreak-all\b/g))
        if (!(match[0] === "break-all" && TOKENS.includes(file)))
          found.push(`${file}: ${match[0]}`);
    }
    return found.filter((place) => !ANYWHERE.includes(place));
  });
  expect(offenders).toEqual([]);
});

/** The declarations of the first rule written for exactly this selector, comments aside. */
function rule(file: string, selector: string): string {
  const css = readFileSync(join(SRC, "styles/form-v2", file), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  for (const [, name, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    if (name!.trim() === selector) return body!;
  throw new Error(`No rule for ${selector} in ${file}`);
}

it("says a workout's name in the session's chrome whole, wrapping, never in an ellipsis", () => {
  // The strip, a session's way back and a page's way back carry a routine's name.
  for (const [file, selector] of [
    ["rows.css", ".session-strip-name"],
    ["rows.css", ".back-link-label"],
    ["session.css", ".session-back > span"],
  ] as const) {
    const body = rule(file, selector);
    expect(body).toMatch(/overflow-wrap:\s*break-word/);
    expect(body).not.toMatch(/text-overflow|white-space:\s*nowrap/);
  }
  // What stands beside the name (the time and Resume, the rest pill, More) goes under it, at
  // the end, before the name would have less than a few words' room.
  for (const [file, row, name, end] of [
    ["rows.css", ".session-strip", ".session-strip-title", ".session-strip-end"],
    ["session.css", ".session-header", ".session-back", ".session-header-end"],
    ["rows.css", ".page-header-bar", ".back-link", ".page-header-bar > .page-header-action"],
  ] as const) {
    expect(rule(file, row)).toMatch(/flex-wrap:\s*wrap/);
    expect(rule(file, name)).toMatch(/flex:\s*1 1 \d+rem/);
    expect(rule(file, name)).toMatch(/max-width:\s*max-content/);
    expect(rule(file, end)).toMatch(/margin-left:\s*auto/);
  }
});

it("gives Pick up from today the row's width under its count at large text", () => {
  // The count asks for its own width (plan-actions.tsx), so the button goes under it once they
  // no longer fit; at large text it is always under, as wide as the row, as a card's next step
  // is. Asked of the row by a container query, never a media query, whose rem is the browser's.
  const rows = readFileSync(join(SRC, "styles/form-v2/rows.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  expect(rule("rows.css", ".pick-up")).toMatch(/container:\s*pick-up \/ inline-size/);
  const query =
    /@container pick-up \(width < calc\(([\d.]+)rem - ([\d.]+)px\)\)\s*\{\s*\.pick-up > button\s*\{\s*flex:\s*1 0 100%;\s*\}/.exec(
      rows,
    );
  expect(query).not.toBeNull();
  const threshold = (root: number) => Number(query![1]) * root - Number(query![2]);
  // The row spans the page's column: the screen less its gutters, 16 under 360 pt, else 20.
  for (const phone of [320, 360, 375, 390, 402, 440]) {
    const row = phone - 2 * (phone < 360 ? 16 : 20);
    expect(row, `${phone} at 200%`).toBeLessThan(threshold(32));
    expect(row, `${phone} at 100%`).toBeGreaterThanOrEqual(threshold(16));
  }
});
