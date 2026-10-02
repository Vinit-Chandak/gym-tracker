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

it("lists History among Progress's sections, after the programme and Body", () => {
  route.search = "";
  render(<ProgressSections value="body" onChange={vi.fn()} action={null} />);
  expect(
    open("Body")
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["Programme", "Body", "History", "Strength", "Running", "Recovery", "Overview"]);
});

it("switches the Progress page's own sections in place", () => {
  route.search = "view=strength";
  const onChange = vi.fn();
  render(<ProgressSections value="strength" onChange={onChange} action={null} />);
  fireEvent.click(open("Strength").getByRole("button", { name: "Recovery" }));
  expect(onChange).toHaveBeenCalledWith("recovery");
});

it("opens History as a page of its own, loaded ahead, with the same dates", () => {
  route.search = "view=strength&from=2026-08-01&to=2026-09-25&series=abc";
  render(<ProgressSections value="strength" onChange={vi.fn()} action={null} />);
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
  render(<ProgressSections value="history" action={null} />);
  const sheet = open("History");
  expect(sheet.getByRole("button", { name: "History" }).getAttribute("aria-current")).toBe("true");
  expect(sheet.getByRole("link", { name: "Body" }).getAttribute("href")).toBe(
    "/progress?from=2026-08-01&to=2026-09-25&kind=run&view=body",
  );
  const overview = sheet.getByRole("link", { name: "Overview" });
  expect(overview.getAttribute("href")).toBe(
    "/progress?from=2026-08-01&to=2026-09-25&kind=run&view=overview",
  );
  // Only History is loaded whole ahead of the tap.
  expect(overview.dataset.prefetch).toBe("auto");
});

it("reads the Progress page's section from its URL, never History", () => {
  expect(pageSection(null)).toBe("body");
  expect(pageSection(null, "programme")).toBe("programme");
  expect(pageSection("body", "programme")).toBe("body");
  expect(pageSection("recovery")).toBe("recovery");
  expect(pageSection("overview")).toBe("overview");
  expect(pageSection("history")).toBe("body");
  expect(pageSection("elsewhere")).toBe("body");
});
