/**
 * Local running fixtures (ADR 0059): heart-rate settings, runs logged with laps, and two running
 * programmes started through the app's own draft, review and start path, so every running screen
 * has something true to show.
 *
 * - priya, in kilometres: an eight-week 5K block, reps by distance and by time, a tempo, strides,
 *   long runs and the race on its date. Zones from the heart-rate reserve; the maximum starts as
 *   the age estimate and is raised by the hardest logged rep, as logging a run raises it.
 * - alex, in miles: a ten-week 10K block with timed reps held by zone, a tempo by the mile and a
 *   treadmill run. Zones of alex's own.
 *
 * Past sessions are logged against the programme the way the log form does, one left missed.
 * A persona that already has a running programme is left alone, so it can be run again.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as s from "@/db/schema";
import type { DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, plannedOrigin, reportedEffort, type LogOrigin } from "@/domain/activity";
import {
  nativeDistance,
  type NativeDistance,
  type RunningActualV1,
  type RunningLap,
} from "@/domain/activity-metrics";
import {
  endurancePrescriptionSchema,
  type EndurancePrescription,
  type PrescriptionNode,
  type PrescriptionStep,
  type StepPhase,
} from "@/domain/activity-prescription";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import type { RunType } from "@/domain/run-types";
import { createActivity } from "@/server/repositories/activities";
import { raiseMaxHeartRateFromRun, readHeartRate } from "@/server/repositories/heart-rate";
import {
  activateProgramDraft,
  refreshProgramDraft,
  saveManualDraft,
} from "@/server/repositories/program-drafts";

const url = process.env.SEED_DATABASE_URL ?? "";
const target = new URL(url);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  target.search !== "" ||
  target.hash !== "" ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname)
)
  throw new Error("Use the isolated audit database.");
const client = postgres(url, { max: 1, prepare: false });
const db = drizzle(client, { schema: s });

const MILE = 1609.344;
/** Seconds a kilometre from m:ss a mile, kept to a tenth as the schema keeps paces. */
const perMile = (minutes: number, seconds = 0) =>
  Math.round(((minutes * 60 + seconds) / (MILE / 1000)) * 10) / 10;
const perKm = (minutes: number, seconds = 0) => minutes * 60 + seconds;

let stepCounter = 0;
function step(
  phase: StepPhase,
  target: PrescriptionStep["target"],
  extra: Partial<
    Pick<PrescriptionStep, "action" | "paceSecondsPerKm" | "heartRateZones" | "notes">
  > = {},
): PrescriptionStep {
  return {
    kind: "step",
    id: `${phase}-${++stepCounter}`,
    phase,
    action: "run",
    target,
    effort: null,
    stroke: null,
    notes: null,
    ...extra,
  };
}
const minutes = (from: number, to = from): PrescriptionStep["target"] => ({
  kind: "duration",
  ms: [Math.round(from * 60_000), Math.round(to * 60_000)],
});
const metres = (value: number): PrescriptionStep["target"] => ({
  kind: "distance",
  metres: [value, value],
  unit: "m",
});
const km = (value: number): PrescriptionStep["target"] => ({
  kind: "distance",
  metres: [value * 1000, value * 1000],
  unit: "km",
});
const miles = (value: number): PrescriptionStep["target"] => ({
  kind: "distance",
  metres: [Math.round(value * MILE * 10) / 10, Math.round(value * MILE * 10) / 10],
  unit: "mi",
});
const repeat = (
  repetitions: number,
  steps: PrescriptionStep[],
  restBetweenMs: number | null = null,
): PrescriptionNode => ({
  kind: "repeat",
  id: `repeat-${++stepCounter}`,
  repetitions,
  restBetweenMs,
  steps,
});

function run(
  sessionType: RunType,
  title: string,
  body: {
    targets?: Partial<EndurancePrescription["sessionTargets"]>;
    nodes?: PrescriptionNode[];
    paceNote?: string;
    note?: string;
    stop?: string;
  },
): EndurancePrescription {
  return endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport: "running",
    title,
    sessionTargets: body.targets ?? {},
    nodes: body.nodes ?? [],
    running: {
      sessionType,
      paceNote: body.paceNote ?? null,
      progressionNote: null,
      symptomStopRule: body.stop ?? null,
      note: body.note ?? null,
    },
  });
}

type Session = { day: number; name: string; prescription: EndurancePrescription };

