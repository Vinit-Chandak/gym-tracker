// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import type { NamedOccurrence } from "@/server/repositories/occurrences";

import { AnsweredSession } from "./answered-session";

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
  ...overrides,
});

/** Meera's run of 31 August: it answered cycle 10's tempo run, planned for the 20th. */
it("names the programme session it answered, and leads to it", () => {
  const { container } = render(<AnsweredSession session={session()} year="2026" />);
  expect(container.textContent).toBe(
    "This answered Tempo run, cycle 10, planned for Thu\u00a020\u00a0Aug.",
  );
  expect(screen.getByRole("link", { name: "Tempo run" }).getAttribute("href")).toBe(
    `/training/programme/occurrences/${ID}`,
  );
});

it("says the year of a session planned in another one", () => {
  const { container } = render(
    <AnsweredSession session={session({ scheduledOn: "2025-12-18" })} year="2026" />,
  );
  expect(container.textContent).toBe(
    "This answered Tempo run, cycle 10, planned for Thu\u00a018\u00a0Dec\u00a02025.",
  );
});

it("names a session the athlete scheduled themselves as theirs", () => {
  const { container } = render(
    <AnsweredSession
      session={session({ sport: "swimming", familyId: null, cycleIndex: null, dayName: null })}
      year="2026"
    />,
  );
  expect(container.textContent).toBe(
    "This answered the swim you scheduled for Thu\u00a020\u00a0Aug.",
  );
  expect(screen.getByRole("link", { name: "the swim you scheduled" })).toBeTruthy();
});

it("falls back to the sport when the programme's day cannot be named", () => {
  const { container } = render(
    <AnsweredSession session={session({ dayName: null })} year="2026" />,
  );
  expect(container.textContent).toBe(
    "This answered the programme's run planned for Thu\u00a020\u00a0Aug.",
  );
});
