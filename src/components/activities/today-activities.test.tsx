// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { endurancePrescriptionSchema, PRESCRIPTION_VERSION } from "@/domain/activity-prescription";
import { toMetres } from "@/lib/distance-units";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";

import { EnduranceCard } from "./today-activities";

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));

afterEach(cleanup);

/**
 * A card says its target in the athlete's own unit, the same in its figure, its Log button and
 * its fold. A thousand-yard swim used to read "0.9144 km" beside "914.4 m" on one card.
 */

const swim = (yards: number): ScheduledOccurrence => ({
  id: "swim",
  sport: "swimming",
  disposition: "pending",
  scheduledOn: "2026-10-11",
  scheduledLocalTime: null,
  orderIndex: 0,
  revisionId: "swim-revision",
  prescription: endurancePrescriptionSchema.parse({
    prescriptionVersion: PRESCRIPTION_VERSION,
    sport: "swimming",
    sessionTargets: {
      distanceMetres: [toMetres(yards, "yd"), toMetres(yards, "yd")],
      distanceUnit: "yd",
    },
  }),
  familyId: null,
  originalWeekIndex: null,
  originalScheduledOn: null,
  resolution: { kind: "incomplete" },
  closed: false,
  loggable: true,
});

it("says a yard swim in yards to a swimmer who swims in yards", () => {
  render(<EnduranceCard occurrence={swim(1000)} units={{ distanceUnit: "mi", poolUnit: "yd" }} />);
  expect(screen.getByText("1,000")).toBeTruthy();
  expect(screen.getByText("yd")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Log swim: 1,000 yd" })).toBeTruthy();
});

it("says the same swim in metres, rounded, to a swimmer who swims in metres", () => {
  render(<EnduranceCard occurrence={swim(1000)} />);
  expect(screen.getByText("914")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Log swim: 914 m" })).toBeTruthy();
  expect(screen.queryByText(/km/)).toBeNull();
});
