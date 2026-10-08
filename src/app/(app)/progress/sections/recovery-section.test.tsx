// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { presetRange } from "@/domain/graph-range";
import { recoveryGraph } from "@/domain/progress-graphs";
import type { RecoveryReading } from "@/domain/recovery";

import { RecoverySection } from "./recovery-section";

const route = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams(route.search),
}));
vi.mock("@/server/actions/graph-range", () => ({ chooseGraphRangeAction: vi.fn() }));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
}));

afterEach(() => {
  cleanup();
  route.search = "";
});

const TODAY = "2026-10-07";
const MONTH = presetRange("1m", TODAY);
const reading = (date: string, answers: Partial<RecoveryReading>): RecoveryReading => ({
  id: date,
  date,
  recordedAt: `${date}T07:00:00.000Z`,
  source: "daily",
  sessionId: null,
  sleepHours: 7,
  sleepQuality: 4,
  energy: null,
  fatigue: 2,
  soreness: 3,
  ...answers,
});

/** The height of each label on the scale, top of the plot first. */
function scaleOrder(measure: string) {
  route.search = `recovery=${measure}`;
  const { container } = render(
    <RecoverySection
      today={TODAY}
      recovery={{
        range: MONTH,
        graph: recoveryGraph(
          [reading("2026-09-20", {}), reading("2026-09-27", { fatigue: 4, sleepQuality: 2 })],
          MONTH,
          TODAY,
        ),
      }}
    />,
  );
  return [...container.querySelectorAll(".graph-plot svg text")]
    .filter((text) => /^[135]$/.test(text.textContent ?? ""))
    .sort((a, b) => Number(a.getAttribute("y")) - Number(b.getAttribute("y")))
    .map((text) => text.textContent);
}

it("draws a better day higher: 5 on top for sleep quality, 1 on top for fatigue and soreness", () => {
  expect(scaleOrder("sleepQuality")).toEqual(["5", "3", "1"]);
  cleanup();
  expect(scaleOrder("fatigue")).toEqual(["1", "3", "5"]);
  cleanup();
  expect(scaleOrder("soreness")).toEqual(["1", "3", "5"]);
});

it("says a measure was not answered where the span has check-ins without it", () => {
  route.search = "recovery=sleepHours";
  const fatigueOnly = reading("2026-09-27", {
    sleepHours: null,
    sleepQuality: null,
    soreness: null,
  });
  render(
    <RecoverySection
      today={TODAY}
      recovery={{ range: MONTH, graph: recoveryGraph([fatigueOnly], MONTH, TODAY) }}
    />,
  );
  expect(screen.getByText("Sleep not answered in this range.")).toBeTruthy();
  cleanup();
  render(
    <RecoverySection
      today={TODAY}
      recovery={{ range: MONTH, graph: recoveryGraph([], MONTH, TODAY) }}
    />,
  );
  expect(screen.getByText("No check-ins in this range.")).toBeTruthy();
});
