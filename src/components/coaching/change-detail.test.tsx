// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { summariseProgramDiff } from "@/domain/program-change-summary";
import { diffPrograms } from "@/domain/program-diff";

import { ChangeDetail, type ChangeDetailProps } from "./change-detail";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  unstable_rethrow: () => {},
}));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/coaching-workflow", () => ({
  approveProgramChangeAction: vi.fn(),
  declineProgramChangeAction: vi.fn(),
  rejectProgramDraftAction: vi.fn(),
  requestChangeRevisionsAction: vi.fn(),
}));
afterEach(cleanup);

const CURL = "22222222-2222-4222-8222-222222222222";

const base: ProgramBlueprint = {
  blueprintVersion: 1,
  slug: "block",
  name: "Block",
  weeks: 6,
  notes: "",
  runs: [],
  days: [
    {
      dayIndex: 1,
      dayOfWeek: 1,
      name: "Upper",
      focus: "",
      timeNote: "",
      effortNote: "",
      notes: "",
      includesLifting: true,
      includesRun: false,
      warmupSlug: "",
      exercises: [
        {
          exerciseSlug: "barbell-curl",
          lineageId: CURL,
          sets: 2,
          reps: [8, 12],
          rir: [1, 2],
          rest: [90, 90],
        },
      ],
    },
  ],
};

const oneMoreSet = () => {
  const next = structuredClone(base);
  next.days[0]!.exercises[0]!.sets = 3;
  return summariseProgramDiff(diffPrograms(base, next));
};

const props = (overrides: Partial<ChangeDetailProps> = {}): ChangeDetailProps => ({
  draftId: "11111111-1111-4111-8111-111111111111",
  revision: 1,
  author: "coach",
  status: "ready",
  outcome: null,
  headline: "One extra set on the curl.",
  rationale:
    "One extra set on the curl, because the last three weeks all hit the top of the range at the prescribed effort.",
  uncertainties: [],
  summary: oneMoreSet(),
  names: { "barbell-curl": "Barbell curl" },
  canContinue: true,
  requests: [],
  today: "2026-09-19",
  base: "/profile/programme",
  ...overrides,
});

it("is the one line, the difference, and three answers — nothing said twice", () => {
  render(<ChangeDetail {...props()} />);
  expect(screen.getByRole("heading", { name: "One extra set on the curl." })).toBeTruthy();
  expect(screen.getByText("Sets:")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Ask for changes" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
  // None of what the screen used to restate around the decision.
  for (const gone of [
    /Awaiting approval/,
    /Your decision/,
    /needs your approval/,
    /Check this against your current training data/,
    /When should this take effect/,
    /Takes effect from your next unstarted session/,
    /Answers “/,
  ])
    expect(screen.queryByText(gone)).toBeNull();
});

it("puts the whole programme after the difference, as it would be with the change", () => {
  render(<ChangeDetail {...props()} />);
  const link = screen.getByRole("link", { name: "See the full programme with these changes" });
  expect(link.getAttribute("href")).toBe(
    "/profile/programme/drafts/11111111-1111-4111-8111-111111111111/programme",
  );
  // It is the last thing on the screen, below the answers.
  const approve = screen.getByRole("button", { name: "Approve" });
  expect(approve.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it("offers the coach's reasoning only for a change nobody asked for", () => {
  const { unmount } = render(<ChangeDetail {...props()} />);
  expect(screen.getByText("Why")).toBeTruthy();
  unmount();
  render(
    <ChangeDetail
      {...props({
        requests: [{ id: "r1", quote: "more curl volume please", changeRefs: [`slot:${CURL}`] }],
      })}
    />,
  );
  // They asked for it; the reason is theirs, and it is on the line it produced.
  expect(screen.queryByText("Why")).toBeNull();
  expect(screen.getByText("“more curl volume please”")).toBeTruthy();
});

it("still offers the reasoning for the part of a change nobody asked for", () => {
  const next = structuredClone(base);
  next.days[0]!.exercises[0]!.sets = 3;
  next.days[0]!.exercises.push({
    exerciseSlug: "cable-crunch",
    sets: 2,
    reps: [10, 15],
    rir: [1, 2],
    rest: [60, 75],
  });
  render(
    <ChangeDetail
      {...props({
        summary: summariseProgramDiff(diffPrograms(base, next)),
        names: { "barbell-curl": "Barbell curl", "cable-crunch": "Cable crunch" },
        // The ask produced the curl's extra set; the crunch is the coach's own idea.
        requests: [{ id: "r1", quote: "more curl volume please", changeRefs: [`slot:${CURL}`] }],
      })}
    />,
  );
  expect(screen.getByText("Why")).toBeTruthy();
});

it("tags only the lines an ask produced, and nothing as the coach's", () => {
  render(
    <ChangeDetail
      {...props({
        requests: [{ id: "r1", quote: "more curl volume please", changeRefs: [`slot:${CURL}`] }],
      })}
    />,
  );
  expect(screen.getAllByText("“more curl volume please”")).toHaveLength(1);
  expect(screen.queryByText("Coach")).toBeNull();
});

it("asks for a start date only when the change has to start a new block", () => {
  const { unmount } = render(<ChangeDetail {...props()} />);
  expect(screen.queryByLabelText("Start date")).toBeNull();
  unmount();
  render(<ChangeDetail {...props({ canContinue: false })} />);
  expect(screen.getByText(/starts a new block/)).toBeTruthy();
  expect(screen.getByLabelText("Start date")).toBeTruthy();
});

it("says how a settled change ended, with nothing left to decide", () => {
  render(<ChangeDetail {...props({ status: "activated", outcome: "Applied 19 Sept." })} />);
  expect(screen.getByText("Applied 19 Sept.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  expect(screen.getByRole("link", { name: "See the full programme it made" })).toBeTruthy();
});

it("says the programme is unchanged rather than drawing an empty change, and can still be answered", () => {
  render(
    <ChangeDetail
      {...props({ summary: summariseProgramDiff(diffPrograms(base, structuredClone(base))) })}
    />,
  );
  expect(screen.getByText("No programme changes")).toBeTruthy();
  // A change that only rewrites the description, or only weeks already behind, prints
  // nothing here — but it is still open, so it can still be approved or declined.
  expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
});

it("carries an ask's words onto a change to the programme itself", () => {
  const next = { ...structuredClone(base), weeks: 10 };
  render(
    <ChangeDetail
      {...props({
        summary: summariseProgramDiff(diffPrograms(base, next)),
        requests: [{ id: "r1", quote: "make it ten weeks", changeRefs: ["program:weeks"] }],
      })}
    />,
  );
  expect(screen.getByText("“make it ten weeks”")).toBeTruthy();
  // It was asked for, so there is no reasoning to offer for it.
  expect(screen.queryByText("Why")).toBeNull();
});
