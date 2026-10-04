// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PinnedActions } from "./pinned-actions";

let observed: { callback: ResizeObserverCallback; elements: Element[] }[] = [];

beforeEach(() => {
  observed = [];
  vi.stubGlobal(
    "ResizeObserver",
    class {
      entry: { callback: ResizeObserverCallback; elements: Element[] };
      constructor(callback: ResizeObserverCallback) {
        this.entry = { callback, elements: [] };
        observed.push(this.entry);
      }
      observe(element: Element) {
        this.entry.elements.push(element);
      }
      disconnect() {
        this.entry.elements = [];
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty("--pinned-actions-height");
});

it("tells the page how tall it is, so the last row clears it, and stops when it goes", () => {
  const { unmount } = render(
    <PinnedActions>
      <button type="button">Save</button>
    </PinnedActions>,
  );
  const pinned = screen.getByRole("button", { name: "Save" }).closest(".pinned-actions")!;
  vi.spyOn(pinned, "getBoundingClientRect").mockReturnValue({ height: 92 } as DOMRect);
  const entry = observed.find((o) => o.elements.includes(pinned))!;
  entry.callback([], {} as ResizeObserver);
  expect(document.documentElement.style.getPropertyValue("--pinned-actions-height")).toBe("92px");
  unmount();
  expect(document.documentElement.style.getPropertyValue("--pinned-actions-height")).toBe("");
});

it("lays its actions in a row, or one under another when asked", () => {
  const { rerender } = render(
    <PinnedActions>
      <button type="button">Start</button>
    </PinnedActions>,
  );
  expect(screen.getByRole("button", { name: "Start" }).parentElement?.className).toBe(
    "pinned-actions-row",
  );
  rerender(
    <PinnedActions stack>
      <button type="button">Start</button>
    </PinnedActions>,
  );
  expect(screen.getByRole("button", { name: "Start" }).parentElement?.className).toBe(
    "pinned-actions-stack",
  );
});
