// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { StrictMode, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { ConfirmSheet } from "../confirm-sheet";
import { FilterSheet } from "./filter-sheet";
import { Sheet } from "./sheet";

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

function ControlledSheet({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <Sheet
      open={open}
      title="Choose a section"
      onClose={() => {
        onClose();
        setOpen(false);
      }}
    >
      <button>First choice</button>
    </Sheet>
  );
}

it("notifies once when a controlled sheet closes", () => {
  const onClose = vi.fn();
  render(<ControlledSheet onClose={onClose} />);
  fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("routes Escape through controlled state and starts focus before the choices", () => {
  const onClose = vi.fn();
  render(<ControlledSheet onClose={onClose} />);
  const dialog = screen.getByRole("dialog", { name: "Choose a section" });
  expect(
    document.activeElement?.contains(screen.getByRole("button", { name: "First choice" })),
  ).toBe(true);
  const cancel = new Event("cancel", { cancelable: true });
  fireEvent(dialog, cancel);
  expect(cancel.defaultPrevented).toBe(true);
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(dialog.hasAttribute("open")).toBe(false);
});

it("keeps pending destructive requests open for Escape, backdrop and close-button taps", () => {
  const onClose = vi.fn();
  render(
    <ConfirmSheet
      open
      onClose={onClose}
      title="Delete workout?"
      description="This removes the workout."
      confirmLabel="Delete"
      pendingLabel="Deleting…"
      pending
      error={null}
      onConfirm={vi.fn()}
    />,
  );
  const dialog = screen.getByRole("dialog");
  const cancel = new Event("cancel", { cancelable: true });
  fireEvent(dialog, cancel);
  fireEvent.click(dialog);
  fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));
  expect(cancel.defaultPrevented).toBe(true);
  expect(onClose).not.toHaveBeenCalled();
  expect(dialog.hasAttribute("open")).toBe(true);
});

it("sizes footerless sheets to the visual viewport when the software keyboard opens", () => {
  const viewport = Object.assign(new EventTarget(), { height: 720, offsetTop: 0 });
  vi.stubGlobal("visualViewport", viewport);
  render(<ControlledSheet onClose={vi.fn()} />);
  const dialog = screen.getByRole("dialog");
  expect(dialog.style.getPropertyValue("--sheet-height")).toBe(`${720 * 0.94}px`);
  viewport.height = 280;
  viewport.offsetTop = 20;
  act(() => viewport.dispatchEvent(new Event("resize")));
  expect(dialog.style.getPropertyValue("--sheet-height")).toBe(`${280 * 0.94}px`);
  expect(dialog.style.getPropertyValue("--sheet-bottom")).toBe(`${window.innerHeight - 300}px`);
});

it("names the filter button even when its visible label is hidden on narrow phones", () => {
  render(<FilterSheet title="History filters">{() => <p>Filters</p>}</FilterSheet>);
  const button = screen.getByRole("button", { name: "Filters" });
  expect(button.getAttribute("aria-label")).toBe("Filters");
  fireEvent.click(button);
  expect(screen.getByRole("dialog", { name: "History filters" })).toBeTruthy();
});

it("stays open when it mounts open under React's development double mount", async () => {
  // As browsers do, the close event comes later, as a task: after the sheet has come back.
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
      setTimeout(() => this.dispatchEvent(new Event("close")), 0);
    },
  });
  const onClose = vi.fn();
  render(
    <StrictMode>
      <Sheet open title="Which chest press is it?" onClose={onClose}>
        <button>Selectorised</button>
      </Sheet>
    </StrictMode>,
  );
  await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
  expect(onClose).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", { hidden: true }).hasAttribute("open")).toBe(true);
});

it("closes itself on leaving the page, so focus goes back, without saying the person closed it", () => {
  const onClose = vi.fn();
  const { unmount } = render(
    <Sheet open title="About Smith machine" onClose={onClose}>
      <p>Squats and presses with the bar on a guided path</p>
    </Sheet>,
  );
  const dialog = screen.getByRole("dialog", { hidden: true });
  const close = vi.spyOn(dialog as HTMLDialogElement, "close");
  unmount();
  expect(close).toHaveBeenCalledTimes(1);
  expect(onClose).not.toHaveBeenCalled();
});
