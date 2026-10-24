import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

/**
 * The session strip folds into a screen's pinned actions at large text (DESIGN.md, The session
 * strip; ADR 0052). Each set of actions shows the strip's key from a container query on its own
 * box; the strip stands down only while that key has a box (session-chrome.tsx), never from a
 * query of its own, so no two readings of a width can leave the workout without a way back.
 */

const read = (path: string) =>
  readFileSync(resolve(__dirname, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const rows = read("form-v2/rows.css");
const globals = read("../app/globals.css");

/** Each `@container <name> (...)` block: its condition and its body. */
function containers(css: string): { name: string; condition: string; body: string }[] {
  const found = [];
  for (const match of css.matchAll(/@container ([\w-]+) (\([^{]*\))\s*\{/g)) {
    // The block runs to the brace that closes the one after the condition.
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < css.length; end++) {
      if (css[end] === "{") depth++;
      else if (css[end] === "}" && --depth === 0) break;
    }
    found.push({
      name: match[1]!,
      condition: match[2]!.trim(),
      body: css.slice(match.index + match[0].length, end),
    });
  }
  return found;
}

/** The width under which a `(width < calc(Arem - Bpx))` condition holds, at a root font size. */
function threshold(condition: string, root: number): number {
  const match = /^\(width < calc\(([\d.]+)rem - ([\d.]+)px\)\)$/.exec(condition);
  if (!match) throw new Error(`Unexpected fold condition: ${condition}`);
  return Number(match[1]) * root - Number(match[2]);
}

/** A declaration's value in the first rule for a selector that declares it. */
function declared(css: string, selector: RegExp, property: string): string {
  for (const rule of css.matchAll(new RegExp(`${selector.source}\\s*\\{([^}]*)\\}`, "g"))) {
    const value = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(rule[1]!);
    if (value) return value[1]!.trim().replace(/\s+/g, " ");
  }
  throw new Error(`No ${property} for ${selector.source}`);
}

const folds = containers(rows).filter(({ body }) =>
  /\.session-fold\s*\{\s*display:\s*flex/.test(body),
);
const place = (name: string) => {
  const fold = folds.find((candidate) => candidate.name === name);
  if (!fold) throw new Error(`No fold for ${name}`);
  return fold;
};

/** A phone's gutter: 20 pt, 16 under 360 pt (foundation.css). */
const gutter = (screen: number) => (screen < 360 ? 16 : 20);

/**
 * How wide each box that holds the key is on a screen, from what the CSS declares beside it:
 * the pinned actions pad themselves by the gutters; a form's kept actions stand inside the
 * page's gutters with no inset of their own (DESIGN.md, The Rhythm Rule: one inset, never two).
 */
const boxes: Record<string, (screen: number, root: number) => number> = {
  pinned: (screen) => screen - 2 * gutter(screen),
  "kept-actions": (screen) => screen - 2 * gutter(screen),
};

it("stands the strip down only while its key has a box, never from a query of its own", () => {
  expect(rows).toMatch(/\.session-chrome\[data-folded\] \.session-strip\s*\{\s*display:\s*none;/);
  for (const { body } of containers(rows)) expect(body).not.toMatch(/\.session-strip/);
  expect(rows).not.toMatch(/container:\s*chrome/);
});

it("measures each place's box as the CSS lays it out", () => {
  expect(declared(rows, /\n\.pinned-actions/, "padding")).toBe(
    "0 max(var(--ov-gutter), env(safe-area-inset-right)) calc(12 * var(--ov-u)) max(var(--ov-gutter), env(safe-area-inset-left))",
  );
  expect(declared(rows, /\n\.pinned-actions/, "container")).toBe("pinned / inline-size");
  expect(declared(rows, /\n\.sticky-actions/, "container")).toBe("kept-actions / inline-size");
  // Above and below only: the page's gutters are its sides.
  expect(declared(globals, /@utility sticky-actions/, "padding")).toBe(
    "calc(10 * var(--ov-u)) 0 calc(4 * var(--ov-u))",
  );
  expect(declared(globals, /@utility page-width/, "padding-left")).toBe(
    "max(var(--page-gutter), env(safe-area-inset-left))",
  );
});

it("folds every place on the same screens: every phone at 200% text, none at 100%", () => {
  expect(folds.map(({ name }) => name).sort()).toEqual(Object.keys(boxes).sort());
  const phones = [320, 360, 375, 390, 402, 440];
  for (const [name, box] of Object.entries(boxes)) {
    const { condition } = place(name);
    for (const phone of phones) {
      expect(box(phone, 32), `${name} at ${phone}, 200%`).toBeLessThan(threshold(condition, 32));
      expect(box(phone, 16), `${name} at ${phone}, 100%`).toBeGreaterThanOrEqual(
        threshold(condition, 16),
      );
    }
    // A tablet at 200% keeps its strip: the screen has the room.
    expect(box(768, 32), `${name} on a tablet`).toBeGreaterThanOrEqual(threshold(condition, 32));
  }
  // Whichever box asks, a screen folds below the same width: 14rem, 8 pt sooner under 360 pt.
  for (const root of [16, 20, 24, 28, 32]) {
    for (let screen = 280; screen <= 900; screen++) {
      const answers = Object.entries(boxes).map(
        ([name, box]) => box(screen, root) < threshold(place(name).condition, root),
      );
      expect(new Set(answers).size, `${screen} wide at ${root}px`).toBe(1);
    }
  }
});

it("keeps a field its width beside the key", () => {
  expect(place("pinned").body).toMatch(
    /:nth-last-child\(2\):has\(textarea, select, input:not\(\[type="hidden"\]\)\)\s*\{\s*flex:\s*1 0 100%;/,
  );
});

it("keeps the key hidden until then, and on a page of the session's own", () => {
  expect(declared(rows, /\n\.session-fold/, "display")).toBe("none");
  expect(rows).toMatch(/html:has\(\.session-page\) \.session-fold\s*\{\s*display:\s*none;\s*\}/);
  // The place the actions keep for it adds nothing while it is empty.
  expect(rows).toMatch(/\.pinned-fold\s*\{\s*display:\s*contents;\s*\}/);
});
