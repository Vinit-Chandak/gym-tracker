/**
 * A year of six athletes, replayed day by day in-process against the real repository functions.
 *
 * Like the coach simulation (`src/server/simulation/coach-simulator.ts`), accounts are made the
 * way the app makes them and train through the functions the app's server actions call, in the
 * order those actions call them, with one clock moving for all of it: PGlite reads the process
 * clock, so `now()` in SQL and `new Date()` in the app agree on which day it is.
 *
 * Anything the app throws at an athlete doing an ordinary thing, and anything the schedule says
 * that contradicts what was just done, is written down as a finding rather than stopping the
 * year: the year is the fixture, and the findings are the first audit of it.
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { equipmentInstances, equipmentTypes, plannedOccurrences, profiles } from "@/db/schema";
import type { TestDatabase } from "@/db/test/pglite";
import type { DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import {
  AD_HOC_ORIGIN,
  plannedOrigin,
  reportedEffort,
  type ActivitySport,
  type LogOrigin,
} from "@/domain/activity";
import { nativeDistance, type EnduranceActual } from "@/domain/activity-metrics";
import { QUICK_ADD_NAME, type Meal } from "@/domain/nutrition";
import { addDays, daysBetween, todayInTimeZone } from "@/domain/program-calendar";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import {
  allSlots,
  isRestSlot,
  nextPendingSlot,
  partStatus,
  pendingParts,
  slotFor,
  type SlotRef,
} from "@/domain/schedule";
import type { SetType } from "@/domain/types";
import { fromDateTimeLocal } from "@/lib/time";
import { ensureProfile } from "@/server/queries/profile";
import { createActivity } from "@/server/repositories/activities";
import { recordBodyWeight } from "@/server/repositories/body-weight";
import { voidPlanForSlot } from "@/server/repositories/coach-plans";
import { machinesByExerciseAtGym } from "@/server/repositories/equipment";
import { acceptFollow, declineFollow, requestFollow } from "@/server/repositories/follows";
import { createGym } from "@/server/repositories/gyms";
import {
  logFood,
  logQuickFood,
  logSavedMeal,
  saveLibraryMeal,
  saveNutritionTargets,
  submitFoodOnce,
} from "@/server/repositories/nutrition";
import {
  activateProgramDraft,
  refreshProgramDraft,
  saveManualDraft,
} from "@/server/repositories/program-drafts";
import { readProgramBlueprint } from "@/server/repositories/programs";
import {
  completeRestSlotsBefore,
  getSchedule,
  getTodayPlan,
  pendingCycleForDay,
  recordSlotEvent,
  reopenSkippedSession,
  skipSlotPart,
  type Schedule,
} from "@/server/repositories/schedule";
import {
  addExercisesToSession,
  deleteSet,
  discardSession,
  finishSession,
  getInProgressSession,
  getSessionDetail,
  saveCheckIn,
  saveSet,
  saveSupersetGroup,
  setExerciseCompleted,
  setWarmupCompleted,
  skipExercise,
  startAdHocSession,
  startPlannedSession,
  substituteExercise,
  type SessionExercise,
} from "@/server/repositories/sessions";
import { setSportPreference } from "@/server/repositories/sport-preferences";
import { confirmStarterEquipment } from "@/server/repositories/starter-equipment";
import {
  confirmEquipmentHere,
  markEquipmentNotHere,
} from "@/server/repositories/workout-confirmation";

import { FOLLOWS, isoWeekdayOf, YEAR_END, YEAR_START, type Block, type Persona } from "./personas";

export type Clock = { set(at: Date): void };

export type Finding = {
  persona: string;
  date: string;
  stage: string;
  message: string;
};

type Athlete = {
  p: Persona;
  userId: string;
  email: string;
  gymIds: Map<string, string>;
  random: () => number;
  /** Estimated one-rep maximum in kilograms, by exercise slug. */
  strength: Map<string, number>;
  /** When each lift was last trained, for detraining after a break. */
  lastTrained: Map<string, string>;
  /** Which of the persona's blocks is running, -1 before the first. */
  block: number;
  blueprint: ProgramBlueprint | null;
  revised: Set<string>;
  lastWeighed: string | null;
  foodIds: Map<string, string>;
  savedMealId: string | null;
  stats: Record<string, number>;
};

