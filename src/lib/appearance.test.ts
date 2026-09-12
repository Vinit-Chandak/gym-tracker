// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { applyAppearance, CANVAS_DARK, CANVAS_LIGHT } from "./appearance";

afterEach(() => {
  document.head.innerHTML = "";
  document.documentElement.removeAttribute("data-overload-mode");
});

it("changes theme colours without removing metadata React owns", () => {
  document.head.innerHTML = `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${CANVAS_LIGHT}"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="${CANVAS_DARK}">`;
  const nodes = [...document.head.querySelectorAll("meta")];
  for (const mode of ["light", "dark", "system"] as const) {
    applyAppearance(mode);
    expect([...document.head.querySelectorAll("meta")]).toEqual(nodes);
    expect(nodes.every((node) => node.parentNode === document.head)).toBe(true);
    expect(nodes.map((node) => node.content)).toEqual(
      mode === "system"
        ? [CANVAS_LIGHT, CANVAS_DARK]
        : [
            mode === "light" ? CANVAS_LIGHT : CANVAS_DARK,
            mode === "light" ? CANVAS_LIGHT : CANVAS_DARK,
          ],
    );
  }
});
