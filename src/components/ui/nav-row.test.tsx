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

it("sets a second line's figures in Jost and leaves its words in Atkinson", () => {
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
