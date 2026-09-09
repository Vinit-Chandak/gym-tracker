// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { InfoTip, placeNote } from "./info-tip";

afterEach(cleanup);

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
