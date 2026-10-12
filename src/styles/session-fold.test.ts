import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

/**
 * The session strip folds into a screen's pinned actions at large text (DESIGN.md, The session
 * strip; ADR 0052): the strip's frame hides the strip, and the pinned actions show its key, each
 * from a container query on its own box. Both boxes run between the gutters, so the two questions
 * must be the same question, or there is a size at which the workout is shown twice, or not at
 * all.
 */

const rows = readFileSync(resolve(__dirname, "form-v2/rows.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** The condition of each `@container <name> (...)` whose body says `pattern`. */
function conditions(name: string, pattern: RegExp): string[] {
  const found: string[] = [];
  for (const match of rows.matchAll(new RegExp(`@container ${name} (\\([^{]*\\))\\s*\\{`, "g"))) {
    // The block runs to the brace that closes the one after the condition.
    let depth = 0;
    let end = match.index! + match[0].length - 1;
    for (; end < rows.length; end++) {
      if (rows[end] === "{") depth++;
      else if (rows[end] === "}" && --depth === 0) break;
    }
    if (pattern.test(rows.slice(match.index!, end))) found.push(match[1]!.trim());
  }
  return found;
}

/** The width under which a `(width < calc(Arem - Bpx))` condition holds, at a root font size. */
function threshold(condition: string, root: number): number {
  const match = /^\(width < calc\(([\d.]+)rem - ([\d.]+)px\)\)$/.exec(condition);
  if (!match) throw new Error(`Unexpected fold condition: ${condition}`);
  return Number(match[1]) * root - Number(match[2]);
}

const hides = conditions("chrome", /\.session-strip\s*\{\s*display:\s*none/);
const shows = conditions("pinned", /\.session-fold\s*\{[^}]*display:\s*flex/);

it("hides the strip exactly where its key appears", () => {
  expect(hides).toHaveLength(1);
  expect(shows).toHaveLength(1);
  expect(hides[0]).toBe(shows[0]);
  // And only where the key is there to take its place.
  expect(rows).toMatch(/html:has\(\.session-fold\) \.session-strip\s*\{\s*display:\s*none/);
});

it("folds on every phone at 200% text and on none at 100%", () => {
  // Each box is the screen less two gutters: 20 pt, 16 under 360 pt.
  const between = (screen: number) => screen - 2 * (screen < 360 ? 16 : 20);
  const phones = [320, 360, 375, 390, 402, 440];
  for (const phone of phones) {
    expect(between(phone)).toBeLessThan(threshold(shows[0]!, 32));
    expect(between(phone)).toBeGreaterThanOrEqual(threshold(shows[0]!, 16));
  }
  // A tablet at 200% keeps its strip: the screen has the room.
  expect(between(768)).toBeGreaterThanOrEqual(threshold(shows[0]!, 32));
});

it("keeps the key hidden until then, and on a page of the session's own", () => {
  expect(rows).toMatch(/\n\.session-fold\s*\{\s*display:\s*none;\s*\}/);
  expect(rows).toMatch(/html:has\(\.session-page\) \.session-fold\s*\{\s*display:\s*none;\s*\}/);
  // The place the actions keep for it adds nothing while it is empty.
  expect(rows).toMatch(/\.pinned-fold\s*\{\s*display:\s*contents;\s*\}/);
});
