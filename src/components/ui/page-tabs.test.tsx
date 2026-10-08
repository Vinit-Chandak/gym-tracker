// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PageTabs, pageSlots } from "./page-tabs";

afterEach(cleanup);

it("shows every page up to five, then the ends and the page read with its neighbours", () => {
  expect(pageSlots(1, 3)).toEqual([1, 2, 3]);
  expect(pageSlots(2, 5)).toEqual([1, 2, 3, 4, 5]);
  expect(pageSlots(1, 12)).toEqual([1, 2, 3, 4, "gap", 12]);
  expect(pageSlots(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
  expect(pageSlots(12, 12)).toEqual([1, "gap", 9, 10, 11, 12]);
  // Even one page out of sight is a gap: a sixth tab would not keep its target at 320 pt.
  expect(pageSlots(4, 6)).toEqual([1, "gap", 3, 4, 5, 6]);
  // Next to an end, no gap where no page is missing.
  expect(pageSlots(3, 6)).toEqual([1, 2, 3, 4, "gap", 6]);
});

it("says which page is being read, and moves to another with a tap", () => {
  const onChange = vi.fn();
  render(<PageTabs page={2} total={3} onChange={onChange} label="History pages" />);
  const pages = within(screen.getByRole("navigation", { name: "History pages" }));
  expect(pages.getByRole("button", { name: "Page 2 of 3" }).getAttribute("aria-current")).toBe(
    "page",
  );
  fireEvent.click(pages.getByRole("button", { name: "Page 3 of 3" }));
  expect(onChange).toHaveBeenCalledWith(3);
  // The page already read does nothing.
  fireEvent.click(pages.getByRole("button", { name: "Page 2 of 3" }));
  expect(onChange).toHaveBeenCalledTimes(1);
});

it("draws nothing for a list of one page", () => {
  render(<PageTabs page={1} total={1} onChange={vi.fn()} label="History pages" />);
  expect(screen.queryByRole("navigation")).toBeNull();
});
