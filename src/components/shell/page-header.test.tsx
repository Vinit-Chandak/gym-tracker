// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PageHeader } from "./page-header";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn() }) }));

afterEach(cleanup);

it("puts the meta beside the title rather than above it", () => {
  render(<PageHeader title="History" meta="29 Aug – 11 Sept 2026" />);
  const heading = screen.getByRole("heading", { level: 1, name: "History" });
  const meta = screen.getByText("29 Aug – 11 Sept 2026");
  // Same row, meta after the title: the masthead line, not a stacked eyebrow.
  expect(heading.parentElement).toBe(meta.parentElement);
  expect(heading.compareDocumentPosition(meta) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("names the way back from the section the destination belongs to", () => {
  render(<PageHeader title="Programme fit" backHref="/gyms/abc" />);
  const back = screen.getByRole("link", { name: "Back to Gyms" });
  expect(back.getAttribute("href")).toBe("/gyms/abc");
  expect(back.textContent).toBe("Gyms");
});

it("names the Profile tab from any of its sub-pages", () => {
  render(<PageHeader title="Edit profile" backHref="/profile" />);
  expect(screen.getByRole("link", { name: "Back to Profile" }).getAttribute("href")).toBe(
    "/profile",
  );
});

it("prefers a given back label to the section's own name", () => {
  render(<PageHeader title="Choose a fallback" backHref="/workouts/abc" backLabel="Exercise" />);
  expect(screen.getByRole("link", { name: "Back to Exercise" }).textContent).toBe("Exercise");
});

it("keeps the given name going back to the page it names, opened from any tab", () => {
  // A run opened from History, then corrected: Back returns to the run, and says so.
  window.history.replaceState(
    { overloadPreviousPage: "/training/activities/abc?from=history" },
    "",
    "/training/activities/abc/edit?from=history",
  );
  render(
    <PageHeader title="Correct the run" backHref="/training/activities/abc" backLabel="Run" />,
  );
  const back = screen.getByRole("link", { name: "Back to Run" });
  expect(back.getAttribute("href")).toBe("/training/activities/abc?from=history");
  cleanup();
  // Somewhere else before it, the way back names that place instead.
  window.history.replaceState({ overloadPreviousPage: "/progress/history" }, "", "/x/edit");
  render(
    <PageHeader title="Correct the run" backHref="/training/activities/abc" backLabel="Run" />,
  );
  expect(screen.getByRole("link", { name: "Back to History" })).toBeTruthy();
  window.history.replaceState(null, "", "/");
});

it("falls back to Back where the path belongs to no section", () => {
  render(<PageHeader title="Somewhere" backHref="/login" />);
  expect(screen.getByRole("link", { name: "Back" }).textContent).toBe("Back");
});
