// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { BottomNav } from "./bottom-nav";

const route = vi.hoisted(() => ({ pathname: "/history", search: "" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.pathname,
  useSearchParams: () => new URLSearchParams(route.search),
}));
vi.mock("next/link", () => ({ useLinkStatus: () => ({ pending: false }) }));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);

const selected = () =>
  screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);

it("stays on History when a finished workout is opened from it", () => {
  route.pathname = "/workouts/abc";
  route.search = "from=history&exercise=def";
  render(<BottomNav />);
  expect(selected()).toEqual(["History"]);
});

it("keeps Today for the workout its card opens", () => {
  route.pathname = "/workouts/abc";
  route.search = "";
  render(<BottomNav />);
  expect(selected()).toEqual(["Today"]);
});

it("reads History's own date range as a date, not as an origin", () => {
  route.pathname = "/history";
  route.search = "from=2026-09-01&to=2026-09-23";
  render(<BottomNav />);
  expect(selected()).toEqual(["History"]);
});
