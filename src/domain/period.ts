import { addDays } from "./program-calendar";

/** The four windows a social screen offers (plan §3.1): one control, never a date picker. */
export const PERIODS = ["7d", "30d", "90d", "1y"] as const;
export type Period = (typeof PERIODS)[number];
export const DEFAULT_PERIOD: Period = "30d";

export const PERIOD_LABELS: Record<Period, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "1y": "1 year",
};

const PERIOD_DAYS: Record<Period, number> = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 };

/**
 * The inclusive civil dates a period covers, ending today: "7 days" is today and the six
 * before it, so a Monday-to-Sunday week reads as a week and not eight days.
 */
export function periodBounds(period: Period, today: string): { from: string; to: string } {
  return { from: addDays(today, -(PERIOD_DAYS[period] - 1)), to: today };
}
