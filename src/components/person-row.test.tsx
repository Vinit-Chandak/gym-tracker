// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { PersonRow } from "./person-row";

vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: string }) => (
    <a {...props} />
  ),
}));
afterEach(cleanup);

const person = { username: "aarav", displayName: "Aarav Sharma" };

it("lets a control go under the name rather than squeeze it to a letter a line", () => {
  render(
    <PersonRow person={person}>
      <button type="button">Unfollow</button>
    </PersonRow>,
  );
  const name = screen.getByRole("link", { name: /Aarav Sharma/ });
  const row = name.parentElement!;
  // The row folds; the person keeps a basis of their own, so the control cannot take it.
  expect(row.className).toContain("flex-wrap");
  expect(name.className).toContain("flex-[1_1_10rem]");
  // Folded, the control stands at the row's end, outside the link.
  const control = screen.getByRole("button", { name: "Unfollow" }).parentElement!;
  expect(control.className).toContain("ml-auto");
  expect(name.contains(control)).toBe(false);
});

it("keeps a chevron beside the name, never folded under it", () => {
  render(<PersonRow person={person} />);
  const name = screen.getByRole("link", { name: /Aarav Sharma/ });
  expect(name.parentElement!.className).not.toContain("flex-wrap");
  expect(name.className).toContain("flex-1");
});