function blueprint(input: {
  slug: string;
  name: string;
  notes: string;
  startsOn: string;
  weeks: Session[][];
}): ProgramBlueprint {
  return {
    blueprintVersion: 1,
    sport: "running",
    slug: input.slug,
    name: input.name,
    weeks: input.weeks.length,
    notes: input.notes,
    startsOn: input.startsOn,
    days: [],
    runs: [],
    enduranceSessions: input.weeks.flatMap((sessions, weekIndex) =>
      sessions.map((session) => ({
        lineageId: randomUUID(),
        name: session.name,
        weekIndex: weekIndex + 1,
        dayOffset: weekIndex * 7 + session.day,
        scheduledLocalTime: null,
        prescription: session.prescription,
      })),
    ),
  };
}

// priya — 5K, kilometres. The logged 5K is about 26:30 (5:18/km); the block aims at 25:00.
const PRIYA_EASY = { paceSecondsPerKm: [perKm(6, 15), perKm(6, 50)] as [number, number] };
const warmup = (length = 2) =>
  step("warmup", km(length), { heartRateZones: [1, 2], notes: "Easy, then four strides" });
const cooldown = (length = 1.5) => step("cooldown", km(length), { heartRateZones: [1, 2] });

function priyaWeek(week: number): Session[] {
  const recovery = week === 4;
  const raceWeek = week === 8;
  const reps: Record<number, [number, number, [number, number]]> = {
    1: [6, 400, [perKm(4, 40), perKm(4, 50)]],
    2: [5, 800, [perKm(4, 55), perKm(5, 5)]],
    3: [6, 800, [perKm(4, 55), perKm(5, 5)]],
    4: [4, 800, [perKm(4, 55), perKm(5, 5)]],
    5: [5, 1000, [perKm(5, 0), perKm(5, 5)]],
    6: [6, 1000, [perKm(4, 58), perKm(5, 3)]],
    7: [4, 1000, [perKm(4, 55), perKm(5, 0)]],
    8: [4, 400, [perKm(4, 40), perKm(4, 50)]],
  };
  const [count, length, pace] = reps[week]!;
  const repsName = `${count} × ${length >= 1000 ? `${length / 1000} km` : `${length} m`}`;
  const tempoMinutes = [15, 0, 20, 0, 22, 0, 18][week - 1]!;
  const longKm = [8, 9, 10, 8, 11, 12, 9][week - 1]!;
  const intervals: Session = {
    day: 1,
    name: repsName,
    prescription: run("intervals", repsName, {
      nodes: [
        warmup(),
        repeat(count, [
          step("work", metres(length), { paceSecondsPerKm: pace, heartRateZones: [4, 5] }),
          step("recovery", metres(length >= 800 ? 400 : 200), {
            heartRateZones: [1, 2],
            notes: "Jog, never walk",
          }),
        ]),
        cooldown(),
      ],
      paceNote: "5K goal pace is 5:00/km. Even reps beat a fast first one.",
      stop: "Stop the reps if your left calf tightens, as it did in August.",
    }),
  };
  const easyMinutes = [30, 35, 40, 30, 40, 45, 35, 25][week - 1]!;
  const easy: Session = {
    day: 3,
    name: "Easy run with strides",
    prescription: run("easy", "Easy run with strides", {
      nodes: [
        step("work", minutes(easyMinutes), { ...PRIYA_EASY, heartRateZones: [1, 2] }),
        repeat(6, [
          step("work", minutes(20 / 60), { notes: "Quick and relaxed, not a sprint" }),
          step("recovery", minutes(1), { action: "walk" }),
        ]),
      ],
    }),
  };
  const saturday: Session = raceWeek
    ? {
        day: 5,
        name: "Shake-out",
        prescription: run("easy", "Shake-out", {
          targets: { durationMs: [15 * 60_000, 20 * 60_000], heartRateZones: [1, 2] },
          note: "Legs loose for tomorrow. Four strides at the end.",
        }),
      }
    : recovery
      ? {
          day: 5,
          name: "Easy run",
          prescription: run("easy", "Easy run", {
            targets: { durationMs: [30 * 60_000, 30 * 60_000], ...PRIYA_EASY },
          }),
        }
      : week % 2 === 0
        ? {
            day: 5,
            name: `${week === 2 ? 5 : 6} × 3 min in zone 4`,
            prescription: run("intervals", "Timed reps", {
              nodes: [
                step("warmup", minutes(12), { heartRateZones: [1, 2] }),
                repeat(week === 2 ? 5 : 6, [
                  step("work", minutes(3), { heartRateZones: [4, 4] }),
                  step("recovery", minutes(2), { heartRateZones: [1, 1] }),
                ]),
                step("cooldown", minutes(10), { heartRateZones: [1, 2] }),
              ],
            }),
          }
        : {
            day: 5,
            name: `Tempo ${tempoMinutes} min`,
            prescription: run("tempo", "Tempo", {
              nodes: [
                warmup(2),
                step("work", minutes(tempoMinutes), {
                  paceSecondsPerKm: [perKm(5, 20), perKm(5, 30)],
                  heartRateZones: [4, 4],
                  notes: "Comfortably hard: a few words, not sentences",
                }),
                cooldown(),
              ],
            }),
          };
  const long: Session = raceWeek
    ? {
        day: 6,
        name: "5K race",
        prescription: run("race", "Park 5K", {
          nodes: [
            step("warmup", minutes(12), { heartRateZones: [1, 2], notes: "With four strides" }),
            step("work", km(5), {
              paceSecondsPerKm: [perKm(4, 58), perKm(5, 2)],
              notes: "Hold 5:00 to halfway, then race",
            }),
            step("cooldown", minutes(10), { action: "walk" }),
          ],
        }),
      }
    : {
        day: 6,
        name: `Long run ${longKm} km`,
        prescription: run("long", "Long run", {
          targets: {
            distanceMetres: [longKm * 1000, longKm * 1000],
            distanceUnit: "km",
            heartRateZones: [2, 2],
            ...PRIYA_EASY,
          },
          note: "Conversational the whole way. Water after 45 minutes.",
        }),
      };
  return [intervals, easy, saturday, long];
}

