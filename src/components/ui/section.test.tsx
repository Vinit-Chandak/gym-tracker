// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { Section } from "./section";

afterEach(cleanup);

it("names a section in the caption every section's name takes, at the gutter (DESIGN.md)", () => {
  const { container } = render(
    <Section title="Friends' leaderboard" info="Who lifted most.">
      <p>Kenji</p>
    </Section>,
  );
  const name = screen.getByRole("heading", { level: 2 });
  // The caption-head the page's other captions take (Latest, How to do it): 700, 13 pt, ink 2,
  // said as written, not an uppercase, letterspaced register of its own.
  expect(name.className).toContain("caption-head");
  expect(name.className).not.toMatch(/uppercase|tracking-|font-medium|text-xs/);
  expect(name.textContent).toBe("Friends' leaderboard");
  // The name stands on the edge of the box and the names under it, not a quarter rem in (The
  // One Left Edge Rule), and nothing explains the section under it: that is its ⓘ.
  expect(container.innerHTML).not.toMatch(/\bpx-1\b/);
  expect(screen.getByRole("button", { name: "About friends' leaderboard" })).toBeTruthy();
});
