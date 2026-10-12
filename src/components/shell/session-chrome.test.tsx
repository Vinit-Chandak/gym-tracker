// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { SessionChrome } from "./session-chrome";

const route = vi.hoisted(() => ({ pathname: "/workouts/active" }));
const rest = vi.hoisted(() => ({ remaining: 60 as number | null }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
// The strip's own timer is the real one's stand-in; the folded key draws the real face and name
// from the one reading the chrome takes.
vi.mock("./rest-timer", async (original) => ({
  ...(await original<typeof import("./rest-timer")>()),
  RestTime: () => (rest.remaining === null ? null : <span role="timer">1:00</span>),
  useRestReading: () => ({ remaining: rest.remaining, total: 120_000 }),
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: unknown }) => (
    <a {...props} />
  ),
}));

/** Whether rows.css gives the folded key a box: at large text, on a screen that pins actions. */
const layout = vi.hoisted(() => ({ keyShown: false }));
let observed: { callback: ResizeObserverCallback; target: Element }[] = [];
vi.stubGlobal(
  "ResizeObserver",
  class {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe(target: Element) {
      observed.push({ callback: this.callback, target });
    }
    disconnect() {
      observed = observed.filter(({ callback }) => callback !== this.callback);
    }
  },
);
const getClientRects = HTMLElement.prototype.getClientRects;
beforeEach(() => {
  layout.keyShown = false;
  observed = [];
  HTMLElement.prototype.getClientRects = function (this: HTMLElement) {
    if (this.classList.contains("session-fold"))
      return (layout.keyShown ? [this.getBoundingClientRect()] : []) as unknown as DOMRectList;
    return getClientRects.call(this);
  };
});
afterEach(() => {
  HTMLElement.prototype.getClientRects = getClientRects;
});
/** The reader's text grows or shrinks past large text: the key gains or loses its box. */
function relayout(keyShown: boolean) {
  layout.keyShown = keyShown;
  act(() => {
    for (const { callback, target } of observed)
      callback([{ target } as ResizeObserverEntry], {} as ResizeObserver);
  });
}
const frame = () => document.querySelector(".session-chrome");
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
  // The time and Resume stand together, so they go under the name together (rows.css).
  const end = strip.querySelector(".session-strip-end")!;
  expect(end.contains(screen.getByRole("timer"))).toBe(true);
  expect(end.contains(screen.getByRole("link", { name: "Resume" }))).toBe(true);
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

it("keeps Resume on the folded key while a rest runs, the time over it, named alike", () => {
  route.pathname = "/profile/sports";
  rest.remaining = 75;
  render(<ScreenWithSave />);
  // The name and the face come from one reading, so they say the same second (WCAG 2.5.3).
  const key = screen.getByRole("link", { name: "Resume Lower A. Rest, 1:15 left" });
  expect(key.textContent).toBe("1:15Resume");
  expect(key.querySelector("svg")).toBeTruthy();
});

it("says Go on the folded key when the rest is over, and still Resume", () => {
  route.pathname = "/profile/sports";
  rest.remaining = 0;
  render(<ScreenWithSave />);
  const key = screen.getByRole("link", { name: "Resume Lower A. Rest over: Go" });
  expect(key.textContent).toBe("GoResume");
});

it("stands the strip down only while its key has a box, from the first paint", () => {
  route.pathname = "/profile/sports";
  rest.remaining = null;
  // At 100% text the key has no box, so the strip stays.
  const view = render(<ScreenWithSave />);
  expect(frame()?.hasAttribute("data-folded")).toBe(false);
  // The reader's text grows: the key shows, so the strip goes.
  relayout(true);
  expect(frame()?.hasAttribute("data-folded")).toBe(true);
  // However the key's width is read, a key without a box never takes the strip with it.
  relayout(false);
  expect(frame()?.hasAttribute("data-folded")).toBe(false);
  view.unmount();

  // Opened at large text, it is folded before anything is painted.
  layout.keyShown = true;
  render(<ScreenWithSave />);
  expect(frame()?.hasAttribute("data-folded")).toBe(true);
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

it("unfolds the strip when the key goes, even at large text", () => {
  route.pathname = "/profile/sports";
  rest.remaining = null;
  layout.keyShown = true;
  const view = render(<ScreenWithSave />);
  expect(frame()?.hasAttribute("data-folded")).toBe(true);
  view.rerender(<ScreenWithSave pinned={false} />);
  expect(frame()?.hasAttribute("data-folded")).toBe(false);
});
