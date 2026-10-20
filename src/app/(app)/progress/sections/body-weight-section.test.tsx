// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { presetRange } from "@/domain/graph-range";

import { BodyWeightSection } from "./body-weight-section";

/**
 * The innermost element whose whole text, its spaces read as the default matcher reads them, is
 * `text`: a figure's digits stand in a span of their own (Figures).
 */
const whole = (text: string | RegExp) => (_: string, element: Element | null) => {
  const reads = (node: Element) => {
    if (node.classList.contains("figures")) return false;
    const value = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    return typeof text === "string" ? value === text : text.test(value);
  };
  return element !== null && reads(element) && ![...element.children].some(reads);
};

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
        recorded: true,
      }}
    />,
  );
  const readout = within(screen.getByText("Latest").closest(".graph-readout") as HTMLElement);
  // The unit is held to its figure by a space that does not break.
  expect(readout.getByText(whole("−0.4 lb since Mon 14 Sept")).textContent).toBe(
    "−0.4\u00a0lb since Mon\u00a014\u00a0Sept",
  );
});

it("says a range with no readings in one line, and where readings come from in its ⓘ", () => {
  render(
    <BodyWeightSection
      today={TODAY}
      body={{ range: presetRange("1m", TODAY), points: [], unit: "kg", recorded: true }}
    />,
  );
  expect(screen.getByText("No readings in this range.")).toBeTruthy();
  expect(screen.queryByText(/Today › Log/)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "About body weight" }));
  expect(screen.getByRole("note").textContent).toContain("Today › Log");
  expect(screen.getByRole("note").textContent).not.toContain("Edit profile");
});

/** IA audit M8: body weight is logged from Today › Log, and its empty state goes there. */
it("is its empty state with no reading at all, and logs the first from Today", () => {
  render(
    <BodyWeightSection
      today={TODAY}
      body={{ range: presetRange("1m", TODAY), points: [], unit: "kg", recorded: false }}
    />,
  );
  expect(screen.getByRole("heading", { name: "No readings yet" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Log body weight" }).getAttribute("href")).toBe(
    "/today/log/body-weight",
  );
  // Nothing to draw yet: no graph, no spans.
  expect(screen.queryByText("No readings in this range.")).toBeNull();
  expect(screen.queryByRole("button", { name: "About body weight" })).toBeNull();
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
        recorded: true,
      }}
    />,
  );
  const readout = within(screen.getByText("Latest").closest(".graph-readout") as HTMLElement);
  expect(readout.getByText(whole("−0.3 kg since Mon 14 Sept"))).toBeTruthy();
});
