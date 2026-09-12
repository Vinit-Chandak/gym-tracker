// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { SessionChrome } from "./session-chrome";

const route = vi.hoisted(() => ({ pathname: "/workouts/active" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("./rest-timer", () => ({ RestTimer: () => <div role="timer">Rest 1:00</div> }));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
afterEach(cleanup);

it("keeps the rest timer visible inside the workout while hiding the redundant resume strip", () => {
  route.pathname = "/workouts/active";
  render(<SessionChrome session={{ id: "active", name: "Lower A", restTimerEnabled: true }} />);
  expect(screen.getByRole("timer")).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Resume" })).toBeNull();
});

it("shows the resume strip and timer on other screens", () => {
  route.pathname = "/settings";
  render(<SessionChrome session={{ id: "active", name: "Lower A", restTimerEnabled: true }} />);
  expect(screen.getByRole("timer")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Resume" })).toBeTruthy();
});
