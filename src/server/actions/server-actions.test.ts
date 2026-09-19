import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, it } from "vitest";

/**
 * A `"use server"` module may export nothing but async functions: every export becomes a
 * callable endpoint, and the compiler refuses a synchronous one.
 *
 * `next build` catches this, and the type checker and the test suite do not — which is how a
 * synchronous helper exported beside its action reached a deployment. This is the cheap
 * version of that check, so the fast loop fails where the slow one would.
 */

const DIRECTORY = join(process.cwd(), "src/server/actions");

const modules = readdirSync(DIRECTORY)
  .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  .map((name) => ({ name, source: readFileSync(join(DIRECTORY, name), "utf8") }))
  .filter(({ source }) => /^\s*["']use server["']/.test(source));

it("finds the action modules to check", () => {
  expect(modules.length).toBeGreaterThan(5);
});

it.each(modules.map(({ name }) => name))("%s exports only async functions", (name) => {
  const source = modules.find((module) => module.name === name)!.source;
  const offenders = [
    // `export function x(` and `export const x = (` without an `async` in front of it.
    ...source.matchAll(/^export\s+(?!async\s+function)(?:function\s+)(\w+)/gm),
    ...source.matchAll(/^export\s+const\s+(\w+)\s*(?::[^=]+)?=\s*(?!async)(?:\(|function)/gm),
  ].map((match) => match[1]);
  expect(offenders).toEqual([]);
});
