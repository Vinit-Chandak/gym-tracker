import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { expect, it } from "vitest";

/**
 * A value exported from a "use client" module — a constant, a plain function — is not that
 * value to a server component that imports it: in a production build it arrives as a client
 * reference, and `PEOPLE_TABS.find is not a function` was the Friends page on the day it
 * shipped. Development and the test suite both resolve the real module, so nothing else
 * catches it. This walks `src` for server modules that import a non-component value from a
 * client module. Components (capitalised) are fine: that is what the boundary is for.
 */

const SRC = resolve(__dirname);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : walk(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const directive = (source: string) =>
  source.match(/^\s*(?:\/\/[^\n]*\n|\/\*[\s\S]*?\*\/\s*)*"use (client|server)"/)?.[1];

/** Names a module exports that are values and not components: constants, lowercase functions. */
function valueExports(source: string): string[] {
  return [
    ...source.matchAll(/^export (?:const|let|function) ([a-z_][A-Za-z0-9_]*|[A-Z][A-Z0-9_]+)\b/gm),
  ]
    .map((m) => m[1]!)
    .filter((name) => !/^use[A-Z]/.test(name));
}

/** `{ name, from }` for every named import in a module, with `from` resolved to a path. */
function namedImports(file: string, source: string): { names: string[]; from: string }[] {
  return [...source.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+"([^"]+)"/g)].flatMap((m) => {
    if (m[1]) return [];
    const spec = m[3]!;
    const from = spec.startsWith("@/")
      ? join(SRC, spec.slice(2))
      : spec.startsWith(".")
        ? resolve(dirname(file), spec)
        : null;
    if (!from) return [];
    const names = m[2]!
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith("type "))
      .map((part) => part.split(/\s+as\s+/)[0]!);
    return [{ names, from }];
  });
}

it("never imports a value from a client module into a server module", () => {
  const files = walk(SRC);
  const sources = new Map(files.map((file) => [file, readFileSync(file, "utf8")]));
  const clientValues = new Map<string, string[]>();
  for (const [file, source] of sources) {
    if (directive(source) !== "client") continue;
    const values = valueExports(source);
    if (values.length) clientValues.set(file.replace(/\.tsx?$/, ""), values);
  }
  const crossings: string[] = [];
  for (const [file, source] of sources) {
    if (directive(source)) continue;
    for (const { names, from } of namedImports(file, source)) {
      const exported = clientValues.get(from);
      if (!exported) continue;
      for (const name of names) {
        if (exported.includes(name)) {
          crossings.push(`${relative(SRC, file)} imports ${name} from ${relative(SRC, from)}`);
        }
      }
    }
  }
  expect(crossings).toEqual([]);
});
