// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CoachPlanList } from "@/components/coach-plan";
import type { TodayCoachState } from "@/server/repositories/coach-plans";
import type { TodayPlan } from "@/server/repositories/schedule";
import { PlannedRun } from "./planned-run";

vi.mock("../today/plan-actions", () => ({
  SkipPartButton: ({ label }: { label: string }) => <button>{label}</button>,
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
afterEach(cleanup);

const warning = {
  code: "run_jump" as const,
  message: "The run goes from 19 to 25 minutes, a jump of 32%.",
};
const plan = {
  suggestion: { slot: { cycleIndex: 1, dayIndex: 6 } },
  suggestedDay: { dayIndex: 6, includesLifting: true, includesRun: true },
  runTarget: { id: "run-target" },
  runStatus: "pending",
} as TodayPlan;
const coach = {
  pending: null,
  matchesGym: false,
  plan: {
    summary: "Arms plus a run.",
    sportSummaries: { workout: "Keep the curls.", run: "Keep an easy pace." },
    warnings: [warning, { code: "low_rir", message: "Workout effort warning." }],
    run: {
      durationMinutes: 25,
      distanceKm: null,
      rpe: 4,
      mode: "outdoor",
      note: "Comfortable effort",
      paceNote: "",
      stopRule: "",
      programRunId: "run-target",
    },
  },
} as TodayCoachState;

it("puts the running warning and actions in Runs, including a plan made at another gym", () => {
  const workout = render(
    <CoachPlanList entries={[]} planned={[]} unit="kg" warnings={[warning]} />,
  );
  expect(screen.queryByText(warning.message)).toBeNull();
  workout.unmount();
  render(<PlannedRun plan={plan} coach={coach} />);
  expect(screen.getByText(warning.message)).toBeTruthy();
  expect(screen.getByText("Keep an easy pace.")).toBeTruthy();
  expect(screen.queryByText("Workout effort warning.")).toBeNull();
  expect(screen.queryByText("Arms plus a run.")).toBeNull();
  expect(screen.getByRole("link", { name: "Log run" }).getAttribute("href")).toBe(
    "/runs/new?planned=run-target",
  );
  expect(screen.getByRole("button", { name: "Skip run" })).toBeTruthy();
});

it("removes logging and skipping for a completed run", () => {
  render(
    <PlannedRun plan={{ ...plan, runStatus: "completed", loggedRunId: "logged" }} coach={coach} />,
  );
  expect(screen.queryByRole("link", { name: "Log run" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Skip run" })).toBeNull();
  expect(screen.getByRole("link", { name: "See the run" }).getAttribute("href")).toBe(
    "/runs/logged",
  );
});
