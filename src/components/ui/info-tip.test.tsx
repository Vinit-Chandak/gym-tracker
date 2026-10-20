// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { aboutLabel, InfoTip, placeNote } from "./info-tip";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderTip() {
  return render(
    <div>
      <p>Elsewhere</p>
      <InfoTip label="About warm-ups">Warm-up sets are excluded.</InfoTip>
    </div>,
  );
}

it("opens on tap, closes on a second tap, and renders nothing while closed", () => {
  renderTip();
  const button = screen.getByRole("button", { name: "About warm-ups" });
  expect(screen.queryByRole("note")).toBeNull();
  expect(button.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(button);
  expect(screen.getByRole("note").textContent).toBe("Warm-up sets are excluded.");
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(button.getAttribute("aria-controls")).toBe(screen.getByRole("note").id);
  fireEvent.click(button);
  expect(screen.queryByRole("note")).toBeNull();
});

it("closes on a tap anywhere else and on Escape, but not on a tap inside the note", () => {
  renderTip();
  const button = screen.getByRole("button", { name: "About warm-ups" });
  fireEvent.click(button);
  fireEvent.pointerDown(screen.getByRole("note"));
  expect(screen.getByRole("note")).toBeTruthy();
  fireEvent.pointerDown(screen.getByText("Elsewhere"));
  expect(screen.queryByRole("note")).toBeNull();
  fireEvent.click(button);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(screen.queryByRole("note")).toBeNull();
});

it("keeps the note inside the screen whichever edge its button is near", () => {
  // A button at the left edge: the note starts at the margin, not off-screen.
  expect(placeNote(4, 390)).toEqual({ left: 8, width: 288 });
  // Mid-screen: sliding left just enough to keep 12px of the right edge.
  expect(placeNote(190, 390)).toEqual({ left: 390 - 12 - 288 - 190, width: 288 });
  // Plenty of room: the note simply starts under the button.
  expect(placeNote(40, 800)).toEqual({ left: 0, width: 288 });
  // A very narrow screen: the note shrinks to fit between the margins.
  expect(placeNote(100, 280)).toEqual({ left: 12 - 100, width: 256 });
});

it("consumes Escape so dismissing a note does not also close an enclosing dialog", () => {
  renderTip();
  fireEvent.click(screen.getByRole("button", { name: "About warm-ups" }));
  expect(fireEvent.keyDown(document, { key: "Escape" })).toBe(false);
  expect(screen.queryByRole("note")).toBeNull();
});

it("repositions an open note after rotating into a narrower viewport", () => {
  renderTip();
  const button = screen.getByRole("button", { name: "About warm-ups" });
  vi.spyOn(button.parentElement!, "getBoundingClientRect").mockReturnValue({
    left: 200,
  } as DOMRect);
  fireEvent.click(button);
  const width = vi.spyOn(window, "innerWidth", "get").mockReturnValue(280);
  fireEvent(window, new Event("resize"));
  expect(screen.getByRole("note").style.width).toBe("256px");
  expect(screen.getByRole("note").style.left).toBe("12px");
  width.mockRestore();
  vi.restoreAllMocks();
});

it("shows the note in the top layer where there is one, and closes it with its sheet", () => {
  const shown = vi.fn(function (this: HTMLElement) {
    this.setAttribute("data-shown", "");
  });
  // jsdom has no popover API: stand one in, as Safari 17 and Chrome 114 have.
  Object.defineProperty(HTMLElement.prototype, "showPopover", {
    value: shown,
    configurable: true,
  });
  try {
    render(
      <dialog open>
        <div style={{ overflow: "hidden", height: 60 }}>
          <InfoTip label="About supersets">Keep both exercises together.</InfoTip>
        </div>
      </dialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "About supersets" }));
    // jsdom hides every [popover] it cannot show, so the note is looked up as hidden.
    const note = screen.getByRole("note", { hidden: true });
    // Above the card's clip, but still inside the sheet in the page, so it stays interactive.
    expect(shown).toHaveBeenCalledTimes(1);
    expect(note.getAttribute("popover")).toBe("manual");
    expect(screen.getByRole("dialog").contains(note)).toBe(true);
    fireEvent.pointerDown(note);
    expect(screen.getByRole("note", { hidden: true })).toBeTruthy();
    fireEvent(screen.getByRole("dialog"), new Event("close"));
    expect(screen.queryByRole("note", { hidden: true })).toBeNull();
  } finally {
    delete (HTMLElement.prototype as { showPopover?: unknown }).showPopover;
  }
});

it("leaves focus on its button and puts the note next in reading order", () => {
  render(
    <div>
      <InfoTip label="About supersets">Keep both exercises together.</InfoTip>
      <button type="button">Save</button>
    </div>,
  );
  const button = screen.getByRole("button", { name: "About supersets" });
  button.focus();
  fireEvent.click(button);
  // A screen reader hears "expanded" on the button, then the note on its next swipe.
  expect(document.activeElement).toBe(button);
  expect(button.nextElementSibling).toBe(screen.getByRole("note"));
  expect(button.getAttribute("aria-describedby")).toBeNull();
  // Focus moving to another control closes it, so it never covers what has focus.
  const save = screen.getByRole("button", { name: "Save" });
  fireEvent.blur(button, { relatedTarget: save });
  expect(screen.queryByRole("note")).toBeNull();
});

it("names a tip after its label in the label's own case", () => {
  expect(aboutLabel("Weekly distance")).toBe("About weekly distance");
  expect(aboutLabel("Max HR")).toBe("About max HR");
  expect(aboutLabel("RIR")).toBe("About RIR");
  expect(aboutLabel("e1RM")).toBe("About e1RM");
});

it("moves long help above its button and bounds it to a keyboard-sized visual viewport", () => {
  const viewport = Object.assign(new EventTarget(), {
    width: 320,
    height: 280,
    offsetLeft: 10,
    offsetTop: 30,
  });
  vi.stubGlobal("visualViewport", viewport);
  renderTip();
  const button = screen.getByRole("button", { name: "About warm-ups" });
  vi.spyOn(button.parentElement!, "getBoundingClientRect").mockReturnValue({
    left: 250,
    top: 240,
    bottom: 272,
  } as DOMRect);
  fireEvent.click(button);
  const note = screen.getByRole("note");
  vi.spyOn(note, "getBoundingClientRect").mockReturnValue({ height: 180 } as DOMRect);
  act(() => viewport.dispatchEvent(new Event("resize")));
  expect(note.style.left).toBe("30px");
  expect(note.style.top).toBe("56px");
  expect(note.style.maxHeight).toBe("256px");
  viewport.height = 200;
  act(() => viewport.dispatchEvent(new Event("resize")));
  expect(note.style.maxHeight).toBe("176px");
  expect(note.style.top).toBe("42px");
});
