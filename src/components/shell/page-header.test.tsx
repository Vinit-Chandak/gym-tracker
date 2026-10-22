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
    { overloadPreviousPage: "/progress/activities/abc?from=history" },
    "",
    "/progress/activities/abc/edit?from=history",
  );
  render(
    <PageHeader title="Correct the run" backHref="/progress/activities/abc" backLabel="Run" />,
  );
  const back = screen.getByRole("link", { name: "Back to Run" });
  expect(back.getAttribute("href")).toBe("/progress/activities/abc?from=history");
  cleanup();
  // Somewhere else before it, the way back names that place instead.
  window.history.replaceState({ overloadPreviousPage: "/progress/history" }, "", "/x/edit");
  render(
    <PageHeader title="Correct the run" backHref="/progress/activities/abc" backLabel="Run" />,
  );
  expect(screen.getByRole("link", { name: "Back to History" })).toBeTruthy();
  window.history.replaceState(null, "", "/");
});

/**
 * Year audit, October 2026: a friend's shared workout went back to their page as "People", the
 * name of the list you follow them from. Their page is named by who they are; comparing with
 * them by Compare, wherever it is the page before.
 */
it("names a person's page by the name it is given, never as People", () => {
  window.history.replaceState(null, "", "/u/aarav/activities/abc");
  render(<PageHeader title="Workout" backHref="/u/aarav" backLabel="Aarav Sharma" />);
  expect(screen.getByRole("link", { name: "Back to Aarav Sharma" }).getAttribute("href")).toBe(
    "/u/aarav",
  );
  cleanup();
  // Opened from a point on a comparison's graph, the way back names the comparison.
  window.history.replaceState(
    { overloadPreviousPage: "/u/aarav/compare/bench" },
    "",
    "/u/aarav/activities/abc",
  );
  render(<PageHeader title="Workout" backHref="/u/aarav" backLabel="Aarav Sharma" />);
  expect(screen.getByRole("link", { name: "Back to Compare" }).getAttribute("href")).toBe(
    "/u/aarav/compare/bench",
  );
  window.history.replaceState(null, "", "/");
});

it("falls back to Back where the path belongs to no section", () => {
  render(<PageHeader title="Somewhere" backHref="/login" />);
  expect(screen.getByRole("link", { name: "Back" }).textContent).toBe("Back");
});

/**
 * Owner, 21 October 2026 (DESIGN.md, Tab roots): the lit tab already says where you are, so a
 * tab's root opens on its subject, in Title, never on the tab's name; its h1 still names the tab
 * first for a screen reader.
 */
it("opens a tab's root on its subject, the h1 naming the tab first", () => {
  render(
    <PageHeader
      tab="Today"
      title="Wednesday"
      said="21 October"
      meta="21 October · 1 of 3 done"
      action={<a href="/today/log">Log</a>}
    />,
  );
  const heading = screen.getByRole("heading", { level: 1, name: "Today, Wednesday 21 October" });
  // Only the subject is shown: the tab and the date the line under it shows are said.
  const shown = [...heading.childNodes]
    .filter((node) => !(node instanceof Element && node.classList.contains("sr-only")))
    .map((node) => node.textContent)
    .join("")
    .trim();
  expect(shown).toBe("Wednesday");
  expect(heading.className).toContain("page-root-title");
  expect(screen.getByText("21 October · 1 of 3 done").closest(".page-root-meta")).not.toBeNull();
  expect(screen.getByRole("link", { name: "Log" }).closest(".page-root-action")).not.toBeNull();
  // No way back: a root is where a tab starts.
  expect(screen.queryByRole("link", { name: /^Back/ })).toBeNull();
});

it("stands a chooser where the headline stands, the h1 naming it for a screen reader", () => {
  render(
    <PageHeader
      tab="Progress"
      title="Running"
      chooser={<button type="button">Running</button>}
      meta="6 Jul – 29 Sept 2026"
    />,
  );
  const heading = screen.getByRole("heading", { level: 1, name: "Progress, Running" });
  expect(heading.className).toBe("sr-only");
  expect(
    screen.getByRole("button", { name: "Running" }).closest(".page-root-chooser"),
  ).not.toBeNull();
  // With nothing at its end, the headline has the row.
  expect(document.querySelector(".page-root-action")).toBeNull();
  expect((document.querySelector(".page-root-head") as HTMLElement).style.flexBasis).toBe("");
});

it("leads with the avatar, and keeps the headline its own room before its action", () => {
  render(
    <PageHeader
      tab="Profile"
      title="Vinit Chandak"
      lead={<span data-testid="avatar">V</span>}
      meta="@vinit"
      action={<a href="/profile/edit">Edit</a>}
    />,
  );
  expect(screen.getByRole("heading", { level: 1, name: "Profile, Vinit Chandak" })).toBeTruthy();
  expect(screen.getByTestId("avatar").closest(".page-root-lead")).not.toBeNull();
  // Edit goes under the name where the name would not have its own width beside it, and the
  // name goes under the avatar where its longest word would not.
  const head = document.querySelector(".page-root-head") as HTMLElement;
  expect(head.style.flexBasis).toContain("6.76 * var(--ov-type-title) + 70 * var(--ov-u)");
  const text = document.querySelector(".page-root-text") as HTMLElement;
  expect(text.style.flexBasis).toContain("3.92 * var(--ov-type-title)");
});
