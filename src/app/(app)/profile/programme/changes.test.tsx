// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import {
  ProgrammeChanges,
  ProgrammeCoach,
  ProgrammeWaiting,
  type ProgrammeChangesData,
} from "./changes";

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
  saveCoachNotesAction: vi.fn(),
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
  sport: "strength",
  review: {
    offered: false,
    canAsk: false,
    running: false,
    waiting: null,
    nextOn: null,
    lastOn: null,
  },
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
            fresh: false,
            fromCoach: true,
            asks: ["anytime does not have horizontal leg press"],
            answers: [],
            rationale: null,
            lead: "edit",
          },
        ],
        waiting: 1,
      })}
    />,
  );
  const row = screen.getByRole("link", { name: /falls back to the 45° machine/ });
  expect(row.getAttribute("href")).toBe(`/plan/drafts/${DRAFT}`);
  expect(row.textContent).toContain("“anytime does not have horizontal leg press”");
  expect(row.textContent).not.toContain("You asked");
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
  // This programme's own, as its page lists them.
  expect(link.getAttribute("href")).toBe("/plan/history?sport=strength");
  expect(link.textContent).toContain("2 requests ·\u00a01 change");
  expect(screen.queryByText("Settled requests")).toBeNull();
  expect(screen.queryByText("Reviews")).toBeNull();
});

it("says nothing is waiting in one line when nothing is", () => {
  render(<ProgrammeChanges data={data()} />);
  expect(screen.getByText("Nothing is waiting for you.")).toBeTruthy();
});

it("tells a review waiting for the next nightly run from one running, and offers to start it", () => {
  const review = { offered: true, nextOn: null, lastOn: null };
  const { unmount } = render(
    <ProgrammeChanges
      data={data({ review: { ...review, canAsk: false, running: true, waiting: null } })}
    />,
  );
  expect(screen.getByText("The coach is reviewing your programme.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /ask the coach/i })).toBeNull();
  unmount();

  render(
    <ProgrammeChanges
      data={data({
        review: { ...review, canAsk: true, running: false, waiting: { attempted: true } },
      })}
    />,
  );
  expect(screen.queryByText("The coach is reviewing your programme.")).toBeNull();
  expect(screen.getByText("The coach could not finish your last review.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Ask the coach to review now" })).toBeTruthy();
});

/** ADR 0058: a run, ride or swim programme's page holds what the strength Changes tab holds. */
it("gives a running programme's page its own waiting, coach and history parts", () => {
  const running = data({
    sport: "running",
    proposals: [
      {
        id: DRAFT,
        title: "Half Marathon Build",
        fresh: true,
        fromCoach: true,
        asks: [],
        answers: [],
        rationale: null,
        lead: "edit",
      },
    ],
    questions: [request({ quote: "fewer intervals" })],
    withCoach: [
      request({
        id: "00000000-0000-4000-8000-000000000002",
        quote: "a longer long run",
        state: "waiting",
        detail: "",
      }),
    ],
    recent: [{ id: DRAFT, title: "Easy runs a little shorter.", when: "Sat 17 Oct" }],
    history: { requests: 1, changes: 0 },
    waiting: 2,
  });
  const { unmount } = render(<ProgrammeWaiting data={running} />);
  expect(screen.getByRole("heading", { name: "Waiting for you" })).toBeTruthy();
  // A new programme the coach wrote while one runs says what it is: there is no difference.
  expect(screen.getByRole("link", { name: /Half Marathon Build/ }).textContent).toContain(
    "New programme to review",
  );
  expect(screen.getByRole("button", { name: "Send answer" })).toBeTruthy();
  // Nothing of the rest: the weeks stand between.
  expect(screen.queryByText("With the coach")).toBeNull();
  unmount();

  render(<ProgrammeCoach data={running} request={{ noteId: DRAFT }} />);
  expect(screen.queryByRole("heading", { name: "Waiting for you" })).toBeNull();
  expect(screen.getByText("With the coach").closest("details")?.open).toBe(false);
  expect(screen.getByRole("heading", { name: "Updated by the coach" })).toBeTruthy();
  expect(screen.getByText("Request a change")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Past requests and changes/ }).getAttribute("href")).toBe(
    "/plan/history?sport=running",
  );
});

it("shows no waiting heading on a programme's page when nothing waits", () => {
  const { container } = render(<ProgrammeWaiting data={data({ sport: "cycling" })} />);
  expect(container.textContent).toBe("");
});
