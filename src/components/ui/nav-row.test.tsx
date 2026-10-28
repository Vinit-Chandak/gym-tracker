// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { NavRow } from "./nav-row";

vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: string }) => (
    <a {...props} />
  ),
}));
afterEach(cleanup);

it("sets a second line's figures as figures and leaves its words as words", () => {
  const { container } = render(
    <ul>
      <NavRow href="/gyms" label="Tokyo Powerhouse" sub="101 machines" />
      <NavRow href="/profile" label="Coach" sub="Answer a few questions and the coach writes it." />
    </ul>,
  );
  const subs = [...container.querySelectorAll(".nav-row-sub")];
  expect(subs.map((sub) => sub.textContent)).toEqual([
    "101 machines",
    "Answer a few questions and the coach writes it.",
  ]);
  expect(subs.map((sub) => sub.querySelector(".figures")?.textContent ?? null)).toEqual([
    "101",
    null,
  ]);
});

it("stands a tag or a badge beside the name alone, the second line under both at full width", () => {
  const { container } = render(
    <ul>
      <NavRow
        href="/exercises"
        label="Chest dip machine (wide)"
        sub="Machine · Chest, Front delts"
        tag="Per machine"
      />
      <NavRow href="/profile" label="Programme request" sub="Waiting" badge="Needs your answer" />
      <NavRow href="/gyms" label="Gyms and machines" tag="Default" />
    </ul>,
  );
  const [tagged, badged, plain] = [...container.querySelectorAll(".nav-row-main")];
  // Beside the whole two-line block, a Per machine tag took the meta line's room too, and broke
  // "Chest, Front delts" where it had fit: the mark shares the name's line, its head, alone.
  const head = tagged!.querySelector(".nav-row-head")!;
  expect(head.querySelector(".nav-row-label")?.textContent).toBe("Chest dip machine (wide)");
  expect(head.querySelector(".nav-row-tag")?.textContent).toBe("Per machine");
  expect(head.querySelector(".nav-row-sub")).toBeNull();
  expect(head.nextElementSibling?.className).toBe("nav-row-sub");
  expect(badged!.querySelector(".nav-row-head .nav-row-badge")?.textContent).toBe(
    "Needs your answer",
  );
  // A row of one line has no head: its name and its mark share the row as before.
  expect(plain!.querySelector(".nav-row-head")).toBeNull();
  expect([...plain!.children].map((child) => child.className)).toEqual([
    "nav-row-label",
    "nav-row-tag",
  ]);
});
