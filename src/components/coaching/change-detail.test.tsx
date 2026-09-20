// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import type { ProgramBlueprint } from "@/domain/program-blueprint";
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
  activateProgramDraftAction: vi.fn(),
  declineProgramChangeAction: vi.fn(),
  rejectProgramDraftAction: vi.fn(),
  requestChangeRevisionsAction: vi.fn(),
  reviewProgramDraftAction: vi.fn(),
}));
afterEach(cleanup);

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
          lineageId: "22222222-2222-4222-8222-222222222222",
          sets: 2,
          reps: [8, 12],
          rir: [1, 2],
          rest: [90, 90],
        },
      ],
    },
  ],
};

const props = (overrides: Partial<ChangeDetailProps> = {}): ChangeDetailProps => ({
  draftId: "11111111-1111-4111-8111-111111111111",
  revision: 1,
  author: "coach",
  status: "ready",
  name: "Block",
  when: "19 September 2026, 04:12",
  headline: "One extra set on the curl.",
  rationale:
    "One extra set on the curl, because the last three weeks all hit the top of the range at the prescribed effort and nothing in the session reports rose.",
  uncertainties: [],
  gateReasons: [],
  diff: diffPrograms(base, structuredClone(base)),
  names: { "barbell-curl": "Barbell curl" },
  canContinue: true,
  requests: [],
  today: "2026-09-19",
  base: "/profile/programme",
  stale: false,
  ...overrides,
});

it("offers approve, revisions and decline on a real change, and never a second programme", () => {
  const next = structuredClone(base);
  next.days[0]!.exercises[0]!.sets = 3;
  render(<ChangeDetail {...props({ diff: diffPrograms(base, next) })} />);
  expect(screen.getByRole("button", { name: "Approve changes" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Ask for revisions" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Decline these changes" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "See the full programme" })).toBeTruthy();
  expect(screen.getByText("Sets:")).toBeTruthy();
  // The one exercise that did not change is not reprinted as a whole-programme panel.
  expect(screen.queryByText(/Compare current and proposed/)).toBeNull();
});

it("gives a no-change review its reason, with nothing to apply", () => {
  render(
    <ChangeDetail
      {...props({
        headline: "",
        rationale: "Everything is progressing; nothing needs to change.",
      })}
    />,
  );
  // Said once, at the top, and not repeated in an empty box beneath it.
  expect(screen.getAllByText("No programme changes")).toHaveLength(1);
  expect(screen.getByText(/nothing needs to change/)).toBeTruthy();
  expect(screen.getByText(/Your programme stays as it is/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Approve|Use these changes/ })).toBeNull();
});

it("opens with the one line, and folds the reasoning behind it", () => {
  const next = structuredClone(base);
  next.days[0]!.exercises[0]!.sets = 3;
  render(<ChangeDetail {...props({ diff: diffPrograms(base, next) })} />);
  const headline = screen.getByText("One extra set on the curl.");
  // The explanation is reachable, but it is not what the screen opens with: it sits inside a
  // closed disclosure, and the headline outside it does not.
  expect(headline.closest("details")).toBeNull();
  const why = screen.getByText(/nothing in the session reports rose/).closest("details");
  expect(why?.open).toBe(false);
  expect(why?.textContent).toContain("Why this");
});

it("tags each changed line with the ask that produced it, and the rest as the coach's", () => {
  const next = structuredClone(base);
  next.days[0]!.exercises[0]!.sets = 3;
  next.days[0]!.exercises.push({
    exerciseSlug: "cable-crunch",
    sets: 3,
    reps: [10, 15],
    rir: [1, 2],
    rest: [60, 90],
  });
  const diff = diffPrograms(base, next);
  const added = diff.days
    .flatMap((day) => day.operations)
    .find((operation) => operation.kind === "added");
  render(
    <ChangeDetail
      {...props({
        diff,
        requests: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            summary: "More direct core work",
            quote: "more core",
            state: "proposed",
            detail: "A cable crunch on the upper day.",
            changeRefs: [added!.id],
          },
        ],
      })}
    />,
  );
  // The athlete's own words on the line they caused; everything else is the coach's call.
  expect(screen.getByText("“more core”")).toBeTruthy();
  expect(screen.getByText("Coach")).toBeTruthy();
  // Their words name the ask at the top too — but the summary and the outcome prose, which
  // the request list already carries in full, are not reprinted here.
  expect(screen.getByText(/Answers “more core”/)).toBeTruthy();
  expect(screen.queryByText("More direct core work")).toBeNull();
  expect(screen.queryByText(/A cable crunch on the upper day/)).toBeNull();
});

it("says why approval is needed without printing the guardrail's own words", () => {
  const next = structuredClone(base);
  next.days[0]!.exercises.push({
    exerciseSlug: "cable-crunch",
    sets: 3,
    reps: [10, 15],
    rir: [1, 2],
    rest: [60, 90],
  });
  render(
    <ChangeDetail
      {...props({
        diff: diffPrograms(base, next),
        gateReasons: [
          "Adding or removing exercise slots needs review.",
          "A new slot needs review.",
        ],
      })}
    />,
  );
  expect(screen.getByText(/Adds or removes an exercise, so it needs your approval/)).toBeTruthy();
  // The findings themselves are an audit trail. One of them repeated per slot is not a
  // sentence anybody reads, and it is not the coach doubting its own proposal.
  expect(screen.queryByText(/A new slot needs review/)).toBeNull();
});

it("says a structural change starts a new block rather than offering a choice", () => {
  const next = structuredClone(base);
  next.days[0]!.name = "Push";
  render(<ChangeDetail {...props({ diff: diffPrograms(base, next), canContinue: false })} />);
  expect(screen.getByText(/starts a new block/)).toBeTruthy();
  expect(screen.queryByRole("radio", { name: "Continue the current block" })).toBeNull();
  expect(screen.getByLabelText("Start date")).toBeTruthy();
});
