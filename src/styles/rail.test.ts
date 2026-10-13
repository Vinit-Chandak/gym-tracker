import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

/**
 * From 64rem the navigation is a rail (ADR 0052), and what stands beside it starts at its width:
 * the page, its pinned actions and the session strip, so the strip and the actions over it share
 * the page's column. In rem, never Tailwind's scale, which grows on a wide screen: the strip's
 * `lg:left-48` came to 216 px at 1920 beside a 192-px rail, and stood it 12 px off the column.
 */

const read = (path: string) =>
  readFileSync(resolve(__dirname, path), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const globals = read("../app/globals.css");
const chrome = read("../components/shell/session-chrome.tsx");

/** The declarations of every rule, in every `@media (min-width: 64rem)` block, by selector. */
function wideRules(css: string): Map<string, string> {
  const rules = new Map<string, string>();
  for (const match of css.matchAll(/@media \(min-width: 64rem\)\s*\{/g)) {
    let depth = 0;
    let end = match.index + match[0].length - 1;
    for (; end < css.length; end++) {
      if (css[end] === "{") depth++;
      else if (css[end] === "}" && --depth === 0) break;
    }
    const body = css.slice(match.index + match[0].length, end);
    for (const rule of body.matchAll(/([^{}]+)\{([^}]*)\}/g))
      for (const selector of rule[1]!.split(","))
        rules.set(selector.trim(), `${rules.get(selector.trim()) ?? ""}${rule[2]}`);
  }
  return rules;
}

const value = (declarations: string | undefined, property: string) =>
  new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(declarations ?? "")?.[1]?.trim();

it("starts the page, its pinned actions and the session strip at the rail's width", () => {
  const wide = wideRules(globals);
  expect(value(wide.get(".primary-nav"), "width")).toBe("12rem");
  expect(value(wide.get(".app-content"), "margin-left")).toBe("12rem");
  expect(value(wide.get(".pinned-actions"), "left")).toBe("12rem");
  expect(value(wide.get(".session-chrome"), "left")).toBe("12rem");
  // Nothing on the strip's own element moves it by Tailwind's growing scale instead.
  expect(chrome).toMatch(/className="session-chrome /);
  expect(chrome).not.toMatch(/\b(?:lg|xl):(?:left|inset-x|ml|pl)-/);
});

it("centres the session strip in the page's column in one rule, at every width", () => {
  // Its own margin stands it in the column beside the rail as on a phone. A second rule, wide
  // only, centred it again another way, left over from merging two changes to the strip.
  const rows = read("form-v2/rows.css");
  expect(wideRules(rows).has(".session-strip")).toBe(false);
  const strip = /\.session-strip\s*\{([^}]*)\}/.exec(rows)?.[1];
  expect(value(strip, "--strip-side")).toContain("var(--content-width)");
  expect(value(strip, "margin")).toContain("var(--strip-side)");
});
