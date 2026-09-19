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
  rationale: "One extra set on the curl.",
  uncertainties: [],
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

it("gives a no-change review a reason and request outcomes, with nothing to apply", () => {
  render(
    <ChangeDetail
      {...props({
        rationale: "Everything is progressing; nothing needs to change.",
        requests: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            summary: "Add Bayesian cable curls",
            quote: "Can I have Bayesian cable curls?",
            state: "not_recommended",
            detail: "Your cable station has no adjustable low pulley for this variation.",
          },
        ],
      })}
    />,
  );
  expect(screen.getAllByText("No programme changes").length).toBeGreaterThan(0);
  expect(screen.getByText(/nothing needs to change/)).toBeTruthy();
  expect(screen.getByText("Add Bayesian cable curls")).toBeTruthy();
  expect(screen.getByText(/no adjustable low pulley/)).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Approve|Use these changes/ })).toBeNull();
});

it("says a structural change starts a new block rather than offering a choice", () => {
  const next = structuredClone(base);
  next.days[0]!.name = "Push";
  render(<ChangeDetail {...props({ diff: diffPrograms(base, next), canContinue: false })} />);
  expect(screen.getByText(/starts a new block/)).toBeTruthy();
  expect(screen.queryByRole("radio", { name: "Continue the current block" })).toBeNull();
  expect(screen.getByLabelText("Start date")).toBeTruthy();
});