// alex — 10K, miles. Easy at 10:30–11:15 a mile; the tempo at 8:30–8:45.
function alexWeek(week: number): Session[] {
  const recovery = week === 4 || week === 8;
  const reps = [5, 6, 6, 4, 7, 8, 8, 5, 6, 4][week - 1]!;
  const tempoMiles = [1.5, 2, 2, 1.5, 2.5, 3, 3, 2, 3, 2][week - 1]!;
  const longMiles = [4, 4.5, 5, 4, 5.5, 6, 6.5, 5, 7, 4][week - 1]!;
  const easyPace: [number, number] = [perMile(10, 30), perMile(11, 15)];
  return [
    {
      day: 1,
      name: `${reps} × 2 min in zone 4`,
      prescription: run("intervals", "Timed reps", {
        nodes: [
          step("warmup", minutes(10), { heartRateZones: [1, 2] }),
          repeat(reps, [
            step("work", minutes(2), { heartRateZones: [4, 4] }),
            step("recovery", minutes(2), { action: "walk", heartRateZones: [1, 1] }),
          ]),
          step("cooldown", minutes(10), { heartRateZones: [1, 2] }),
        ],
      }),
    },
    {
      day: 3,
      name: recovery ? "Easy run" : `Tempo ${tempoMiles} mi`,
      prescription: recovery
        ? run("easy", "Easy run", {
            targets: { durationMs: [30 * 60_000, 30 * 60_000], paceSecondsPerKm: easyPace },
          })
        : run("tempo", "Tempo", {
            nodes: [
              step("warmup", miles(1), { paceSecondsPerKm: easyPace }),
              step("work", miles(tempoMiles), {
                paceSecondsPerKm: [perMile(8, 30), perMile(8, 45)],
                heartRateZones: [4, 4],
              }),
              step("cooldown", miles(1), { paceSecondsPerKm: easyPace }),
            ],
          }),
    },
    {
      day: 5,
      name: "Easy run",
      prescription: run("easy", "Easy run", {
        targets: {
          distanceMetres: [Math.round(3 * MILE), Math.round(3 * MILE)],
          distanceUnit: "mi",
          heartRateZones: [1, 2],
        },
        note: "Treadmill is fine: set 1% incline.",
      }),
    },
    {
      day: 6,
      name: week === 10 ? "10K time trial" : `Long run ${longMiles} mi`,
      prescription:
        week === 10
          ? run("time_trial", "10K time trial", {
              nodes: [
                step("warmup", miles(1), { paceSecondsPerKm: easyPace }),
                step("work", km(10), { paceSecondsPerKm: [perMile(8, 50), perMile(9, 5)] }),
                step("cooldown", minutes(10), { action: "walk" }),
              ],
            })
          : run(week === 9 ? "progression" : "long", "Long run", {
              targets: {
                distanceMetres: [Math.round(longMiles * MILE), Math.round(longMiles * MILE)],
                distanceUnit: "mi",
                heartRateZones: [2, 2],
                paceSecondsPerKm: easyPace,
              },
              note:
                week === 9
                  ? "Last mile at tempo effort if it feels good."
                  : "Easy enough to talk the whole way.",
            }),
    },
  ];
}

