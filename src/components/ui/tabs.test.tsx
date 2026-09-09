// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { useState } from "react";
import { Tabs } from "./tabs";

afterEach(cleanup);
const options = [
  { value: "overview", label: "Overview" },
  { value: "strength", label: "Strength" },
  { value: "body", label: "Body" },
];
function Example() {
  const [value, setValue] = useState("overview");
  return (
    <>
      <Tabs name="test" label="Progress" options={options} value={value} onChange={setValue} />
      <div role="tabpanel" id="test-panel" aria-labelledby={`test-${value}-tab`}>
        {value}
      </div>
    </>
  );
}
it("changes the panel with one click and leaves just one tab in keyboard order", () => {
  render(<Example />);
  fireEvent.click(screen.getByRole("tab", { name: "Body" }));
  expect(screen.getByRole("tabpanel").textContent).toBe("body");
  expect(screen.getAllByRole("tab").filter((tab) => tab.tabIndex === 0)).toEqual([
    screen.getByRole("tab", { name: "Body" }),
  ]);
});
it("moves focus and selection with arrows, Home and End, wrapping at either end", () => {
  render(<Example />);
  fireEvent.keyDown(screen.getByRole("tab", { name: "Overview" }), { key: "ArrowLeft" });
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Body" }));
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Overview" }));
  fireEvent.keyDown(document.activeElement!, { key: "End" });
  expect(screen.getByRole("tabpanel").textContent).toBe("body");
  fireEvent.keyDown(document.activeElement!, { key: "Home" });
  expect(screen.getByRole("tabpanel").textContent).toBe("overview");
});
