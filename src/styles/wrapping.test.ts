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
