// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { DEFAULT_SPORT_UNITS } from "@/lib/distance-units";
import type { ProgramDayPlan } from "@/server/repositories/schedule";

import { CycleDay } from "./cycle-day";

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);

const plan = (id: string): ProgramDayPlan => ({
  day: {
    id,
    dayOfWeek: 2,
    dayIndex: 1,
    name: "Upper A",
    focus: "Chest and back",
    includesLifting: true,
    includesRun: false,
    timeNote: null,
    effortNote: null,
    notes: "Keep the last set easy.",
    warmupProtocolId: null,
  },
  exercises: [],
  warmupName: null,
  run: null,
  status: "pending",
  isNext: false,
  print: null,
});

it("opens a saved day's page from its fold", () => {
  render(
    <CycleDay plan={plan("00000000-0000-4000-8000-000000000001")} units={DEFAULT_SPORT_UNITS} />,
  );
  expect(screen.getByRole("link", { name: "Open workout" }).getAttribute("href")).toBe(
    "/plan/strength/days/00000000-0000-4000-8000-000000000001",
  );
});

/** A draft's days are not saved days: "Open workout" led to /plan/strength/days/day-1, a 404. */
it("shows a draft's day without a link to a page it does not have", () => {
  render(<CycleDay plan={plan("day-1")} units={DEFAULT_SPORT_UNITS} linked={false} />);
  expect(screen.queryByRole("link")).toBeNull();
  // Everything else the day holds is still there.
  expect(screen.getByText("Upper A")).toBeTruthy();
  expect(screen.getByText("Keep the last set easy.")).toBeTruthy();
});
