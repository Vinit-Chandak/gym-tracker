// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { FACT_SEPARATOR } from "@/lib/facts";

import { GymDetails, type GymDetailData } from "./gym-details";

vi.mock("next/navigation", () => ({ useRouter: () => ({ back: vi.fn(), prefetch: vi.fn() }) }));
vi.mock("@/server/actions/availability", () => ({
  markEquipmentAbsentFromFormAction: vi.fn(),
  unmarkEquipmentAbsentAction: vi.fn(),
}));
vi.mock("@/server/actions/gyms", () => ({
  setDefaultGymAction: vi.fn(),
  setGymActiveAction: vi.fn(),
}));

afterEach(cleanup);

function show(summary: Record<"direct" | "fallback" | "unknown" | "unavailable", number>) {
  const data = {
    gym: {
      id: "gym",
      name: "Planet Fitness Brooklyn",
      kind: "gym",
      isDefault: true,
      isActive: true,
      address: null,
      notes: null,
    },
    equipment: [],
    absent: [],
    types: [],
    availability: { program: { name: "Upper / Lower Strength", complete: true }, summary },
  } as unknown as GymDetailData;
  render(<GymDetails data={data} />);
}

it("holds each count of the programme's fit to its noun, so its line wraps before a dot", () => {
  show({ direct: 14, fallback: 6, unknown: 0, unavailable: 0 });
  // It read "· 14 available · 6" over "fallback" at 200% text. Read as it is set: getByText
  // would fold a no-break space into an ordinary one.
  expect(screen.getByRole("link", { name: /Programme fit/ }).textContent).toContain(
    ["Upper / Lower Strength (complete)", "14\u00a0available", "6\u00a0fallback"].join(
      FACT_SEPARATOR,
    ),
  );
});
