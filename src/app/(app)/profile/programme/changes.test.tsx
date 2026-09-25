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
  proposals: [],
  legacy: [],
  questions: [],
  withCoach: [],
  recent: [],
  history: { requests: 0, changes: 0 },
  waiting: 0,
  review: { offered: false, canAsk: false, running: false, nextOn: null, lastOn: null },
  ...overrides,
});

const request = (overrides: Partial<ProgrammeChangesData["questions"][number]> = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  quote: "and more direct core work please",
  state: "needs_answer" as const,
  detail: "Which day has the most time?",
  condition: "",
  reconsiderAfter: null,
  draftId: null,
  ...overrides,
});

it("shows one proposal as one row: what it does, and the ask it answers", () => {
  render(
    <ProgrammeChanges
      data={data({
        proposals: [
          {
            id: DRAFT,
            title: "Lower B's leg press falls back to the 45° machine at Anytime.",
            fromCoach: true,
            asks: ["anytime does not have horizontal leg press"],
          },
        ],
        waiting: 1,
      })}
    />,
  );
  const row = screen.getByRole("link", { name: /falls back to the 45° machine/ });
  expect(row.getAttribute("href")).toBe(`/profile/programme/drafts/${DRAFT}`);
  expect(row.textContent).toContain("You asked: “anytime does not have horizontal leg press”");
  // No badge under a heading that already says it waits for them, and no date.
  expect(screen.queryByText("Awaiting your approval")).toBeNull();
  expect(screen.queryByText(/Asked /)).toBeNull();
});

it("answers a question where it is asked, and folds what is back with the coach", () => {
  render(
    <ProgrammeChanges
      data={data({
        questions: [request()],
        withCoach: [
          request({
            id: "00000000-0000-4000-8000-000000000002",
            quote: "Bayesian curls",
            state: "waiting",
            detail: "",
          }),
        ],
        waiting: 1,
      })}
    />,
  );
  expect(screen.getByRole("button", { name: "Send answer" })).toBeTruthy();
  const folded = screen.getByText("With the coach").closest("details");
  expect(folded?.open).toBe(false);
  expect(folded?.textContent).toContain("Bayesian curls");
});

it("keeps everything settled behind one row instead of printing it", () => {
  render(<ProgrammeChanges data={data({ history: { requests: 2, changes: 1 } })} />);
  const link = screen.getByRole("link", { name: /Past requests and changes/ });
  expect(link.getAttribute("href")).toBe("/profile/programme/history");
  expect(link.textContent).toContain("2 requests · 1 change");
  expect(screen.queryByText("Settled requests")).toBeNull();
  expect(screen.queryByText("Reviews")).toBeNull();
});

it("says nothing is waiting in one line when nothing is", () => {
  render(<ProgrammeChanges data={data()} />);
  expect(screen.getByText("Nothing is waiting for you.")).toBeTruthy();
});
