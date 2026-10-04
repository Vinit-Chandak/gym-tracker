// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { SessionChrome } from "./session-chrome";

const route = vi.hoisted(() => ({ pathname: "/workouts/active" }));
const rest = vi.hoisted(() => ({ remaining: 60 as number | null }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("./rest-timer", () => ({
  RestTime: () => (rest.remaining === null ? null : <span role="timer">1:00</span>),
  useRestRemaining: () => rest.remaining,
}));
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

const session = { id: "active", name: "Lower A", restTimerEnabled: true };

it("stands down inside the workout, whose header has the rest pill", () => {
  route.pathname = "/workouts/active";
  rest.remaining = 60;
  render(<SessionChrome session={session} />);
  expect(screen.queryByRole("complementary", { name: "Workout in progress" })).toBeNull();
  expect(screen.queryByRole("timer")).toBeNull();
});

it("is the strip on other screens: the name, the rest and Resume", () => {
  route.pathname = "/profile";
  rest.remaining = 60;
  render(<SessionChrome session={session} />);
  const strip = screen.getByRole("complementary", { name: "Workout in progress" });
  expect(strip.textContent).toContain("Lower A");
  expect(screen.getByRole("timer")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Resume" }).getAttribute("href")).toBe(
    "/workouts/active",
  );
});

it("leaves Resume to Today unless a rest is running", () => {
  route.pathname = "/today";
  rest.remaining = null;
  const view = render(<SessionChrome session={session} />);
  expect(screen.queryByRole("link", { name: "Resume" })).toBeNull();
  view.unmount();

  rest.remaining = 45;
  render(<SessionChrome session={session} />);
  expect(screen.getByRole("timer")).toBeTruthy();
});