const lap = (
  phase: StepPhase | null,
  distance: NativeDistance | null,
  seconds: number,
  average: number | null,
  max: number | null,
): RunningLap => ({
  phase,
  distance,
  durationMs: Math.round(seconds * 1000),
  averageHeartRate: average,
  maxHeartRate: max,
});

function runActual(
  laps: RunningLap[],
  overrides: Partial<RunningActualV1> & { distance: NativeDistance },
): RunningActualV1 {
  const timed = laps.reduce((sum, entry) => sum + (entry.durationMs ?? 0), 0);
  const peaks = laps.map((entry) => entry.maxHeartRate).filter((value) => value !== null);
  const weighted = laps.filter((entry) => entry.averageHeartRate !== null && entry.durationMs);
  const average =
    weighted.length > 0
      ? Math.round(
          weighted.reduce((sum, entry) => sum + entry.averageHeartRate! * entry.durationMs!, 0) /
            weighted.reduce((sum, entry) => sum + entry.durationMs!, 0),
        )
      : null;
  return {
    sport: "running",
    environment: "outdoor",
    durationMs: timed,
    runType: null,
    surface: null,
    elevationGainMetres: null,
    treadmillInclinePercent: null,
    averageHeartRate: average,
    maxHeartRate: peaks.length > 0 ? Math.max(...peaks) : null,
    cadenceStepsPerMinute: null,
    laps,
    ...overrides,
  };
}

const m = (value: number) => nativeDistance(value, "m");
const kmD = (value: number) => nativeDistance(value, "km");
const mi = (value: number) => nativeDistance(value, "mi");

/** One run's laps as a watch lists them: warm-up, each rep and its jog, cool-down. */
function intervalLaps(input: {
  warmup: [NativeDistance, number, number];
  reps: [number, number][];
  rep: NativeDistance | null;
  recovery: NativeDistance | null;
  recoverySeconds: number;
  cooldown: [NativeDistance, number, number];
}): RunningLap[] {
  const laps: RunningLap[] = [
    lap("warmup", input.warmup[0], input.warmup[1], input.warmup[2], input.warmup[2] + 9),
  ];
  input.reps.forEach(([seconds, peak], index) => {
    laps.push(lap("work", input.rep, seconds, peak - 7, peak));
    if (index < input.reps.length - 1)
      laps.push(lap("recovery", input.recovery, input.recoverySeconds, peak - 28, peak - 12));
  });
  laps.push(
    lap("cooldown", input.cooldown[0], input.cooldown[1], input.cooldown[2], input.cooldown[2] + 8),
  );
  return laps;
}

type Person = { id: string; username: string; timeZone: string };

async function logRun(
  tx: DbOrTx,
  person: Person,
  day: string,
  origin: LogOrigin,
  actual: RunningActualV1,
  effort: number,
  title: string | null,
) {
  const [profile] = await tx.select().from(s.profiles).where(eq(s.profiles.id, person.id));
  const before = await readHeartRate(tx, profile!, todayInTimeZone(person.timeZone));
  await createActivity(tx, person.id, {
    submissionKey: randomUUID(),
    origin,
    actual,
    startedAt: new Date(`${day}T01:30:00Z`),
    recordedTimeZone: person.timeZone,
    timeZoneSource: "profile_at_entry",
    occurredOn: day,
    effort: reportedEffort(effort),
    outcome: "logged",
    title,
    notes: null,
  });
  return raiseMaxHeartRateFromRun(tx, person.id, before, actual, day);
}

/** The programme's sessions by date, each with what the log form would link it to. */
async function sessionsByDate(tx: DbOrTx, userId: string, programId: string) {
  const [program] = await tx.select().from(s.programs).where(eq(s.programs.id, programId));
  const occurrences = await tx
    .select({
      id: s.plannedOccurrences.id,
      revisionId: s.plannedOccurrences.currentRevisionId,
      scheduledOn: s.occurrenceVersions.scheduledOn,
    })
    .from(s.plannedOccurrences)
    .innerJoin(
      s.occurrenceVersions,
      eq(s.occurrenceVersions.id, s.plannedOccurrences.currentRevisionId),
    )
    .where(
      and(
        eq(s.plannedOccurrences.userId, userId),
        eq(s.plannedOccurrences.familyId, program!.familyId),
      ),
    );
  return new Map(
    occurrences.map((entry) => [entry.scheduledOn!, plannedOrigin(entry.id, entry.revisionId!)]),
  );
}

