// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { Route } from "next";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import type { NamedOccurrence } from "@/server/repositories/occurrences";

import { answeredName, CountsAsRow } from "./answered-session";

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);

const ID = "51d39937-e190-438e-a2f7-047d7b823112";

const session = (overrides: Partial<NamedOccurrence> = {}): NamedOccurrence => ({
  id: ID,
  sport: "running",
  scheduledOn: "2026-08-20",
  familyId: "49c8d04c-7f86-481a-a292-c6012d71b946",
  cycleIndex: 10,
  dayName: "Tempo run",
  dayFocus: null,
  closed: false,
  ...overrides,
});

/** Meera's run of 31 August: it answered cycle 10's tempo run, planned for the 20th. */
it("names the session it answered by its day and the day it was planned for", () => {
  expect(answeredName(session(), "2026")).toBe("Tempo run ·\u00a0Thu\u00a020\u00a0Aug");
});

it("says the year of a session planned in another one", () => {
  expect(answeredName(session({ scheduledOn: "2025-12-18" }), "2026")).toBe(
    "Tempo run ·\u00a0Thu\u00a018\u00a0Dec\u00a02025",
  );
});

it("names a session with no day of its own by its sport", () => {
  // One the athlete scheduled themselves, and a programme's whose day cannot be named.
  expect(
    answeredName(
      session({ sport: "swimming", familyId: null, cycleIndex: null, dayName: null }),
      "2026",
    ),
  ).toBe("Swim ·\u00a0Thu\u00a020\u00a0Aug");
  expect(answeredName(session({ dayName: null }), "2026")).toBe("Run ·\u00a0Thu\u00a020\u00a0Aug");
});

/**
 * One row for one fact: "Counts as", what it counts as, and a way to it. It said "This answered
 * Tempo run, cycle 10, planned for Thu 20 Aug." over "Change what it counts as".
 */
it("says what it counts as in one row that opens where it can change", () => {
  const href = `/progress/activities/a1/counts-as` as Route;
  render(<CountsAsRow value="Tempo run · Thu 20 Aug" href={href} />);
  const row = screen.getByRole("link");
  expect(row.textContent).toBe("Counts asTempo run · Thu 20 Aug");
  expect(row.getAttribute("href")).toBe(href);
});
