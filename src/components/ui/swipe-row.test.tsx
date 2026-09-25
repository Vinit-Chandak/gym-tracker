// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

import { SwipeRow } from "./swipe-row";

// jsdom lays nothing out, so the action is given the width a browser would give it.
const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 88,
  });
});
afterAll(() => {
  if (offsetWidth) Object.defineProperty(HTMLElement.prototype, "offsetWidth", offsetWidth);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup() {
  const onAction = vi.fn();
  const onOpen = vi.fn();
  const { container } = render(
    <SwipeRow action="Delete" actionLabel="Delete Lunch" onAction={onAction}>
      <button type="button" onClick={onOpen}>
        Lunch
      </button>
    </SwipeRow>,
  );
  return {
    row: screen.getByRole("button", { name: "Lunch" }),
    action: container.querySelector<HTMLButtonElement>('[aria-label="Delete Lunch"]')!,
    onAction,
    onOpen,
  };
}

/** A finger laid on the row and moved by `dx`, `dy` in five steps. */
function drag(element: Element, dx: number, dy = 0) {
  const at = (step: number) => ({
    pointerId: 1,
    pointerType: "touch",
    clientX: 200 + (dx * step) / 5,
    clientY: 100 + (dy * step) / 5,
  });
  fireEvent.pointerDown(element, at(0));
  for (let step = 1; step <= 5; step++) fireEvent.pointerMove(element, at(step));
  fireEvent.pointerUp(element, at(5));
}

it("keeps its action out of reach until the row is swiped open", () => {
  const { row, action, onAction } = setup();
  expect(action.hasAttribute("inert")).toBe(true);
  drag(row, -70);
  expect(action.hasAttribute("inert")).toBe(false);
  fireEvent.click(action);
  expect(onAction).toHaveBeenCalledTimes(1);
  // Using the action closes the row again.
  expect(action.hasAttribute("inert")).toBe(true);
});

it("springs back from a swipe that did not reach half the action", () => {
  const { row, action } = setup();
  drag(row, -30);
  expect(action.hasAttribute("inert")).toBe(true);
});

it("leaves a mostly vertical movement to the page, which is scrolling", () => {
  const { row, action } = setup();
  drag(row, -40, 80);
  expect(action.hasAttribute("inert")).toBe(true);
});

it("never treats the click at the end of a swipe as a tap on the row", () => {
  const { row, onOpen } = setup();
  drag(row, -70);
  fireEvent.click(row);
  expect(onOpen).not.toHaveBeenCalled();
});

it("closes on a later tap, without opening what the row opens", () => {
  const { row, action, onOpen } = setup();
  const now = vi.spyOn(performance, "now").mockReturnValue(1_000);
  drag(row, -70);
  now.mockReturnValue(5_000);
  fireEvent.click(row);
  expect(onOpen).not.toHaveBeenCalled();
  expect(action.hasAttribute("inert")).toBe(true);
  // Closed, it is an ordinary row again.
  fireEvent.click(row);
  expect(onOpen).toHaveBeenCalledTimes(1);
});

it("closes when anything else is touched", () => {
  const { row, action } = setup();
  drag(row, -70);
  fireEvent.pointerDown(document.body);
  expect(action.hasAttribute("inert")).toBe(true);
});