async function startProgramme(tx: DbOrTx, userId: string, plan: ProgramBlueprint) {
  const draft = await saveManualDraft(tx, userId, plan);
  const reviewed = await refreshProgramDraft(tx, userId, draft.id, draft.revision);
  const started = await activateProgramDraft(tx, userId, draft.id, {
    expectedRevision: reviewed.revision,
    startDate: plan.startsOn!,
    transition: "new_block",
  });
  return started.programId;
}

async function seedPriya(tx: DbOrTx, person: Person, today: string) {
  await tx
    .update(s.profiles)
    .set({
      dateOfBirth: "1994-03-12",
      restingHeartRate: 52,
      heartRateZoneMethod: "reserve",
      maxHeartRate: null,
      maxHeartRateSource: null,
      maxHeartRateOn: null,
      maxHeartRateAuto: true,
      heartRateZoneFloors: null,
    })
    .where(eq(s.profiles.id, person.id));
  // A Monday two weeks back, so today is the third week's Tuesday.
  const startsOn = addDays(today, -15);
  const plan = blueprint({
    slug: "audit-5k-block",
    name: "5K: under 25 minutes",
    notes:
      "Eight weeks to the park 5K on its date. Reps by distance on Tuesdays, timed reps or a tempo on Saturdays, and a long run that builds to 12 km with a lighter fourth week.",
    startsOn,
    weeks: Array.from({ length: 8 }, (_, index) => priyaWeek(index + 1)),
  });
  const programId = await startProgramme(tx, person.id, plan);
  const planned = await sessionsByDate(tx, person.id, programId);
  const on = (offset: number) => addDays(startsOn, offset);
  const origin = (offset: number) => planned.get(on(offset)) ?? AD_HOC_ORIGIN;
  const raised: (number | null)[] = [];
  // Week 1: 6 × 400 m, easy with strides, a tempo, the long run.
  raised.push(
    await logRun(
      tx,
      person,
      on(1),
      origin(1),
      runActual(
        intervalLaps({
          warmup: [kmD(2), 760, 132],
          reps: [
            [113, 176],
            [112, 179],
            [114, 181],
            [111, 183],
            [113, 184],
            [110, 186],
          ],
          rep: m(400),
          recovery: m(200),
          recoverySeconds: 88,
          cooldown: [kmD(1.5), 600, 138],
        }),
        { distance: kmD(6.9), runType: "intervals", surface: "Track" },
      ),
      4,
      null,
    ),
  );
  await logRun(
    tx,
    person,
    on(3),
    origin(3),
    runActual([lap("work", kmD(5), 1950, 141, 152), lap("work", m(400), 240, 150, 171)], {
      distance: kmD(5.4),
      runType: "easy",
    }),
    2,
    null,
  );
  await logRun(
    tx,
    person,
    on(5),
    origin(5),
    runActual(
      [
        lap("warmup", kmD(2), 780, 135, 146),
        lap("work", kmD(2.8), 900, 172, 180),
        lap("cooldown", kmD(1.5), 600, 145, 160),
      ],
      { distance: kmD(6.3), runType: "tempo" },
    ),
    4,
    null,
  );
  await logRun(
    tx,
    person,
    on(6),
    origin(6),
    runActual(
      Array.from({ length: 8 }, (_, index) =>
        lap(null, kmD(1), 385 + (index % 3) * 4, 142 + index, 150 + index),
      ),
      { distance: kmD(8), runType: "long", surface: "Road", elevationGainMetres: 46 },
    ),
    3,
    null,
  );
  // Week 2: 5 × 800 m, easy with strides, Saturday missed, the long run on a treadmill.
  raised.push(
    await logRun(
      tx,
      person,
      on(8),
      origin(8),
      runActual(
        intervalLaps({
          warmup: [kmD(2), 750, 134],
          reps: [
            [243, 182],
            [241, 185],
            [244, 187],
            [240, 189],
            [238, 191],
          ],
          rep: m(800),
          recovery: m(400),
          recoverySeconds: 170,
          cooldown: [kmD(1.5), 590, 140],
        }),
        { distance: kmD(9.1), runType: "intervals", surface: "Track" },
      ),
      4,
      "Wind on the back straight",
    ),
  );
  await logRun(
    tx,
    person,
    on(10),
    origin(10),
    runActual([lap("work", kmD(5.8), 2240, 143, 155)], { distance: kmD(5.8), runType: "easy" }),
    2,
    null,
  );
  await logRun(
    tx,
    person,
    on(13),
    origin(13),
    runActual([], {
      distance: kmD(9),
      durationMs: 3520_000,
      environment: "treadmill",
      treadmillInclinePercent: 1,
      averageHeartRate: 148,
      maxHeartRate: 161,
      runType: "long",
    }),
    3,
    "Rain, so the treadmill",
  );
  return { programId, raised: raised.filter((value) => value !== null) };
}

