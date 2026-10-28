// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { ProgressData } from "../progress-types";
import { OverviewSection } from "./overview-section";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({
    prefetch: _prefetch,
    ...props
  }: ComponentProps<"a"> & { prefetch?: boolean | "intent" }) => <a {...props} />,
}));
afterEach(cleanup);

/** October on the 8th: a lift and a run on the 1st, a lift on the 2nd, runs on the 6th and 7th. */
const MONTH: ProgressData["month"] = {
  month: "2026-10",
  today: 8,
  activities: [
    {
      sport: "strength",
      occurredOn: "2026-10-01",
      durationMs: 62 * 60_000,
      distanceMetres: null,
      environment: null,
    },
    {
      sport: "running",
      occurredOn: "2026-10-01",
      durationMs: 1_350_000,
      distanceMetres: 3000,
      environment: "outdoor",
    },
    {
      sport: "strength",
      occurredOn: "2026-10-02",
      durationMs: 71 * 60_000,
      distanceMetres: null,
      environment: null,
    },
    {
      sport: "running",
      occurredOn: "2026-10-06",
      durationMs: 1_390_000,
      distanceMetres: 3100,
      environment: "treadmill",
    },
    {
      sport: "running",
      occurredOn: "2026-10-07",
      durationMs: 1_420_000,
      distanceMetres: 3100,
      environment: "outdoor",
    },
  ],
};

it("leaves the month's tile height to the stylesheet, so the first paint has it", () => {
  // Measured in the browser, the server's guess at the screen was replaced after the page woke
  // and the month jumped. progress.css sets the height from the screen before anything runs.
  const { container } = render(<OverviewSection month={MONTH} />);
  expect(container.querySelector(".month")!.getAttribute("style")).toBeNull();
});

it("keys the month with each sport's count, distance and time", () => {
  render(<OverviewSection month={MONTH} />);
  const key = within(screen.getByRole("region", { name: "Sessions in October" }));
  const [lifting, runs] = key.getAllByRole("listitem");
  // 62 + 71 minutes of lifting; 9.2 km run in 69 minutes. No span, and no training totals.
  expect(lifting?.textContent).toBe("2Lifting2\u00a0h 13\u00a0min");
  expect(runs?.textContent).toBe("3Runs9.2\u00a0km1\u00a0h 9\u00a0min");
  expect(screen.queryByText("Training totals")).toBeNull();
});

/** ADR 0045, amended 28 October 2026: the month says every activity once; History is a row. */
it("opens History from one row under the month, listing nothing the month already draws", () => {
  const { container } = render(<OverviewSection month={MONTH} />);
  const history = screen.getByRole("link", { name: "History" });
  expect(history.getAttribute("href")).toBe("/progress/history");
  // The month and its key are one card; no entry is listed a second time under it.
  expect(container.querySelector(".month-card .month-totals")).not.toBeNull();
  expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  expect(screen.getByRole("link", { name: /Calendar/ }).getAttribute("href")).toBe(
    "/progress/calendar",
  );
});
