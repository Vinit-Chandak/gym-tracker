// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { ProgrammeChanges, type ProgrammeChangesData } from "./changes";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  unstable_rethrow: () => {},
}));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/coaching-workflow", () => ({
  answerProgramRequestAction: vi.fn(),
  withdrawProgramRequestAction: vi.fn(),
  requestProgramReviewAction: vi.fn(),
}));
vi.mock("@/server/actions/coach", () => ({
  applyProposalAction: vi.fn(),
  rejectProposalAction: vi.fn(),
}));
afterEach(cleanup);

const DRAFT = "00000000-0000-4000-8000-0000000000aa";

const data = (overrides: Partial<ProgrammeChangesData> = {}): ProgrammeChangesData => ({
  changes: [],
  legacy: [],
  requests: [],
  withCoach: [],
  settled: [],
  reviews: [],
  waiting: 0,
  review: { offered: false, canAsk: false, running: false, nextOn: null },
  ...overrides,
});

const request = (overrides: Partial<ProgrammeChangesData["requests"][number]> = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  summary: "More direct core work",
  quote: "and more direct core work please",
  state: "proposed" as const,
  detail: "Two direct core slots added.",
  condition: "",
  reconsiderAfter: null,
  when: "Sat 19 Sept, 20:15",
  draftId: DRAFT,
  ...overrides,
});

const change = {
  id: DRAFT,
  name: "8-Week Strength + Aesthetics Hybrid",
  when: "Sat 19 Sept, 20:15",
  fromCoach: true,
  summary: "2 added across 2 days",
};

it("lists a proposed change once, under the ask that produced it", () => {
  // The loader drops a draft an open ask already speaks for, so the screen only ever draws
  // one route into it. Anything else is the same change offered three times over.
  render(<ProgrammeChanges data={data({ requests: [request()], waiting: 1 })} />);
  expect(screen.getByText("More direct core work")).toBeTruthy();
  expect(screen.queryByText("8-Week Strength + Aesthetics Hybrid")).toBeNull();
  expect(
    screen.getAllByRole("link", { name: "See the change" }).map((a) => a.getAttribute("href")),
  ).toEqual([`/profile/programme/drafts/${DRAFT}`]);
});

it("still shows a change nobody asked for", () => {
  render(<ProgrammeChanges data={data({ changes: [change], waiting: 1 })} />);
  const link = screen.getByRole("link", { name: /8-Week Strength \+ Aesthetics Hybrid/ });
  expect(link.getAttribute("href")).toBe(`/profile/programme/drafts/${DRAFT}`);
});

it("folds away asks that are back with the coach", () => {
  render(
    <ProgrammeChanges
      data={data({
        requests: [request({ state: "needs_answer", detail: "Which curl did you mean?" })],
        withCoach: [
          request({
            id: "00000000-0000-4000-8000-000000000002",
            summary: "Add Bayesian cable curls",
            state: "waiting",
            detail: "You asked for revisions.",
            draftId: null,
          }),
        ],
        waiting: 1,
      })}
    />,
  );
  // What needs the athlete is drawn; what is merely waiting on the next run is one row.
  expect(screen.getByText("Needs your answer")).toBeTruthy();
  const folded = screen.getByText("With the coach").closest("details");
  expect(folded?.open).toBe(false);
  expect(folded?.textContent).toContain("Add Bayesian cable curls");
});

it("keeps a review in the history once its change has an outcome", () => {
  render(
    <ProgrammeChanges
      data={data({
        reviews: [
          {
            id: "review-1",
            when: "Sat 19 Sept, 20:15",
            outcome: "proposal",
            rationale: "Two direct core slots added.",
            draftId: DRAFT,
          },
        ],
      })}
    />,
  );
  expect(screen.getByRole("link", { name: /A change was proposed/ })).toBeTruthy();
});
