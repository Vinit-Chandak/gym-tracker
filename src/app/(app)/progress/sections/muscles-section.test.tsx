// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { emptyMuscleVolume } from "@/domain/muscle-volume";

import { MusclesSection } from "./muscles-section";

const route = vi.hoisted(() => ({ search: "" }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(route.search),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  route.search = "";
});

/** A Thursday: its week runs Monday 5 to Sunday 11 October. */
const TODAY = "2026-10-08";
const week = (from: string, to: string) => ({
  from,
  to,
  volume: { ...emptyMuscleVolume(), chest: 6 },
  totalSets: 6,
});
const button = (name: string) => screen.getByRole<HTMLButtonElement>("button", { name });

it("opens on this week, named as a graph names it, and goes no further", () => {
  route.search = "view=muscles";
  render(<MusclesSection muscles={week("2026-10-05", "2026-10-11")} today={TODAY} />);
  expect(screen.getByText("This week")).toBeTruthy();
  // Nothing is trained in a week still to come.
  expect(button("Next week").disabled).toBe(true);
  fireEvent.click(button("Previous week"));
  expect(router.replace).toHaveBeenCalledWith("/progress?view=muscles&week=2026-09-28", {
    scroll: false,
  });
});

it("names an earlier week by its days, and steps forward from it", () => {
  route.search = "view=muscles&week=2026-09-28";
  render(<MusclesSection muscles={week("2026-09-28", "2026-10-04")} today={TODAY} />);
  expect(screen.getByText("28 Sept – 4 Oct")).toBeTruthy();
  expect(screen.queryByText("This week")).toBeNull();
  fireEvent.click(button("Next week"));
  expect(router.replace).toHaveBeenCalledWith("/progress?view=muscles&week=2026-10-05", {
    scroll: false,
  });
});
