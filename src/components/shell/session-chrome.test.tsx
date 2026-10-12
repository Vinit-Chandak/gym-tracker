// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { SessionChrome } from "./session-chrome";

const route = vi.hoisted(() => ({ pathname: "/workouts/active" }));
const rest = vi.hoisted(() => ({ remaining: 60 as number | null }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("./rest-timer", () => ({
  RestTime: () => (rest.remaining === null ? null : <span role="timer">1:00</span>),
  RestFace: () => (rest.remaining === null ? null : <span>1:00</span>),
  restNamed: (remaining: number) => (remaining === 0 ? "Rest over: Go" : "Rest, 1:00 left"),
  useRestRemaining: () => rest.remaining,
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: unknown }) => (
    <a {...props} />
  ),
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

/** A screen with its own pinned action, and the shell's strip after it, as the layout has them. */
function ScreenWithSave({ pinned = true }: { pinned?: boolean }) {
  return (
    <>
      {pinned && (
        <PinnedActions stack>
          <button type="submit">Save</button>
        </PinnedActions>
      )}
      <SessionChrome session={session} />
    </>
  );
}

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

it("keeps its folded key at the end of a screen's pinned actions, named for the session", () => {
  route.pathname = "/profile/sports";
  rest.remaining = null;
  render(<ScreenWithSave />);
  const key = screen.getByRole("link", { name: "Resume Lower A" });
  expect(key.getAttribute("href")).toBe("/workouts/active");
  expect(key.textContent).toBe("Resume");
  // In the place the actions hold for it, after Save: the end of their last line, and of their
  // focus order. rows.css shows it in the strip's place at large text only.
  const stack = screen.getByRole("button", { name: "Save" }).parentElement!;
  expect(stack.className).toBe("pinned-actions-stack");
  expect(stack.lastElementChild?.className).toBe("pinned-fold");
  expect(stack.lastElementChild?.firstElementChild).toBe(key);
  // The strip is still there, for every other size.
  expect(screen.getByRole("complementary", { name: "Workout in progress" })).toBeTruthy();
});

it("names the folded key with the rest it shows", () => {
  route.pathname = "/profile/sports";
  rest.remaining = 60;
  render(<ScreenWithSave />);
  const key = screen.getByRole("link", { name: "Resume Lower A. Rest, 1:00 left" });
  expect(key.textContent).toBe("1:00");
});

it("folds into nothing where there is nothing pinned, or no strip to fold", () => {
  route.pathname = "/profile";
  rest.remaining = null;
  const bare = render(<ScreenWithSave pinned={false} />);
  expect(screen.queryByRole("link", { name: /^Resume Lower A/ })).toBeNull();
  bare.unmount();

  route.pathname = "/workouts/active/finish";
  render(<ScreenWithSave />);
  expect(screen.queryByRole("link", { name: /^Resume/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
});

it("takes the key back when the screen's pinned actions go", () => {
  route.pathname = "/profile/sports";
  rest.remaining = null;
  const view = render(<ScreenWithSave />);
  expect(screen.getByRole("link", { name: "Resume Lower A" })).toBeTruthy();
  view.rerender(<ScreenWithSave pinned={false} />);
  expect(screen.queryByRole("link", { name: "Resume Lower A" })).toBeNull();
  expect(screen.getByRole("link", { name: "Resume" })).toBeTruthy();
});