/** A small, seeded generator, so the same year comes out of every run. */
function generator(seed: string): () => number {
  let state = 0;
  for (const char of seed) state = (Math.imul(state ^ char.charCodeAt(0), 2654435761) >>> 0) + 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const KG_PER_LB = 0.45359237;
const round = (value: number, step: number) => Math.max(step, Math.round(value / step) * step);
const roundDown = (value: number, step: number) => Math.max(step, Math.floor(value / step) * step);
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
const hash = (text: string) => {
  let h = 2166136261;
  for (const char of text) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
};

/** What a movement starts at for someone of baseline 1, by how it is loaded. */
const TYPICAL_KG: Record<string, number> = {
  barbell: 80,
  dumbbell: 22,
  machine: 70,
  cable: 32,
  smith_machine: 75,
};

/** Movements that are much lighter or heavier than their modality's typical load. */
function exerciseFactor(slug: string): number {
  if (/lateral-raise|face-pull|rear-delt|reverse-pec|kickback|y-raise|front-raise/.test(slug))
    return 0.35;
  if (/curl|triceps|pushdown|skull|extension-machine|overhead-cable|fly|pec-deck/.test(slug))
    return slug.includes("leg-curl") ? 0.75 : 0.5;
  if (/leg-press|hack-squat|pendulum|belt-squat/.test(slug)) return 2.2;
  if (/hip-thrust/.test(slug)) return 1.6;
  if (/calf/.test(slug)) return 1.3;
  if (/deadlift|rdl|good-morning/.test(slug)) return 1.15;
  if (/shoulder-press|overhead-press|arnold|seated-db-shoulder/.test(slug)) return 0.65;
  if (/row|pulldown/.test(slug)) return 0.85;
  if (/leg-extension|leg-curl|abduction|adduction/.test(slug)) return 0.75;
  return 1;
}

type Measure = "load" | "bodyweight" | "assisted" | "duration" | "distance";

function measureOf(ex: SessionExercise): Measure {
  const type = ex.planned?.prescriptionType ?? ex.exercise.defaultPrescriptionType;
  if (type === "duration") return "duration";
  if (type === "distance") return "distance";
  if (/^assisted-/.test(ex.exercise.slug)) return "assisted";
  if (ex.exercise.modality === "bodyweight") return "bodyweight";
  return "load";
}

/** Heavy barbell lifts get a warm-up ramp from the athletes who log one. */
const RAMPED =
  /squat|bench-press|deadlift|overhead-press|hip-thrust|barbell-row|incline-barbell|front-squat/;

export class YearSimulation {
  readonly findings: Finding[] = [];
  readonly athletes: Athlete[] = [];
  private readonly byName = new Map<string, Athlete>();
  private today = YEAR_START;

  constructor(
    private readonly t: TestDatabase,
    private readonly clock: Clock,
    /** The real time: nothing is simulated after it. */
    private readonly now: Date,
  ) {}

  // --- Plumbing --------------------------------------------------------------------------------

  private at(date: string, time: string, timeZone: string): Date {
    return fromDateTimeLocal(`${date}T${time}`, timeZone)!;
  }

  private as<T>(a: Athlete, work: (tx: DbOrTx) => Promise<T>): Promise<T> {
    return withUser(this.t.db, a.userId, work);
  }

  private note(a: Athlete | null, stage: string, error: unknown) {
    this.findings.push({
      persona: a?.p.username ?? "-",
      date: this.today,
      stage,
      message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }

  private count(a: Athlete, what: string, by = 1) {
    a.stats[what] = (a.stats[what] ?? 0) + by;
  }

  private local(a: Athlete): string {
    return todayInTimeZone(a.p.timeZone);
  }

  private bodyWeightOn(a: Athlete, date: string): number {
    const share = clamp(daysBetween(YEAR_START, date) / daysBetween(YEAR_START, YEAR_END), 0, 1);
    const [start, end] = a.p.bodyWeight;
    // Holidays add a little; the noise is a scale's, not a trend's.
    const festive = date >= "2025-12-24" && date <= "2026-01-08" ? 0.8 : 0;
    return (
      Math.round((start + (end - start) * share + festive + (a.random() - 0.5) * 0.8) * 10) / 10
    );
  }

  // --- Accounts --------------------------------------------------------------------------------

  async enrol(p: Persona) {
    const email = `${p.username}@local.test`;
    const id = crypto.randomUUID();
    this.clock.set(this.at(addDays(YEAR_START, -3), "20:00", p.timeZone));
    await this.t.client.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)",
      [id, email, JSON.stringify({ username: p.username, display_name: p.name })],
    );
    const a: Athlete = {
      p,
      userId: id,
      email,
      gymIds: new Map(),
      random: generator(p.username),
      strength: new Map(),
      lastTrained: new Map(),
      block: -1,
      blueprint: null,
      revised: new Set(),
      lastWeighed: null,
      foodIds: new Map(),
      savedMealId: null,
      stats: {},
    };
    this.athletes.push(a);
    this.byName.set(p.username, a);
    await this.as(a, async (tx) => {
      await ensureProfile(tx, { id, email, displayName: p.name });
      await tx
        .update(profiles)
        .set({
          displayName: p.name,
          timeZone: p.timeZone,
          preferredUnit: p.unit,
          heightCm: p.heightCm,
          dateOfBirth: p.dateOfBirth,
          sex: p.sex,
          trainingGoal: p.goal,
          trainingExperience: p.experience,
          restTimerEnabled: p.level !== "beginner",
          followApproval: p.privacy.followApproval,
          shareTraining: p.privacy.shareTraining,
          shareBodyWeight: p.privacy.shareBodyWeight,
          discoverableByEmail: p.privacy.discoverableByEmail,
          onboardedAt: new Date(),
        })
        .where(eq(profiles.id, id));
      for (const sport of ["strength", "running", "cycling", "swimming"] as const) {
        await setSportPreference(tx, id, sport, {
          enabled: p.sports.includes(sport),
          distanceUnit: p.distanceUnit ?? "km",
          poolUnit: p.poolUnit ?? "m",
          shareStats:
            sport === "cycling" || sport === "swimming"
              ? (p.shareSports ?? []).includes(sport)
              : false,
        });
      }
      await recordBodyWeight(tx, id, {
        measuredOn: addDays(YEAR_START, -3),
        weightKg: p.bodyWeight[0],
      });
      a.lastWeighed = addDays(YEAR_START, -3);
      const types = await tx.select().from(equipmentTypes);
      for (const spec of p.gyms) {
        const gym = await createGym(tx, id, {
          name: spec.name,
          kind: spec.kind,
          address: spec.address,
          notes: null,
        });
        a.gymIds.set(spec.key, gym.id);
        const wanted =
          spec.equipment === "all"
            ? types.filter((type) => !(spec.without ?? []).includes(type.slug))
            : types.filter((type) => (spec.equipment as readonly string[]).includes(type.slug));
        await confirmStarterEquipment(tx, id, gym.id, p.unit, {
          typeIds: wanted.map((type) => type.id),
          combinationIds: [],
          notHereTypeIds:
            spec.equipment === "all"
              ? types.filter((type) => (spec.without ?? []).includes(type.slug)).map((t) => t.id)
              : [],
        });
        for (const [slug, known] of Object.entries(spec.known ?? {})) {
          const type = types.find((candidate) => candidate.slug === slug);
          if (!type) throw new Error(`Unknown equipment type ${slug}`);
          await tx
            .update(equipmentInstances)
            .set({ loadIncrement: known.increment, ...(known.unit ? { unit: known.unit } : {}) })
            .where(
              and(
                eq(equipmentInstances.gymId, gym.id),
                eq(equipmentInstances.equipmentTypeId, type.id),
              ),
            );
        }
      }
      if (p.food) await saveNutritionTargets(tx, id, p.food.targets);
    });
    return a;
  }

  // --- The year --------------------------------------------------------------------------------

  async run() {
    for (let date = YEAR_START; date <= YEAR_END; date = addDays(date, 1)) {
      this.today = date;
      const events: { at: Date; a: Athlete | null; what: string; run(): Promise<unknown> }[] = [];
      for (const follow of FOLLOWS.filter((entry) => entry.on === date))
        events.push({
          at: new Date(`${date}T12:00:00Z`),
          a: this.byName.get(follow.from) ?? null,
          what: "follow",
          run: () => this.follow(follow.from, follow.to, follow.outcome),
        });
      for (const a of this.athletes) {
        const minutes = Math.round((a.random() - 0.5) * 2 * a.p.jitter);
        const late = (a.p.lateNight ?? 0) > a.random();
        const [hours, mins] = (late ? "23:35" : a.p.trainAt).split(":").map(Number);
        const start = new Date(
          this.at(
            date,
            `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`,
            a.p.timeZone,
          ).getTime() + (late ? 0 : minutes * 60_000),
        );
        events.push({ at: start, a, what: "day", run: () => this.day(a, date, start) });
        // Food is logged through the day; written at the evening in one go.
        if (a.p.food && date >= a.p.food.from)
          events.push({
            at: this.at(date, "21:30", a.p.timeZone),
            a,
            what: "food",
            run: () => this.food(a, date),
          });
        events.push({
          at: this.at(date, "12:10", a.p.timeZone),
          a,
          what: "look at today",
          run: () => this.lookAtToday(a, date),
        });
        // The last morning, mid-session: the open workout the audit opens. Its own event, so it
        // happens even when the audit runs before the athlete's usual evening.
        if (a.p.username === "kenji" && date === YEAR_END)
          events.push({
            at: new Date(
              Math.min(
                this.now.getTime() - 30 * 60_000,
                this.at(date, "10:30", a.p.timeZone).getTime(),
              ),
            ),
            a,
            what: "open workout",
            run: () => this.openWorkoutNow(a, date),
          });
      }
      events.sort((x, y) => x.at.getTime() - y.at.getTime());
      for (const event of events) {
        if (event.at.getTime() > this.now.getTime()) continue;
        this.clock.set(event.at);
        await event.run().catch((error) => this.note(event.a, event.what, error));
      }
    }
  }

  /** One athlete's day: their programme, their training, whatever else the day holds. */
  private async day(a: Athlete, date: string, start: Date) {
    const weekday = isoWeekdayOf(date);
    await this.maybeStartBlock(a, date);
    await this.maybeRevise(a, date);
    await this.specials(a, date, start);
    // Away for work, she trains in the hotel gym and her programme waits for her return.
    if (this.travelling(a, date)) return;
    const away = a.p.breaks.find((b) => date >= b.from && date <= b.to);
    if (away) {
      if (date === away.from) await this.skipWhileAway(a, away.reason);
      return;
    }
    const schedule = await this.as(a, (tx) => getSchedule(tx, a.userId));
    const next = schedule ? nextPendingSlot(schedule.state) : null;
    if (!schedule || !next) {
      // No programme, or one finished and the next not due: train ad hoc on the usual days.
      if ([1, 3, 5].includes(weekday) && a.random() < a.p.adherence(this.month(date)))
        await this.adHoc(a, date, start, this.gymFor(a, date), "between programmes");
      await this.extras(a, date, start);
      return;
    }
    const trainingWeekdays = new Set(
      schedule.days.filter((d) => d.includesLifting || d.includesRun).map((d) => d.dayOfWeek),
    );
    if (!trainingWeekdays.has(weekday)) {
      await this.restDay(a, schedule, weekday);
      await this.extras(a, date, start);
      return;
    }
    if (a.random() > a.p.adherence(this.month(date))) {
      this.count(a, "missed");
      if (a.random() < a.p.explicitSkip) await this.skipNext(a, schedule, missReason(a));
      await this.extras(a, date, start);
      return;
    }
    await this.trainNext(a, schedule, date, start);
    await this.extras(a, date, start);
  }

  private month(date: string) {
    return clamp(Math.floor(daysBetween(YEAR_START, date) / 30.5), 0, 11);
  }

  private gymFor(a: Athlete, date: string): string {
    const key = a.p.gymFor?.(date, isoWeekdayOf(date)) ?? a.p.gyms[0]!.key;
    return a.gymIds.get(key)!;
  }

  private gymKeyOf(a: Athlete, gymId: string): string {
    return [...a.gymIds.entries()].find(([, id]) => id === gymId)?.[0] ?? a.p.gyms[0]!.key;
  }

  // --- Programmes ------------------------------------------------------------------------------

  /** Starts the next block when it is due and the last is finished, or when it replaces it. */
  private async maybeStartBlock(a: Athlete, date: string) {
    const next = a.p.blocks[a.block + 1];
    if (!next || date < next.on) return;
    if (a.block >= 0 && !next.replaces) {
      const schedule = await this.as(a, (tx) => getSchedule(tx, a.userId));
      // Unfinished: it waits. Finished: it starts on the next Monday, as people restart.
      if (schedule && nextPendingSlot(schedule.state)) return;
      if (isoWeekdayOf(date) !== 1 && date !== next.on) return;
    }
    await this.startBlock(a, next, date);
  }

  /** The manual builder's path: save a draft, review it, start it as a new block. */
  private async startBlock(a: Athlete, block: Block, date: string) {
    await this.as(a, async (tx) => {
      const open = await getInProgressSession(tx, a.userId);
      if (open) await this.finishOpen(tx, a, open.id, "Left open before a new programme");
      const draft = await saveManualDraft(tx, a.userId, block.programme);
      const reviewed = await refreshProgramDraft(tx, a.userId, draft.id, draft.revision);
      await activateProgramDraft(tx, a.userId, reviewed.id, {
        expectedRevision: reviewed.revision,
        startDate: date,
        transition: "new_block",
      });
    });
    a.block += 1;
    a.blueprint = block.programme;
    this.count(a, "programmes started");
  }

  /** A change that keeps the schedule: the next version of the running programme, continued. */
  private async maybeRevise(a: Athlete, date: string) {
    for (const revision of a.p.revisions ?? []) {
      if (revision.on !== date || a.revised.has(revision.on)) continue;
      a.revised.add(revision.on);
      await this.as(a, async (tx) => {
        const schedule = await getSchedule(tx, a.userId);
        if (!schedule) throw new Error("No programme to revise.");
        const current = await readProgramBlueprint(tx, a.userId, schedule.program.id);
        if (!current) throw new Error("The running programme cannot be read back.");
        const revised = revision.revise(current.blueprint);
        const draft = await saveManualDraft(tx, a.userId, revised, {
          baseProgramId: schedule.program.id,
        });
        const reviewed = await refreshProgramDraft(tx, a.userId, draft.id, draft.revision);
        await activateProgramDraft(tx, a.userId, reviewed.id, {
          expectedRevision: reviewed.revision,
          startDate: date,
          transition: "continue",
        });
        a.blueprint = revised;
      });
      this.count(a, "programme revisions");
    }
  }

  // --- The schedule ----------------------------------------------------------------------------

  /** The first slot that still owes training, past any rest slots in the way. */
  private nextTraining(schedule: Schedule): SlotRef | null {
    for (const ref of allSlots(schedule.state)) {
      const slot = slotFor(schedule.state, ref);
      if (!slot || isRestSlot(slot)) continue;
      if (pendingParts(schedule.state, ref).length > 0) return ref;
    }
    return null;
  }

  private async restDay(a: Athlete, schedule: Schedule, weekday: number) {
    // Sometimes the athlete taps "Mark rest day done" when Today offers the rest day.
    const next = nextPendingSlot(schedule.state);
    if (!next || a.random() > 0.3) return;
    const slot = slotFor(schedule.state, next);
    const day = schedule.days.find((d) => d.dayIndex === next.dayIndex);
    if (!slot || !isRestSlot(slot) || day?.dayOfWeek !== weekday) return;
    // `completeRestSlotAction`, as it writes it.
    await this.as(a, async (tx) => {
      const fresh = (await getSchedule(tx, a.userId))!;
      const cycleIndex = pendingCycleForDay(fresh.state, next.dayIndex, "session");
      if (cycleIndex === null) return;
      await recordSlotEvent(
        tx,
        a.userId,
        fresh.program.id,
        { cycleIndex, dayIndex: next.dayIndex },
        "session",
        "completed",
        {
          occurredOn: this.local(a),
          note: "Rest day done",
        },
      );
      await voidPlanForSlot(tx, a.userId, fresh.program.id, {
        cycleIndex,
        dayIndex: next.dayIndex,
      });
    });
    this.count(a, "rest days marked");
  }

  /** `skipSlotAction` for each part of the next training day still owed. */
  private async skipNext(a: Athlete, schedule: Schedule, reason: string) {
    const ref = this.nextTraining(schedule);
    if (!ref) return;
    for (const part of pendingParts(schedule.state, ref)) {
      await this.as(a, async (tx) => {
        const fresh = (await getSchedule(tx, a.userId))!;
        const cycleIndex = pendingCycleForDay(fresh.state, ref.dayIndex, part);
        if (cycleIndex === null) return;
        await skipSlotPart(
          tx,
          a.userId,
          fresh.program,
          { cycleIndex, dayIndex: ref.dayIndex },
          part,
          {
            occurredOn: this.local(a),
            note: reason,
          },
        );
        if (
          pendingParts(fresh.state, { cycleIndex, dayIndex: ref.dayIndex }).every((p) => p === part)
        )
          await voidPlanForSlot(tx, a.userId, fresh.program.id, {
            cycleIndex,
            dayIndex: ref.dayIndex,
          });
      });
      this.count(a, `skipped ${part}`);
    }
  }

  private async skipWhileAway(a: Athlete, reason: string) {
    const schedule = await this.as(a, (tx) => getSchedule(tx, a.userId));
    if (schedule && a.random() < a.p.explicitSkip) await this.skipNext(a, schedule, reason);
  }

  private async trainNext(a: Athlete, schedule: Schedule, date: string, start: Date) {
    let ref = this.nextTraining(schedule);
    if (!ref) return;
    // Now and then the athlete picks another day from "Train another day".
    if (a.random() < 0.04) {
      const others = schedule.days
        .filter((d) => d.includesLifting && d.dayIndex !== ref!.dayIndex)
        .map((d) => ({ cycleIndex: ref!.cycleIndex, dayIndex: d.dayIndex }))
        .filter((other) => partStatus(schedule.state, other, "session") === "pending");
      if (others.length) {
        ref = others[Math.floor(a.random() * others.length)]!;
        this.count(a, "trained another day");
      }
    }
    const day = schedule.days.find((d) => d.dayIndex === ref!.dayIndex)!;
    const parts = pendingParts(schedule.state, ref);
    let end = start;
    if (day.includesLifting && parts.includes("session"))
      end = await this.lift(a, date, start, this.gymFor(a, date), day.id, ref.dayIndex);
    if (day.includesRun && parts.includes("run"))
      await this.plannedRun(a, ref, day.dayOfWeek, new Date(end.getTime() + 10 * 60_000));
  }

  /** Picking a skipped day from "Train another day": the skip is taken back and the day trained. */
  private async trainSkipped(a: Athlete, date: string, start: Date) {
    const schedule = await this.as(a, (tx) => getSchedule(tx, a.userId));
    if (!schedule) return false;
    const current = this.nextTraining(schedule)?.cycleIndex ?? 1;
    for (const day of schedule.days) {
      if (!day.includesLifting) continue;
      for (const cycleIndex of [current, current - 1]) {
        if (cycleIndex < 1) continue;
        if (
          partStatus(schedule.state, { cycleIndex, dayIndex: day.dayIndex }, "session") !==
          "skipped"
        )
          continue;
        await this.lift(a, date, start, this.gymFor(a, date), day.id, day.dayIndex, cycleIndex);
        this.count(a, "trained a skipped day");
        return true;
      }
    }
    return false;
  }

  // --- Lifting ---------------------------------------------------------------------------------

  /** Start (as `startSessionAction` does for a planned day), log every set, finish. */
  private async lift(
    a: Athlete,
    date: string,
    start: Date,
    gymId: string,
    programDayId: string,
    dayIndex: number,
    fromCycleIndex?: number,
  ): Promise<Date> {
    this.clock.set(start);
    const started = await this.as(a, async (tx) => {
      const open = await getInProgressSession(tx, a.userId);
      if (open) {
        this.note(
          a,
          "start",
          `An earlier workout was still open (${open.id}); finishing it first.`,
        );
        await this.finishOpen(tx, a, open.id, null);
      }
      const schedule = await getSchedule(tx, a.userId);
      const day = schedule?.days.find((d) => d.id === programDayId && d.dayIndex === dayIndex);
      if (!schedule || !day?.includesLifting) return null;
      const shown =
        fromCycleIndex !== undefined &&
        partStatus(schedule.state, { cycleIndex: fromCycleIndex, dayIndex }, "session") ===
          "skipped"
          ? fromCycleIndex
          : null;
      const cycleIndex = shown ?? pendingCycleForDay(schedule.state, dayIndex, "session");
      if (cycleIndex === null) return null;
      if (shown !== null)
        await reopenSkippedSession(tx, a.userId, schedule.program.id, { cycleIndex, dayIndex });
      await completeRestSlotsBefore(
        tx,
        a.userId,
        schedule,
        { cycleIndex, dayIndex },
        this.local(a),
      );
      const { sessionId } = await startPlannedSession(tx, a.userId, {
        gymId,
        programDayId,
        cycleIndex,
      });
      if (a.random() < a.p.checkIn) await saveCheckIn(tx, a.userId, sessionId, this.checkIn(a));
      return { sessionId, cycleIndex };
    });
    if (!started) {
      this.note(a, "start", `Day ${dayIndex} could not be started: nothing left to train.`);
      return start;
    }
    this.count(a, "planned workouts");
    const end = await this.logWorkout(a, started.sessionId, start, gymId, started.cycleIndex);
    await this.finish(a, started.sessionId, end, date, {
      programDayId,
      dayIndex,
      cycleIndex: started.cycleIndex,
    });
    return end;
  }

  private checkIn(a: Athlete) {
    const r = a.random();
    const partial = r < 0.2;
    return {
      sleepHours: partial ? null : Math.round((5.5 + a.random() * 3) * 4) / 4,
      sleepQuality: partial ? null : 2 + Math.floor(a.random() * 4),
      fatigue: 1 + Math.floor(a.random() * 4),
      soreness: partial ? null : 1 + Math.floor(a.random() * 4),
    };
  }

  /** Every exercise of an open workout, set by set, each set its own request. */
  private async logWorkout(
    a: Athlete,
    sessionId: string,
    start: Date,
    gymId: string,
    cycleIndex: number | null,
  ): Promise<Date> {
    let clock = start.getTime() + (6 + a.random() * 6) * 60_000;
    const tick = (seconds: number) => {
      clock += seconds * 1000;
      this.clock.set(new Date(clock));
    };
    const detail = await this.as(a, (tx) =>
      getSessionDetail(tx, a.userId, sessionId, {
        preferredUnit: a.p.unit,
        timeZone: a.p.timeZone,
      }),
    );
    if (!detail) throw new Error("The workout just started cannot be read back.");
    if (a.random() < 0.85)
      await this.as(a, (tx) => setWarmupCompleted(tx, a.userId, sessionId, true));
    let exercises = detail.exercises;
    // Machines nobody has answered for are settled first, as the workout asks.
    if (exercises.some((ex) => ex.decision && !ex.skippedAt)) {
      for (const ex of exercises.filter((e) => e.decision && !e.skippedAt))
        await this.settle(a, ex, gymId).catch((error) => this.note(a, "machine question", error));
      exercises =
        (
          await this.as(a, (tx) =>
            getSessionDetail(tx, a.userId, sessionId, {
              preferredUnit: a.p.unit,
              timeZone: a.p.timeZone,
            }),
          )
        )?.exercises ?? exercises;
    }
    // Supersets now and then, for this workout only.
    if (a.p.username === "sofia" && a.random() < 0.15) {
      const pair = exercises.filter((ex) => !ex.supersetGroup && !ex.skippedAt).slice(-2);
      if (pair.length === 2)
        await this.as(a, (tx) =>
          saveSupersetGroup(tx, a.userId, {
            sessionId,
            group: null,
            workoutExerciseIds: pair.map((ex) => ex.id),
          }),
        ).catch((error) => this.note(a, "superset", error));
    }
    let first = true;
    for (const ex of exercises) {
      if (ex.skippedAt) continue;
      tick(60 + a.random() * 90);
      if (a.random() < 0.025) {
        await this.as(a, (tx) =>
          skipExercise(tx, a.userId, ex.id, a.random() < 0.5 ? "Machine taken" : "Elbow niggle"),
        );
        this.count(a, "exercises skipped");
        continue;
      }
      if (ex.equipment === null && ex.exercise.requiresEquipment && ex.decision) {
        await this.as(a, (tx) => skipExercise(tx, a.userId, ex.id, "Not at this gym"));
        this.count(a, "exercises skipped (no machine)");
        continue;
      }
      await this.logExercise(a, ex, gymId, first, cycleIndex, tick);
      first = false;
      if (a.random() < 0.85)
        await this.as(a, (tx) => setExerciseCompleted(tx, a.userId, ex.id, true));
    }
    // Some days a little extra at the end.
    if (a.random() < 0.08) {
      await this.addAndLog(a, sessionId, gymId, ["cable-crunch", "hanging-knee-raise"], tick).catch(
        (error) => this.note(a, "add exercise", error),
      );
    }
    tick(120);
    return new Date(clock);
  }

  /** The machine question a workout asks, answered the way someone standing in the gym would. */
  private async settle(a: Athlete, ex: SessionExercise, gymId: string) {
    const decision = ex.decision!;
    const ask = decision.ask;
    const gym = a.p.gyms.find((g) => a.gymIds.get(g.key) === gymId)!;
    await this.as(a, async (tx) => {
      if (ask) {
        const here =
          gym.equipment === "all"
            ? !(gym.without ?? []).includes(ask.slug)
            : (gym.equipment as readonly string[]).includes(ask.slug);
        if (here) {
          await confirmEquipmentHere(tx, a.userId, ex.id, ask.typeId, a.p.unit);
          this.count(a, "machines confirmed in a workout");
          return;
        }
        await markEquipmentNotHere(tx, a.userId, ex.id, ask.typeId);
        this.count(a, "machines marked not here");
      }
      const fallback = decision.fallbackOptions.find((option) => option.available);
      if (fallback && !ex.equipment) {
        await substituteExercise(tx, a.userId, {
          workoutExerciseId: ex.id,
          exerciseId: fallback.exerciseId,
          equipmentInstanceId: fallback.equipmentInstanceId,
          reason: `Fallback: ${fallback.exerciseName}`,
        });
        this.count(a, "fallbacks applied");
      }
    });
  }

  private async addAndLog(
    a: Athlete,
    sessionId: string,
    gymId: string,
    slugs: readonly string[],
    tick: (seconds: number) => void,
  ) {
    const added = await this.as(a, async (tx) => {
      const rows = await tx.query.exercises.findMany({
        where: (exercise, { inArray: within }) => within(exercise.slug, [...slugs]),
      });
      const compatible = await machinesByExerciseAtGym(tx, a.userId, gymId);
      const chosen = rows
        .filter((row) => !row.requiresEquipment || (compatible[row.id]?.length ?? 0) > 0)
        .slice(0, 1);
      if (!chosen.length) return [];
      const { workoutExerciseIds } = await addExercisesToSession(
        tx,
        a.userId,
        sessionId,
        chosen.map((row) => ({
          exerciseId: row.id,
          equipmentInstanceId: compatible[row.id]?.[0] ?? null,
        })),
      );
      return workoutExerciseIds;
    });
    if (!added.length) return;
    this.count(a, "exercises added");
    const detail = await this.as(a, (tx) =>
      getSessionDetail(tx, a.userId, sessionId, {
        preferredUnit: a.p.unit,
        timeZone: a.p.timeZone,
      }),
    );
    for (const ex of detail?.exercises ?? [])
      if (added.includes(ex.id)) await this.logExercise(a, ex, gymId, false, null, tick);
  }

  private strengthOf(a: Athlete, ex: SessionExercise, gymId: string): number {
    const slug = ex.exercise.slug;
    let max = a.strength.get(slug);
    if (max === undefined) {
      max =
        a.p.strength[slug] ??
        (TYPICAL_KG[ex.exercise.modality] ?? 40) * a.p.baseline * exerciseFactor(slug);
      a.strength.set(slug, max);
    }
    // A break costs a little: a percent a week past the first fortnight, a tenth at most.
    const last = a.lastTrained.get(slug);
    if (last) {
      const weeks = (daysBetween(last, this.today) - 14) / 7;
      if (weeks > 0) {
        max *= 1 - Math.min(0.1, weeks * 0.01);
        a.strength.set(slug, max);
      }
    }
    // Stack numbers are the machine's own: the same effort reads differently at each gym.
    if (ex.exercise.modality === "machine" || ex.exercise.modality === "cable") {
      const gym = a.p.gyms.find((g) => g.key === this.gymKeyOf(a, gymId));
      max *= (gym?.stackFactor ?? 1) * (0.9 + 0.2 * hash(`${gymId}:${slug}`));
    }
    return max;
  }

  private grow(a: Athlete, slug: string) {
    const share = clamp(daysBetween(YEAR_START, this.today) / 364, 0, 1);
    const [early, late] = a.p.growth;
    const rate = early + (late - early) * share;
    a.strength.set(slug, (a.strength.get(slug) ?? 0) * (1 + rate));
    a.lastTrained.set(slug, this.today);
  }

  /** Every set of one exercise, as this athlete does it. */
  private async logExercise(
    a: Athlete,
    ex: SessionExercise,
    gymId: string,
    first: boolean,
    cycleIndex: number | null,
    tick: (seconds: number) => void,
  ) {
    const measure = measureOf(ex);
    const unit = ex.equipment?.unit ?? a.p.unit;
    const toUnit = (kg: number) => (unit === "lb" ? kg / KG_PER_LB : kg);
    const step = ex.weightStep || (unit === "lb" ? 5 : 2.5);
    const planned = ex.planned;
    const count = planned?.sets ?? 3;
    const [low, high] = [
      planned?.repMin ?? ex.exercise.defaults.repMin ?? 8,
      planned?.repMax ?? ex.exercise.defaults.repMax ?? 12,
    ];
    const rirTarget = planned?.rirMin ?? 2;
    const max = this.strengthOf(a, ex, gymId);
    const suggested = ex.suggestion?.sets ?? [];
    let index = 1;
    const save = async (values: {
      setType: SetType;
      weight: number | null;
      reps: number | null;
      rir: number | null;
      rpe?: number | null;
      durationSeconds: number | null;
      distanceMeters?: number | null;
    }) => {
      await this.as(a, (tx) =>
        saveSet(tx, a.userId, { workoutExerciseId: ex.id, setIndex: index++, unit, ...values }),
      );
      this.count(a, values.setType === "warmup" ? "warm-up sets" : "sets");
    };

    if (measure === "duration") {
      const [lo, hi] = [planned?.durationMinSeconds ?? 30, planned?.durationMaxSeconds ?? 60];
      for (let i = 0; i < count; i++) {
        tick(60 + (planned?.restMinSeconds ?? 60));
        const progress = clamp((a.strength.get(ex.exercise.slug) ?? 0.4) * 1.0, 0, 1.4);
        const seconds = Math.round(clamp(lo + (hi - lo) * progress - i * 5, 10, hi * 1.2));
        await save({
          setType: "working",
          weight: ex.exercise.slug === "weighted-plank" ? toUnit(20) : null,
          reps: null,
          rir: null,
          rpe: 6 + Math.floor(a.random() * 3),
          durationSeconds: seconds,
        });
      }
      a.strength.set(
        ex.exercise.slug,
        Math.min(1.4, (a.strength.get(ex.exercise.slug) ?? 0.4) + 0.02),
      );
      return;
    }
    if (measure === "distance") {
      const metres = planned?.distanceMinMeters ?? 30;
      const perHand = roundDown(toUnit(max * 0.9), step);
      for (let i = 0; i < count; i++) {
        tick(90 + (planned?.restMinSeconds ?? 60));
        await save({
          setType: "working",
          weight: perHand,
          reps: null,
          rir: null,
          rpe: 6 + Math.floor(a.random() * 3),
          durationSeconds: null,
          distanceMeters: metres + (a.random() < 0.2 ? 10 : 0),
        });
      }
      this.grow(a, ex.exercise.slug);
      return;
    }

    if (measure === "bodyweight" || measure === "assisted") {
      // Reps at body weight; the strongest add load, the weakest take help on a machine.
      const capacityBase =
        a.strength.get(`${ex.exercise.slug}:reps`) ??
        (a.p.level === "beginner" ? 6 : a.p.level === "intermediate" ? 12 : 16) *
          (/pull-up|chin-up/.test(ex.exercise.slug) ? 0.6 : 1);
      a.strength.set(`${ex.exercise.slug}:reps`, capacityBase);
      const bodyweight = this.bodyWeightOn(a, this.today);
      for (let i = 0; i < count; i++) {
        tick(45 + (planned?.restMinSeconds ?? 90));
        let weight = 0;
        let capacity = Math.floor(capacityBase - i * 1.2 + (a.random() - 0.5) * 2);
        if (measure === "assisted") {
          // Help lifts the athlete's share: enough of it to reach the bottom of the range.
          const need = clamp(1 - capacity / (low + rirTarget + 2), 0, 0.7);
          weight = round(toUnit(bodyweight * need), step);
          capacity = low + rirTarget + Math.floor(a.random() * 3);
        } else if (a.p.level === "advanced" && capacity > high + rirTarget + 3) {
          weight = round(toUnit((capacity - high - rirTarget) * 2.5), step);
          capacity = high + rirTarget;
        }
        const reps = clamp(capacity - rirTarget, 1, high + 2);
        await save({
          setType: "working",
          weight,
          reps,
          rir: clamp(capacity - reps + Math.round((a.random() - 0.5) * 2), 0, 5),
          durationSeconds: null,
        });
      }
      a.strength.set(`${ex.exercise.slug}:reps`, capacityBase * (1 + a.p.growth[0] * 1.5));
      return;
    }

    const maxU = toUnit(max);
    if (first && a.p.warmupSets && RAMPED.test(ex.exercise.slug)) {
      for (const [share, reps] of [
        [0.4, 8],
        [0.6, 5],
        [0.8, 2],
      ] as const) {
        tick(90);
        await save({
          setType: "warmup",
          weight: round(maxU * share * 0.85, step),
          reps,
          rir: null,
          durationSeconds: null,
        });
      }
    }
    const powerlifter = a.p.username === "kenji";
    const deload = cycleIndex !== null && cycleIndex % 4 === 0;
    for (let i = 0; i < count; i++) {
      tick((planned?.restMinSeconds ?? 90) + 40 + a.random() * 40);
      // The suggestion leads with its warm-up ramp where the lift has one: the work is after it.
      const target = suggested.filter((set) => set.setType !== "warmup")[i];
      const wantReps = target?.reps ?? Math.round((low + high) / 2);
      let load =
        target?.weight != null && a.random() < a.p.followSuggestion
          ? target.weight
          : roundDown(maxU / (1 + (wantReps + rirTarget) / 30), step);
      let setType: SetType = "working";
      if (powerlifter && i > 0 && /squat|bench|deadlift/.test(ex.exercise.slug)) {
        setType = "backoff";
        load = roundDown(load * 0.92, step);
      }
      if (powerlifter && deload && i === count - 1 && first) setType = "amrap";
      if (
        a.p.username === "sofia" &&
        i === count - 1 &&
        exerciseFactor(ex.exercise.slug) < 0.6 &&
        a.random() < 0.4
      )
        setType = "drop";
      if (setType === "drop") load = roundDown(load * 0.75, step);
      if (deload && powerlifter) load = roundDown(load * 0.85, step);
      const fatigue = i * (a.p.level === "beginner" ? 0.5 : 0.8);
      const capacity = Math.max(
        0,
        Math.floor(30 * (maxU / Math.max(load, step) - 1) - fatigue + (a.random() - 0.5) * 2),
      );
      // A set taken to failure goes as far as the capacity says, but not past what a body does:
      // Epley's reading of a light load runs on without end (35 kg × 83 on a 145 kg bench, a
      // drop set of 318), so reps to failure stop ten past the top of the range.
      const reps =
        setType === "amrap" || setType === "drop"
          ? clamp(capacity, 1, high + 10)
          : clamp(capacity - rirTarget, 1, high + (a.random() < 0.1 ? 2 : 0));
      const rir =
        setType === "amrap"
          ? 0
          : clamp(
              capacity - reps + Math.round((a.random() - 0.5) * 2),
              0,
              // A drop set stopped at that ceiling was still near failure.
              setType === "drop" ? 1 : 5,
            );
      await save({
        setType,
        weight: load,
        reps,
        rir,
        durationSeconds: null,
      });
    }
    this.grow(a, ex.exercise.slug);
  }

  /** `finishSessionAction`: the workout, the reading, the slot it answered. */
  private async finish(
    a: Athlete,
    sessionId: string,
    end: Date,
    date: string,
    planned: { programDayId: string; dayIndex: number; cycleIndex: number } | null,
  ) {
    this.clock.set(end);
    const weigh = !a.lastWeighed || daysBetween(a.lastWeighed, date) >= a.p.weighEvery;
    const bodyWeightKg = weigh ? this.bodyWeightOn(a, date) : null;
    const notes =
      a.random() < 0.12
        ? [
            "Felt strong today.",
            "Short on time, kept rest tight.",
            "Grip gave out on the last set.",
            "Gym was packed.",
          ][Math.floor(a.random() * 4)]!
        : null;
    await this.as(a, async (tx) => {
      const finished = await finishSession(tx, a.userId, sessionId, { notes, bodyWeightKg });
      if (bodyWeightKg !== null)
        await recordBodyWeight(tx, a.userId, { measuredOn: this.local(a), weightKg: bodyWeightKg });
      if (finished.programId && finished.dayIndex !== null && finished.cycleIndex !== null)
        await recordSlotEvent(
          tx,
          a.userId,
          finished.programId,
          { cycleIndex: finished.cycleIndex, dayIndex: finished.dayIndex },
          "session",
          "completed",
          {
            occurredOn: todayInTimeZone(a.p.timeZone, finished.startedAt),
            workoutSessionId: sessionId,
          },
        );
      this.count(a, "records set", finished.records.length);
    });
    if (bodyWeightKg !== null) a.lastWeighed = date;
    // The session is done: the schedule must say so.
    if (planned) {
      const schedule = await this.as(a, (tx) => getSchedule(tx, a.userId));
      if (
        schedule &&
        partStatus(
          schedule.state,
          { cycleIndex: planned.cycleIndex, dayIndex: planned.dayIndex },
          "session",
        ) !== "completed"
      )
        this.note(
          a,
          "finish",
          `Cycle ${planned.cycleIndex} day ${planned.dayIndex} is not completed after its workout.`,
        );
    }
  }

  private async finishOpen(tx: DbOrTx, a: Athlete, sessionId: string, notes: string | null) {
    const finished = await finishSession(tx, a.userId, sessionId, { notes, bodyWeightKg: null });
    if (finished.programId && finished.dayIndex !== null && finished.cycleIndex !== null)
      await recordSlotEvent(
        tx,
        a.userId,
        finished.programId,
        { cycleIndex: finished.cycleIndex, dayIndex: finished.dayIndex },
        "session",
        "completed",
        {
          occurredOn: todayInTimeZone(a.p.timeZone, finished.startedAt),
          workoutSessionId: sessionId,
        },
      );
  }

  /** A session with no programme day: on the road, between programmes, or the meet. */
  private async adHoc(
    a: Athlete,
    date: string,
    start: Date,
    gymId: string,
    why: string,
    slugs?: readonly string[],
  ) {
    this.clock.set(start);
    const chosen = slugs ?? this.adHocExercises(a);
    const sessionId = await this.as(a, async (tx) => {
      const open = await getInProgressSession(tx, a.userId);
      if (open) await this.finishOpen(tx, a, open.id, null);
      const { sessionId } = await startAdHocSession(tx, a.userId, { gymId });
      if (a.random() < a.p.checkIn) await saveCheckIn(tx, a.userId, sessionId, this.checkIn(a));
      const rows = await tx.query.exercises.findMany({
        where: (exercise, { inArray: within }) => within(exercise.slug, [...chosen]),
      });
      const compatible = await machinesByExerciseAtGym(tx, a.userId, gymId);
      const usable = chosen
        .map((slug) => rows.find((row) => row.slug === slug))
        .filter((row): row is NonNullable<typeof row> => !!row)
        .filter((row) => !row.requiresEquipment || (compatible[row.id]?.length ?? 0) > 0);
      if (usable.length)
        await addExercisesToSession(
          tx,
          a.userId,
          sessionId,
          usable.map((row) => ({
            exerciseId: row.id,
            equipmentInstanceId: compatible[row.id]?.[0] ?? null,
          })),
        );
      return sessionId;
    });
    this.count(a, `ad hoc workouts (${why})`);
    const end = await this.logWorkout(a, sessionId, start, gymId, null);
    await this.finish(a, sessionId, end, date, null);
  }

  private adHocExercises(a: Athlete): string[] {
    const fromProgramme = (a.blueprint ?? a.p.blocks[0]!.programme).days
      .filter((day) => day.includesLifting)
      .flatMap((day) => day.exercises.map((exercise) => exercise.exerciseSlug));
    const unique = [...new Set(fromProgramme)];
    const picked: string[] = [];
    while (picked.length < 5 && unique.length) {
      const [slug] = unique.splice(Math.floor(a.random() * unique.length), 1);
      picked.push(slug!);
    }
    return picked;
  }

  // --- Endurance -------------------------------------------------------------------------------

  /** The running programme's own run for a slot, still unanswered: what its day card opens. */
  private async occurrenceFor(
    tx: DbOrTx,
    a: Athlete,
    familyId: string,
    cycleIndex: number,
    dayIndex: number,
  ) {
    const [occurrence] = await tx
      .select()
      .from(plannedOccurrences)
      .where(
        and(
          eq(plannedOccurrences.userId, a.userId),
          eq(plannedOccurrences.familyId, familyId),
          eq(plannedOccurrences.sport, "running"),
          eq(plannedOccurrences.cycleIndex, cycleIndex),
          eq(plannedOccurrences.cycleDayIndex, dayIndex),
          inArray(plannedOccurrences.disposition, ["pending"]),
          sql`not exists (select 1 from activities logged where logged.occurrence_id = ${plannedOccurrences.id})`,
        ),
      )
      .orderBy(asc(plannedOccurrences.createdAt))
      .limit(1);
    return occurrence ?? null;
  }

  /** A programme's run, logged against its occurrence as the run screen does. */
  private async plannedRun(a: Athlete, ref: SlotRef, dayOfWeek: number | null, at: Date) {
    this.clock.set(at);
    await this.as(a, async (tx) => {
      const schedule = (await getSchedule(tx, a.userId))!;
      const cycleIndex = pendingCycleForDay(schedule.state, ref.dayIndex, "run");
      if (cycleIndex === null) return;
      const occurrence = await this.occurrenceFor(
        tx,
        a,
        schedule.program.familyId,
        cycleIndex,
        ref.dayIndex,
      );
      const planned = a.blueprint?.runs.find(
        (run) => run.weekIndex === cycleIndex && run.dayOfWeek === dayOfWeek,
      );
      const km = planned?.distanceKm
        ? planned.distanceKm[0] + (planned.distanceKm[1] - planned.distanceKm[0]) * a.random()
        : 5;
      const origin: LogOrigin = occurrence?.currentRevisionId
        ? plannedOrigin(occurrence.id, occurrence.currentRevisionId)
        : AD_HOC_ORIGIN;
      await this.logActivity(
        tx,
        a,
        "running",
        at,
        km * 1000,
        this.paceSecondsPerKm(a, planned?.rpe?.[1] ?? 2),
        origin,
      );
      if (!occurrence)
        await recordSlotEvent(
          tx,
          a.userId,
          schedule.program.id,
          { cycleIndex, dayIndex: ref.dayIndex },
          "run",
          "completed",
          {
            occurredOn: this.local(a),
          },
        );
    });
    this.count(a, "planned runs");
  }

  /** Seconds per kilometre: easy pace improves over the year; harder runs are quicker. */
  private paceSecondsPerKm(a: Athlete, effort: number): number {
    const share = clamp(daysBetween(YEAR_START, this.today) / 364, 0, 1);
    const [start, end] = a.p.username === "liam" ? [345, 310] : [470, 400];
    return (start + (end - start) * share) * (effort >= 4 ? 0.88 : 1) * (0.97 + a.random() * 0.06);
  }

  private async logActivity(
    tx: DbOrTx,
    a: Athlete,
    sport: Exclude<ActivitySport, "strength">,
    startedAt: Date,
    metres: number,
    secondsPerKm: number,
    origin: LogOrigin = AD_HOC_ORIGIN,
    extra: { pool?: boolean; distanceKnown?: boolean } = {},
  ) {
    const durationMs = Math.round((metres / 1000) * secondsPerKm * 1000);
    const unit = a.p.distanceUnit ?? "km";
    let actual: EnduranceActual;
    if (sport === "running")
      actual = {
        sport,
        environment: a.random() < 0.15 ? "treadmill" : "outdoor",
        distance:
          unit === "mi"
            ? nativeDistance(Math.round((metres / 1609.344) * 100) / 100, "mi")
            : nativeDistance(Math.round(metres / 10) / 100, "km"),
        durationMs,
        surface: null,
        elevationGainMetres: a.random() < 0.3 ? Math.round(a.random() * 120) : null,
        treadmillInclinePercent: null,
        averageHeartRate: a.random() < 0.5 ? 135 + Math.round(a.random() * 30) : null,
        maxHeartRate: null,
        cadenceStepsPerMinute: null,
      };
    else if (sport === "cycling")
      actual = {
        sport,
        environment: "indoor",
        durationMs,
        distance:
          extra.distanceKnown === false
            ? null
            : nativeDistance(Math.round(metres / 100) / 10, "km"),
        assistance: "unassisted",
        resourceId: null,
        averagePowerWatts: a.random() < 0.6 ? 140 + Math.round(a.random() * 40) : null,
        averageCadenceRpm: null,
        averageHeartRate: null,
        maxHeartRate: null,
        elevationGainMetres: null,
      };
    else {
      const pool = extra.pool ?? true;
      const poolLength = nativeDistance(25, a.p.poolUnit ?? "m");
      const lengths = Math.round(metres / poolLength.metres);
      actual = {
        sport,
        environment: pool ? "pool" : "open_water",
        elapsedMs: durationMs,
        activeMs: a.random() < 0.5 ? Math.round(durationMs * 0.8) : null,
        distanceMethod: pool ? "lengths" : "manual",
        // With lengths the distance is the pool's to work out; only open water is entered.
        distance: pool ? null : nativeDistance(Math.round(metres), "m"),
        poolLength: pool ? poolLength : null,
        lengths: pool ? lengths : null,
        stroke: "freestyle",
        strokeCount: null,
        resourceId: null,
        averageHeartRate: null,
        maxHeartRate: null,
      };
    }
    await createActivity(tx, a.userId, {
      submissionKey: crypto.randomUUID(),
      origin,
      actual,
      startedAt,
      recordedTimeZone: a.p.timeZone,
      timeZoneSource: "profile_at_entry",
      occurredOn: todayInTimeZone(a.p.timeZone, startedAt),
      effort:
        a.random() < 0.9
          ? reportedEffort(2 + Math.floor(a.random() * 3))
          : { status: "unknown", value: null },
      outcome: a.random() < 0.05 ? "ended_early" : "logged",
      title: null,
      notes: a.random() < 0.08 ? "Windy along the front." : null,
    });
    this.count(a, `${sport} logged`);
  }

  // --- What else a day holds -------------------------------------------------------------------

  /** Sports and habits outside the programme. */
  private async extras(a: Athlete, date: string, start: Date) {
    const weekday = isoWeekdayOf(date);
    const later = new Date(start.getTime() + 3 * 3600_000);
    if (later.getTime() > this.now.getTime()) return;
    if (a.p.username === "sofia" && weekday === 7 && a.random() < 0.7) {
      this.clock.set(later);
      await this.as(a, (tx) =>
        this.logActivity(tx, a, "cycling", later, 18_000 + a.random() * 8000, 120, AD_HOC_ORIGIN, {
          distanceKnown: a.random() < 0.7,
        }),
      );
    }
    if (a.p.username === "liam") {
      // Before the programme, and through the summer, easy runs and swims of his own.
      if (date < "2025-11-03" && [2, 4, 6].includes(weekday) && a.random() < 0.8) {
        this.clock.set(later);
        await this.as(a, (tx) =>
          this.logActivity(
            tx,
            a,
            "running",
            later,
            6000 + a.random() * 3000,
            this.paceSecondsPerKm(a, 2),
          ),
        );
      }
      if (date >= "2026-05-01" && date <= "2026-09-30" && weekday === 7 && a.random() < 0.6) {
        this.clock.set(later);
        const open = a.random() < 0.3;
        await this.as(a, (tx) =>
          this.logActivity(
            tx,
            a,
            "swimming",
            later,
            open ? 1500 : 1000 + a.random() * 1000,
            // About two minutes a hundred metres, as a steady swimmer goes: seconds per km.
            1150 + a.random() * 200,
            AD_HOC_ORIGIN,
            { pool: !open },
          ),
        );
      }
    }
  }

  /** Sofia's work trips to Milan, when the hotel gym stands in for her own. */
  private travelling(a: Athlete, date: string) {
    return (
      a.p.username === "sofia" &&
      ((date >= "2026-02-10" && date <= "2026-02-13") ||
        (date >= "2026-06-02" && date <= "2026-06-04"))
    );
  }

  /** Dated moments: a meet, a race, travel, an edit, a discarded start. */
  private async specials(a: Athlete, date: string, start: Date) {
    const u = a.p.username;
    if (u === "kenji" && (date === "2026-01-10" || date === "2026-06-20")) {
      await this.adHoc(
        a,
        date,
        this.at(date, "09:30", a.p.timeZone),
        this.gymFor(a, date),
        "meet",
        ["low-bar-squat", "barbell-bench-press", "conventional-deadlift"],
      );
    }
    if (u === "liam" && date === "2026-03-22") {
      const race = this.at(date, "07:00", a.p.timeZone);
      this.clock.set(race);
      await this.as(a, (tx) => this.logActivity(tx, a, "running", race, 21_097.5, 312));
      this.count(a, "races");
    }
    if (this.travelling(a, date)) {
      await this.adHoc(
        a,
        date,
        this.at(date, "06:45", a.p.timeZone),
        a.gymIds.get("milan")!,
        "travel",
        [
          "flat-db-press",
          "single-arm-db-row",
          "goblet-squat",
          "cable-lateral-raise",
          "cable-triceps-pushdown",
        ],
      );
    }
    if (u === "aarav" && Number(date.slice(8)) === 3 && a.random() < 0.9) {
      // Starts, is called away before the first set, and discards the empty workout.
      const schedule = await this.as(a, (tx) => getSchedule(tx, a.userId));
      const ref = schedule ? this.nextTraining(schedule) : null;
      const day = ref ? schedule!.days.find((d) => d.dayIndex === ref.dayIndex) : null;
      if (schedule && ref && day?.includesLifting) {
        this.clock.set(start);
        await this.as(a, async (tx) => {
          const cycleIndex = pendingCycleForDay(schedule.state, ref.dayIndex, "session");
          if (cycleIndex === null) return;
          const { sessionId } = await startPlannedSession(tx, a.userId, {
            gymId: this.gymFor(a, date),
            programDayId: day.id,
            cycleIndex,
          });
          await discardSession(tx, a.userId, sessionId);
        });
        this.count(a, "discarded empty workouts");
      }
    }
    if (u === "aarav" && (date === "2026-03-18" || date === "2026-08-19")) {
      if (await this.trainSkipped(a, date, start)) return;
    }
    // Two days after a workout, a set is corrected and another deleted (ADR 0049).
    if ((u === "liam" || u === "meera") && isoWeekdayOf(date) === 3 && a.random() < 0.25)
      await this.editRecent(a, date, 2, true);
    // Eight days after: the edit is refused, as it should be.
    if (u === "kenji" && Number(date.slice(8)) === 15) await this.editRecent(a, date, 8, false);
  }

  private async editRecent(a: Athlete, date: string, daysAgo: number, allowed: boolean) {
    const target = addDays(date, -daysAgo);
    await this.as(a, async (tx) => {
      const sessions = await tx.query.workoutSessions.findMany({
        where: (session, { and: all, eq: is, isNotNull }) =>
          all(is(session.userId, a.userId), isNotNull(session.completedAt)),
        orderBy: (session, { desc }) => [desc(session.startedAt)],
        limit: 20,
      });
      const session = sessions.find((s) => todayInTimeZone(a.p.timeZone, s.startedAt) === target);
      if (!session) return;
      const detail = await getSessionDetail(tx, a.userId, session.id, {
        preferredUnit: a.p.unit,
        timeZone: a.p.timeZone,
      });
      const ex = detail?.exercises.find((e) =>
        e.sets.some((s) => s.setType !== "warmup" && s.reps !== null),
      );
      const set = ex?.sets.find((s) => s.setType !== "warmup" && s.reps !== null);
      if (!ex || !set) return;
      try {
        await saveSet(tx, a.userId, {
          workoutExerciseId: ex.id,
          setIndex: set.setIndex,
          setType: set.setType,
          unit: set.unit,
          weight: set.weight,
          reps: (set.reps ?? 0) + 1,
          rir: set.rir ?? 1,
          rpe: set.rpe,
          durationSeconds: set.durationSeconds,
          distanceMeters: set.distanceMeters,
          expectedCompletedAt: set.completedAt.toISOString(),
        });
        const last = [...ex.sets].sort((x, y) => y.setIndex - x.setIndex)[0]!;
        if (ex.sets.length > 2)
          await deleteSet(tx, a.userId, ex.id, last.setIndex, last.completedAt.toISOString());
        if (!allowed)
          this.note(
            a,
            "edit",
            `A workout ${daysAgo} days old took a correction; it should be read only.`,
          );
        else this.count(a, "finished workouts corrected");
      } catch (error) {
        if (allowed) throw error;
        this.count(a, "late edits refused");
      }
    });
  }

  private async openWorkoutNow(a: Athlete, date: string) {
    const start = new Date(
      Math.min(this.now.getTime() - 25 * 60_000, this.at(date, "10:30", a.p.timeZone).getTime()),
    );
    if (todayInTimeZone(a.p.timeZone, start) !== date) return;
    const schedule = await this.as(a, (tx) => getSchedule(tx, a.userId));
    const ref = schedule ? this.nextTraining(schedule) : null;
    const day = ref ? schedule!.days.find((d) => d.dayIndex === ref.dayIndex) : null;
    if (!schedule || !ref || !day?.includesLifting) return;
    this.clock.set(start);
    const sessionId = await this.as(a, async (tx) => {
      const cycleIndex = pendingCycleForDay(schedule.state, ref.dayIndex, "session")!;
      await completeRestSlotsBefore(
        tx,
        a.userId,
        schedule,
        { cycleIndex, dayIndex: ref.dayIndex },
        this.local(a),
      );
      const { sessionId } = await startPlannedSession(tx, a.userId, {
        gymId: this.gymFor(a, date),
        programDayId: day.id,
        cycleIndex,
      });
      await saveCheckIn(tx, a.userId, sessionId, this.checkIn(a));
      return sessionId;
    });
    const detail = await this.as(a, (tx) =>
      getSessionDetail(tx, a.userId, sessionId, {
        preferredUnit: a.p.unit,
        timeZone: a.p.timeZone,
      }),
    );
    let clock = start.getTime();
    const tick = (seconds: number) => {
      clock = Math.min(clock + seconds * 1000, this.now.getTime() - 60_000);
      this.clock.set(new Date(clock));
    };
    const ex = detail?.exercises.find((e) => !e.skippedAt);
    if (ex) await this.logExercise(a, ex, this.gymFor(a, date), true, ref.cycleIndex, tick);
    this.count(a, "open workout left for the audit");
  }

  // --- Food and people -------------------------------------------------------------------------

  private async food(a: Athlete, date: string) {
    const habit = a.p.food!;
    if (a.p.breaks.some((b) => date >= b.from && date <= b.to) && a.random() < 0.7) return;
    if (a.random() > habit.days) return;
    await this.as(a, async (tx) => {
      for (const food of habit.foods) {
        if (a.random() < 0.25) continue;
        const scale = 0.8 + a.random() * 0.4;
        // Pieces and servings are counted whole; weighed foods to the nearest ten grams.
        const amount =
          food.portionAmount === 1
            ? Math.max(1, Math.round(food.usual * scale))
            : Math.max(10, Math.round((food.usual * scale) / 10) * 10);
        const at = { eatenOn: date, meal: food.meal as Meal };
        const key = crypto.randomUUID();
        const known = a.foodIds.get(food.name);
        await submitFoodOnce(tx, a.userId, key, { at, food: food.name, amount }, async () => {
          const id = await logFood(tx, a.userId, at, {
            food: known ? { id: known } : stripHabit(food),
            amount,
          });
          if (!known) {
            const [entry] = await tx.query.foodEntries.findMany({
              where: (row, { eq: is }) => is(row.id, id),
            });
            if (entry?.foodId) a.foodIds.set(food.name, entry.foodId);
          }
        });
        this.count(a, "foods logged");
      }
      if (a.random() < 0.12) {
        await logQuickFood(
          tx,
          a.userId,
          { eatenOn: date, meal: "dinner" },
          {
            name: a.random() < 0.5 ? "Dinner out" : QUICK_ADD_NAME,
            portionAmount: 1,
            unit: "serving",
            kcal: 700 + Math.round(a.random() * 500),
            carbsG: null,
            fatG: null,
            proteinG: null,
          },
        );
        this.count(a, "quick adds");
      }
      if (!a.savedMealId && a.foodIds.size >= 2 && a.random() < 0.05) {
        const items = [...a.foodIds.values()].slice(0, 2).map((foodId) => ({ foodId, amount: 1 }));
        a.savedMealId = await saveLibraryMeal(tx, a.userId, { name: "Usual breakfast", items });
      }
      if (a.savedMealId && a.random() < 0.1) {
        await logSavedMeal(tx, a.userId, a.savedMealId, { eatenOn: date, meal: "breakfast" });
        this.count(a, "saved meals logged");
      }
    });
  }

  private async follow(from: string, to: string, outcome: "accept" | "decline" | "leave") {
    const follower = this.byName.get(from)!;
    const followee = this.byName.get(to)!;
    const status = await this.as(follower, (tx) =>
      requestFollow(tx, follower.userId, followee.userId),
    );
    if (status === "accepted" || outcome === "leave") return;
    if (outcome === "accept")
      await this.as(followee, (tx) => acceptFollow(tx, followee.userId, follower.userId));
    else await this.as(followee, (tx) => declineFollow(tx, followee.userId, follower.userId));
  }

  /** What Today's plan says at lunchtime, checked against what the schedule itself holds. */
  private async lookAtToday(a: Athlete, date: string) {
    const plan = await this.as(a, (tx) => getTodayPlan(tx, a.userId, a.p.timeZone));
    if (!plan) return;
    if (plan.today !== date)
      this.note(a, "today", `Today's plan is dated ${plan.today} at lunchtime on ${date}.`);
    if (plan.behind < 0) this.note(a, "today", `Behind by ${plan.behind}.`);
    if (plan.suggestion && plan.progress.completed > plan.progress.total)
      this.note(a, "today", `Progress ${plan.progress.completed}/${plan.progress.total}.`);
    if (plan.suggestion) {
      const { cycleIndex } = plan.suggestion.slot;
      if (cycleIndex > plan.program.weeks)
        this.note(
          a,
          "today",
          `Suggests cycle ${cycleIndex} of a ${plan.program.weeks}-cycle programme.`,
        );
    }
  }

  /** Totals the audit's report opens with. */
  summary() {
    return this.athletes.map((a) => ({
      username: a.p.username,
      name: a.p.name,
      level: a.p.level,
      unit: a.p.unit,
      timeZone: a.p.timeZone,
      programmes: a.p.blocks.slice(0, a.block + 1).map((block) => block.programme.name),
      stats: a.stats,
    }));
  }
}

function missReason(a: Athlete): string {
  const reasons = [
    "Work ran late",
    "Travel",
    "Slept badly",
    "Family plans",
    "Feeling run down",
    "Rain",
  ];
  return reasons[Math.floor(a.random() * reasons.length)]!;
}

function stripHabit(food: { usual: number; meal: string } & Parameters<typeof logQuickFood>[3]) {
  const { usual: _usual, meal: _meal, ...rest } = food;
  return rest;
}
