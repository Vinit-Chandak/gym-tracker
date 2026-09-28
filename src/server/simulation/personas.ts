/**
 * The athletes the coach simulation replays, one behaviour each worth testing.
 *
 * Not every combination of every trait — that is millions of accounts — but every trait at
 * least once against the ordinary case, and the combinations production has already failed on:
 * a history with no reps in reserve, a gym with nothing registered, a warm-up logged as work.
 */
export type Location =
  /** One machine of every catalogue type, loads unknown: what onboarding's starter step leaves. */
  | "starter_gym"
  /** Every machine with its increment and listed loads, so steps are known (ADR 0028). */
  | "known_loads_gym"
  /** A gym location with no machines registered at all. */
  | "empty_gym"
  /** Dumbbells, a bench-less floor and a pull-up bar at home. */
  | "home_dumbbells";

export type Persona = {
  name: string;
  unit: "kg" | "lb";
  timeZone: string;
  bodyWeightKg: number;
  location: Location;
  /** How strong the athlete starts, and how fast they improve. */
  level: "novice" | "intermediate";
  /** Reps in reserve on working sets: every set, never, or about half of them. */
  rir: "always" | "never" | "sometimes";
  /** Logs the first lift's warm-up ramp as working sets, with an RIR typed into each. */
  rampAsWorking?: boolean;
  /** Does a set more than planned on every exercise. */
  extraSet?: boolean;
  /** Stops a set short on the last exercise of the day. */
  dropLastSet?: boolean;
  /** Chance a set is saved without its weight. */
  forgetLoad?: number;
  /** Does every rep they have at the target effort, overshooting the range when strong. */
  chasesReps?: boolean;
  /** Days (from the start) spent away, not training and not opening the app. */
  away?: [number, number];
  /** Every nth training day is skipped in the app. */
  skipEvery?: number;
  /** Runs: logged with effort, logged without, or skipped. */
  runs: "logged" | "no_effort" | "skipped";
  /** Tell-the-coach notes, by day. */
  notes?: { day: number; text: string }[];
  /** Days on which the athlete changes gym before training (an API-fired re-plan). */
  gymChanges?: number[];
  /**
   * Weeks trained on the template before switching the coach on: the account arrives at the
   * coach with all of it at once, and without the occurrences a coach-built programme has.
   */
  historyWeeks?: number;
  /** Days on which the athlete logs three sessions in one evening, catching up. */
  catchUp?: number[];
  /** Trains at 04:00 in India, so a workout is still open while the nightly routine runs. */
  earlyBird?: boolean;
  /** Says no to every programme change the coach proposes; otherwise each is approved. */
  declines?: boolean;
  /** Days on which the athlete asks for a review from the app at noon, after the night's plan. */
  asksForReview?: number[];
  /** The coach cannot finish this athlete's reviews: each is refused, and failed. */
  reviewsFail?: boolean;
  /** The coach's own strategy: hold every target, follow the app's rule, or progress. */
  coach: "hold" | "rule" | "progress";
};

const base = {
  unit: "kg",
  timeZone: "Asia/Kolkata",
  bodyWeightKg: 75,
  location: "starter_gym",
  level: "novice",
  rir: "always",
  runs: "logged",
  coach: "progress",
} as const satisfies Partial<Persona>;

export const PERSONAS: readonly Persona[] = [
  { ...base, name: "diligent" },
  { ...base, name: "diligent-known-loads", location: "known_loads_gym", level: "intermediate" },
  { ...base, name: "asks-for-review", asksForReview: [3, 9, 16] },
  { ...base, name: "reviews-fail", reviewsFail: true, asksForReview: [4] },
  { ...base, name: "no-rir", rir: "never", coach: "hold" },
  { ...base, name: "some-rir", rir: "sometimes" },
  { ...base, name: "ramp-as-working", rampAsWorking: true, location: "known_loads_gym" },
  { ...base, name: "overshooter", chasesReps: true, level: "intermediate" },
  { ...base, name: "extra-and-short", extraSet: true, dropLastSet: true },
  { ...base, name: "forgets-loads", forgetLoad: 0.3, rir: "sometimes" },
  { ...base, name: "empty-gym", location: "empty_gym", coach: "hold" },
  { ...base, name: "home", location: "home_dumbbells", unit: "lb" },
  { ...base, name: "pounds", unit: "lb", location: "known_loads_gym" },
  {
    ...base,
    name: "new-york",
    timeZone: "America/New_York",
    rir: "sometimes",
    runs: "no_effort",
  },
  { ...base, name: "away-10-days", away: [9, 19] },
  { ...base, name: "skipper", skipEvery: 3, runs: "skipped" },
  {
    ...base,
    name: "talker",
    notes: [
      { day: 2, text: "Can we add Bayesian curls, and more direct core work?" },
      { day: 6, text: "My left knee felt sore on squats today." },
      { day: 12, text: "I prefer to finish before 7am on weekdays." },
    ],
  },
  {
    ...base,
    name: "talker-declines",
    declines: true,
    notes: [{ day: 1, text: "Could we add hammer curls on upper days?" }],
  },
  { ...base, name: "gym-hopper", gymChanges: [4, 11, 18], location: "known_loads_gym" },
  { ...base, name: "catch-up", away: [5, 14], catchUp: [15] },
  { ...base, name: "early-bird", earlyBird: true },
  { ...base, name: "rule-follower", coach: "rule", rir: "always" },
  {
    ...base,
    name: "sudden-history",
    historyWeeks: 6,
    rir: "sometimes",
    rampAsWorking: true,
    level: "intermediate",
  },
  { ...base, name: "sudden-history-no-rir", historyWeeks: 4, rir: "never", coach: "hold" },
];
