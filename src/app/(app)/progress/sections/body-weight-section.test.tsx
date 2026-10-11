// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { presetRange } from "@/domain/graph-range";

import { BodyWeightSection } from "./body-weight-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/server/actions/graph-range", () => ({ chooseGraphRangeAction: vi.fn() }));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
}));

afterEach(cleanup);

const TODAY = "2026-10-11";

it("says how far body weight has moved in its unit, never as a bare number", () => {
  render(
    <BodyWeightSection
      today={TODAY}
      body={{
        range: presetRange("1m", TODAY),
        points: [
          { date: "2026-09-14", value: 190.5 },
          { date: "2026-10-09", value: 190.1 },
        ],
        unit: "lb",
      }}
    />,
  );
  const readout = within(screen.getByText("Latest").closest(".graph-readout") as HTMLElement);
  // The unit is held to its figure by a space that does not break.
  expect(readout.getByText("−0.4 lb since Mon 14 Sept").textContent).toBe(
    "−0.4\u00a0lb since Mon 14 Sept",
  );
});

it("rounds a change's half away from zero, gaining or losing", () => {
  render(
    <BodyWeightSection
      today={TODAY}
      body={{
        range: presetRange("1m", TODAY),
        points: [
          { date: "2026-09-14", value: 80 },
          { date: "2026-10-09", value: 79.75 },
        ],
        unit: "kg",
      }}
    />,
  );
  const readout = within(screen.getByText("Latest").closest(".graph-readout") as HTMLElement);
  expect(readout.getByText("−0.3 kg since Mon 14 Sept")).toBeTruthy();
});
