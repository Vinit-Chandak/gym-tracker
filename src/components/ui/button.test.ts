import { expect, it } from "vitest";

import { buttonClassName } from "./button";

it("fills a waiting button from the waiting token, a step off a card it stands on", () => {
  // The surface on the ground, surface 2 in a box (globals.css): never the card's own fill.
  expect(buttonClassName("waiting")).toContain("bg-waiting");
  expect(buttonClassName("waiting")).not.toMatch(/\bbg-surface\b/);
  // Saving…: a primary button disabled waits in the same fill.
  expect(buttonClassName("primary")).toContain("disabled:bg-waiting");
  expect(buttonClassName("primary")).not.toMatch(/disabled:bg-surface\b/);
});
