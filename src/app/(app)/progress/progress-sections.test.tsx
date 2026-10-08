// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";

import { pageSection, ProgressSections } from "./progress-sections";

const route = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(route.search) }));
vi.mock("@/components/ui/app-link", () => ({
  default: ({
    prefetch,
    replace,
    ...props
  }: ComponentProps<"a"> & { prefetch?: boolean; replace?: boolean }) => (
    <a data-prefetch={prefetch ?? "auto"} data-replace={replace} {...props} />
  ),
}));

const showModal = HTMLDialogElement.prototype.showModal;
const close = HTMLDialogElement.prototype.close;
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
});
afterAll(() => {
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});
afterEach(cleanup);

/** Opens the picker showing `current`, and returns its list. */
function open(current: string) {
  fireEvent.click(screen.getByRole("button", { name: `Progress section: ${current}` }));
  return within(screen.getByRole("dialog"));
}

it("lists Progress's sections as the design orders them, Overview first", () => {
  route.search = "";
  render(<ProgressSections value="overview" onChange={vi.fn()} filters={null} />);
  expect(
    open("Overview")
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual([
    "Overview",
    "History",
    "Strength",
    "Muscles",
    "Running",
    "Food",
    "Recovery",
    "Body weight",
  ]);
});

it("is Progress's opening: the title, the funnel, the section and its range", () => {
  route.search = "view=running";
  render(
    <ProgressSections
      value="running"
      onChange={vi.fn()}
      filters={<button type="button">Filters</button>}
      range="6 Jul – 29 Sept 2026"
    />,
  );
  expect(screen.getByRole("heading", { level: 1, name: "Progress" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Filters" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Progress section: Running" })).toBeTruthy();
  expect(screen.getByText("6 Jul – 29 Sept 2026")).toBeTruthy();
});

it("switches the Progress page's own sections in place", () => {
  route.search = "view=strength";
  const onChange = vi.fn();
  render(<ProgressSections value="strength" onChange={onChange} filters={null} />);
  fireEvent.click(open("Strength").getByRole("button", { name: "Recovery" }));
  expect(onChange).toHaveBeenCalledWith("recovery");
});

it("opens History as a page of its own, loaded ahead, with the same dates", () => {
  route.search = "view=strength&from=2026-08-01&to=2026-09-25&series=abc";
  render(<ProgressSections value="strength" onChange={vi.fn()} filters={null} />);
  const history = open("Strength").getByRole("link", { name: "History" });
  expect(history.getAttribute("href")).toBe(
    "/progress/history?from=2026-08-01&to=2026-09-25&series=abc",
  );
  expect(history.dataset.prefetch).toBe("true");
  // In this entry's place, as a section chosen in place is: Back leaves Progress.
  expect(history.dataset.replace).toBe("true");
});

it("goes from History to the Progress page's sections, keeping the query", () => {
  route.search = "from=2026-08-01&to=2026-09-25&kind=run";
  render(<ProgressSections value="history" filters={null} />);
  const sheet = open("History");
  expect(sheet.getByRole("button", { name: "History" }).getAttribute("aria-current")).toBe("true");
  expect(sheet.getByRole("link", { name: "Overview" }).getAttribute("href")).toBe(
    "/progress?from=2026-08-01&to=2026-09-25&kind=run",
  );
  // Body weight keeps Body's `body`, so a link made before the two were parted still opens it.
  const body = sheet.getByRole("link", { name: "Body weight" });
  expect(body.getAttribute("href")).toBe(
    "/progress?from=2026-08-01&to=2026-09-25&kind=run&view=body",
  );
  // Only History is loaded whole ahead of the tap.
  expect(body.dataset.prefetch).toBe("auto");
});

it("reads the Progress page's section from its URL, Overview when it names none", () => {
  expect(pageSection(null)).toBe("overview");
  expect(pageSection("recovery")).toBe("recovery");
  expect(pageSection("body")).toBe("body");
  expect(pageSection("muscles")).toBe("muscles");
  expect(pageSection("history")).toBe("overview");
  expect(pageSection("elsewhere")).toBe("overview");
});
