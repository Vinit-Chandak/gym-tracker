/**
 * What kind of run a session is (ADR 0059): what a plan calls it and what a log says it was.
 *
 * Running plans are built from a small set of sessions every coaching system names the same way
 * — easy, long, tempo, intervals, hills — and an athlete reading "Tuesday: intervals" knows what
 * Tuesday asks before reading a number. The type was free text until now (a title, a programme
 * day's focus), which a plan could show but neither a coach nor a chart could count.
 *
 * The type says what the session is for; the steps and targets say how much. A tempo run of 25
 * minutes and one of 40 are both tempo runs.
 */

export const RUN_TYPES = [
  "easy",
  "recovery",
  "long",
  "tempo",
  "intervals",
  "hills",
  "fartlek",
  "progression",
  "race_pace",
  "sprints",
  "time_trial",
  "race",
  "run_walk",
] as const;
export type RunType = (typeof RUN_TYPES)[number];

export const RUN_TYPE_LABELS: Record<RunType, string> = {
  easy: "Easy run",
  recovery: "Recovery run",
  long: "Long run",
  tempo: "Tempo",
  intervals: "Intervals",
  hills: "Hills",
  fartlek: "Fartlek",
  progression: "Progression run",
  race_pace: "Race pace",
  sprints: "Sprints",
  time_trial: "Time trial",
  race: "Race",
  run_walk: "Run-walk",
};

/**
 * Which side of an easy-hard week a type sits on. Easy running is most of a week in every
 * research-based plan; quality sessions are the few hard ones that need recovery around them.
 */
export const RUN_TYPE_INTENSITY: Record<RunType, "easy" | "quality"> = {
  easy: "easy",
  recovery: "easy",
  long: "easy",
  run_walk: "easy",
  tempo: "quality",
  intervals: "quality",
  hills: "quality",
  fartlek: "quality",
  progression: "quality",
  race_pace: "quality",
  sprints: "quality",
  time_trial: "quality",
  race: "quality",
};

export function isRunType(value: unknown): value is RunType {
  return typeof value === "string" && (RUN_TYPES as readonly string[]).includes(value);
}
