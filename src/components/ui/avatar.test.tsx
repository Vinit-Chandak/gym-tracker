// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, expect, it } from "vitest";

import { avatarHue } from "@/domain/avatar";

import { Avatar } from "./avatar";

afterEach(cleanup);

it("draws the initial on a circle whose hue is the username's, out of the accessibility tree", () => {
  const { container } = render(<Avatar username="phani03" displayName="Phani" size="header" />);
  const circle = container.firstElementChild as HTMLElement;
  expect(circle.textContent).toBe("P");
  expect(circle.getAttribute("aria-hidden")).toBe("true");
  expect(circle.style.getPropertyValue("--avatar-hue")).toBe(String(avatarHue("phani03")));
  expect(circle.className).toContain("size-16");
});

it("sizes a form-v2 avatar's initial with its disc, so a J stays in the circle at 200% text", () => {
  for (const [file, selector] of [
    ["rows.css", ".person-card-avatar"],
    ["people.css", ".activity-row-avatar"],
  ] as const) {
    const css = readFileSync(resolve(__dirname, "../../styles/form-v2", file), "utf8");
    const body = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css)![1]!;
    const disc = Number(/width:\s*calc\((\d+) \* var\(--ov-u\)\)/.exec(body)![1]);
    const letter = Number(/font-size:\s*calc\((\d+) \* var\(--ov-u\)\)/.exec(body)?.[1]);
    // The same 26 and 18 as at 100% text, now in the disc's unit rather than the text's.
    expect(letter / disc).toBeGreaterThan(0.4);
    expect(letter / disc).toBeLessThan(0.5);
    expect(body).toMatch(/line-height:\s*1;/);
  }
});