async function seedAlex(tx: DbOrTx, person: Person, today: string) {
  await tx
    .update(s.profiles)
    .set({
      maxHeartRate: 185,
      maxHeartRateSource: "entered",
      maxHeartRateOn: addDays(today, -40),
      maxHeartRateAuto: false,
      restingHeartRate: 58,
      heartRateZoneMethod: "custom",
      heartRateZoneFloors: [105, 125, 143, 158, 171],
    })
    .where(eq(s.profiles.id, person.id));
  // A Monday a week back, so today is the second week's Tuesday.
  const startsOn = addDays(today, -8);
  const plan = blueprint({
    slug: "audit-10k-block",
    name: "10K in ten weeks",
    notes:
      "Timed reps by heart rate on Tuesdays, a tempo by the mile on Thursdays, an easy run that can be on the treadmill, and a long run to 7 miles before a 10K time trial.",
    startsOn,
    weeks: Array.from({ length: 10 }, (_, index) => alexWeek(index + 1)),
  });
  const programId = await startProgramme(tx, person.id, plan);
  const planned = await sessionsByDate(tx, person.id, programId);
  const on = (offset: number) => addDays(startsOn, offset);
  const origin = (offset: number) => planned.get(on(offset)) ?? AD_HOC_ORIGIN;
  await logRun(
    tx,
    person,
    on(1),
    origin(1),
    runActual(
      intervalLaps({
        warmup: [mi(1), 620, 128],
        reps: [
          [120, 162],
          [120, 164],
          [120, 166],
          [120, 167],
          [120, 168],
        ],
        rep: null,
        recovery: null,
        recoverySeconds: 120,
        cooldown: [mi(1), 640, 132],
      }),
      { distance: mi(3.4), runType: "intervals" },
    ),
    4,
    null,
  );
  await logRun(
    tx,
    person,
    on(3),
    origin(3),
    runActual(
      [
        lap("warmup", mi(1), 640, 130, 141),
        lap("work", mi(1), 518, 160, 166),
        lap("work", mi(0.5), 257, 164, 169),
        lap("cooldown", mi(1), 650, 140, 150),
      ],
      { distance: mi(3.5), runType: "tempo" },
    ),
    4,
    null,
  );
  await logRun(
    tx,
    person,
    on(5),
    origin(5),
    runActual([], {
      distance: mi(3),
      durationMs: 1950_000,
      environment: "treadmill",
      treadmillInclinePercent: 1,
      averageHeartRate: 136,
      maxHeartRate: 144,
      cadenceStepsPerMinute: 166,
      runType: "easy",
    }),
    2,
    null,
  );
  await logRun(
    tx,
    person,
    on(6),
    origin(6),
    runActual(
      [0, 1, 2, 3].map((index) =>
        lap(null, mi(1), 655 - index * 6, 138 + index * 2, 146 + index * 2),
      ),
      { distance: mi(4), runType: "long", surface: "Trail", elevationGainMetres: 88 },
    ),
    3,
    null,
  );
  return { programId };
}

async function main() {
  try {
    const people = await db
      .select({ id: s.profiles.id, username: s.profiles.username, timeZone: s.profiles.timeZone })
      .from(s.profiles)
      .where(inArray(s.profiles.username, ["priya", "alex"]));
    for (const person of people) {
      const result = await withUser(db, person.id, async (tx) => {
        const [running] = await tx
          .select({ id: s.programs.id })
          .from(s.programs)
          .where(
            and(
              eq(s.programs.userId, person.id),
              eq(s.programs.sport, "running"),
              eq(s.programs.status, "active"),
            ),
          );
        if (running) return { skipped: true, programId: running.id };
        const today = todayInTimeZone(person.timeZone);
        return person.username === "priya"
          ? await seedPriya(tx, person, today)
          : await seedAlex(tx, person, today);
      });
      console.log(`${person.username}: ${JSON.stringify(result)}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
