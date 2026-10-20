// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { Disclosure } from "./disclosure";

afterEach(cleanup);

it("opens itself when a field folded inside it fails the browser's own check", () => {
  const { container } = render(
    <form>
      <Disclosure summary="Date and notes">
        <input aria-label="Date" required />
      </Disclosure>
    </form>,
  );
  const details = container.querySelector("details")!;
  expect(details.open).toBe(false);
  // What a Save does first: the browser checks every field, folded or not.
  fireEvent.invalid(screen.getByLabelText("Date"));
  expect(details.open).toBe(true);
});

it("reads the figure at the end of its row after a pause", () => {
  const { container } = render(
    <Disclosure summary="What the coach is unsure about" meta="6">
      <p>Inside</p>
    </Disclosure>,
  );
  expect(container.querySelector("summary")!.textContent).toBe("What the coach is unsure about, 6");
});
