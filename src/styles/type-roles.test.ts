import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { expect, it } from "vitest";

/**
 * Every word is set in a role DESIGN.md names (Typography), said as written. None of those roles
 * is a small, letterspaced, uppercase register: ADR 0023 retired it from the header, and a
 * card's kicker kept it ("RUNNING · PLANNED") under a section's name and over a meta line in
 * sentence case, two voices for one kind of label on one page (year audit, October 2026).
 */

const SRC = resolve(__dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : walk(path);
    return /\.(css|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

it("says every label as written, never in an uppercase register of its own", () => {
  const offenders = walk(SRC).flatMap((path) => {
    const source = readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const pattern = path.endsWith(".css")
      ? /text-transform:\s*uppercase/g
      : /className=(?:"[^"]*|\{[^}]*)\buppercase\b/g;
    return [...source.matchAll(pattern)].map(() => relative(SRC, path));
  });
  expect(offenders).toEqual([]);
});
