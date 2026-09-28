/**
 * The coached product, replayed day by day in-process, to find what the coach will be refused
 * before an athlete's morning finds it.
 *
 * Accounts are made the way the app makes them, train through the repository functions the app's
 * actions call, and are coached through `handleCoachServiceRequest` — the same HTTP surface the
 * nightly routine reaches with `workflow.ts`. One clock moves for all of it: PGlite reads the
 * process clock, so `now()` in SQL and `new Date()` in the app agree on which day it is.
 *
 * The coach here is not a model. It is a reference worker that does only what the skill tells
 * a worker to do, from what the context gives it: hold a target it has no evidence to move,
 * step a load the trend says is ready, go back where the trend says to, swap or drop what the
 * location cannot do. Anything the server refuses such a worker is either a rule the skill does
 * not state or a refusal no worker could answer — both are what this is for.
 */
import { and, eq, inArray } from "drizzle-orm";

import {
  equipmentInstances,
  equipmentTypes,
  plannedOccurrences,
  profiles,
  programDrafts,
  sessionPlans,
} from "@/db/schema";
import { STRENGTH_AESTHETICS_HYBRID_8WK } from "@/db/seed/data/program";
import { logTestRun } from "@/db/test/fixtures";
import type { TestDatabase } from "@/db/test/pglite";
import type { DbOrTx } from "@/db/types";
import { withUser } from "@/db/with-user";
import { AD_HOC_ORIGIN, plannedOrigin } from "@/domain/activity";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import { addDays, todayInTimeZone } from "@/domain/program-calendar";
import { assessProgramChange } from "@/domain/program-change";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { allSlots, isRestSlot, pendingParts, slotStatus } from "@/domain/schedule";
import { fromDateTimeLocal } from "@/lib/time";
import { handleCoachServiceRequest } from "@/server/coach-service";
import { ensureProfile } from "@/server/queries/profile";
import { recordBodyWeight } from "@/server/repositories/body-weight";
import { confirmIntake, saveIntake } from "@/server/repositories/coach-intakes";
import { saveCoachNotes, voidPlanForSlot } from "@/server/repositories/coach-plans";
import { requestGymChange, requestProgramCreation } from "@/server/repositories/coaching-jobs";
import { createGym } from "@/server/repositories/gyms";
import { skipOccurrence } from "@/server/repositories/occurrences";
import { releaseRequestsForDraft } from "@/server/repositories/coach-program-requests";
import { sourceRevision } from "@/server/repositories/coaching-state";
import {
  activateProgramDraft,
  closeProgramDraft,
  getProgramDraft,
  refreshProgramDraft,
} from "@/server/repositories/program-drafts";
import { readProgramBlueprint } from "@/server/repositories/programs";
import { createProgramFromBlueprint } from "@/server/repositories/programs";
import {
  completeRestSlotsBefore,
  getSchedule,
  pendingCycleForDay,
  recordSlotEvent,
} from "@/server/repositories/schedule";
import {
  finishSession,
  getSessionDetail,
  logSet,
  startPlannedSession,
  type SessionExercise,
} from "@/server/repositories/sessions";

import type { Location, Persona } from "./personas";

export type Clock = { set(at: Date): void };

/** One job the reference coach worked, and what came of it. */
export type JobRecord = {
  persona: string;
  day: number;
  date: string;
  kind: string;
  trigger: string;
  outcome: "accepted" | "not_accepted" | "refused" | "unclaimable" | "context_error" | "crashed";
  submissions: number;
  /** Every refusal's issues, in order. */
  refusals: string[][];
  contextBytes: number | null;
  contextMs: number | null;
  detail?: string;
  /** For a refused job: what was last sent, and what the context said of each exercise named. */
  sent?: unknown;
  named?: unknown;
};

/** Anything else that went wrong: the app refusing an athlete, a dispatch error, a crash. */
export type Finding = {
  persona: string;
  day: number;
  date: string;
  stage: string;
  message: string;
};

type Json = Record<string, unknown>;
type HttpResult = { status: number; body: Json };

/** The parts of a context the reference coach reads. Everything else it leaves alone. */
type LoggedSet = {
  setType: string;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
};
type Trend = {
  lineageId: string | null;
  slug: string;
  equipmentId: string | null;
  latestSets: LoggedSet[];
  loadReady: "spare" | "confirmed" | null;
  stepEvidenceIds: string[];
  evidenceIds: string[];
  revert: { load: number; loads: (number | null)[]; evidenceIds: string[] } | null;
};
type Slot = {
  slotId: string;
  lineageId: string | null;
  planned: { slug: string | null; name: string };
  prescription: {
    sets: number;
    type: "reps" | "duration" | "distance";
    reps: [number | null, number | null] | null;
    seconds: [number | null, number | null] | null;
    meters: [number | null, number | null] | null;
    rir: [number | null, number | null];
  } | null;
  atThisGym: {
    status: "direct" | "fallback" | "unknown" | "unavailable";
    exerciseSlug: string | null;
    machine: {
      id: string;
      steps: { from: number; harder: { load: number } | null }[];
    } | null;
  };
  weightStep: number | null;
  rule: { sets: LoggedSet[] } | null;
};
type Context = {
  job: { kind: string; target: Json & { occurrenceId?: string | null; gymId?: string | null } };
  equipmentGymId: string | null;
  memo: {
    memoryRevision?: number;
    notes: {
      pending: { id: string; text: string }[];
      training: { pending: { sourceId: string }[] };
    };
  };
  program: { blueprint: ProgramBlueprint } | null;
  occurrence: { id?: string; revisionId?: string; sport?: string } | null;
  nextSession: {
    reason: string | null;
    exercises?: Slot[];
    gym?: { kind: string };
    slot?: {
      programRunId: string | null;
      runTarget: {
        durationMinMinutes: number | null;
        durationMaxMinutes: number | null;
        rpeMin: number | null;
        rpeMax: number | null;
      } | null;
    };
  } | null;
  pendingComponents: string[] | null;
  trainingEvidence: { exerciseTrends: Trend[] };
  requestsToAddress: { items: { id: string; quote?: string }[] };
  pendingProposal: unknown;
};

const WORKING = new Set(["working", "amrap", "failure"]);

type SimAthlete = {
  persona: Persona;
  userId: string;
  gymId: string;
  otherGymId: string | null;
  intakeId: string | null;
  /** The day the coach is switched on; before it the athlete trains on the template alone. */
  coachFrom: number;
  /** What each exercise can really do, in kilograms: an estimated one-rep maximum. */
  strength: Map<string, number>;
  trainingDays: number;
  /** A workout started and not yet finished: the early bird's, while the routine runs. */
  open: string | null;
};

/** Start of the simulated calendar: a Monday, so the programme's days line up with weekdays. */
const DAY_ZERO = "2026-10-05";

export class CoachSimulation {
  readonly jobs: JobRecord[] = [];
  readonly findings: Finding[] = [];
  readonly samples = new Map<string, unknown>();
  /** What each night's dispatch said about each athlete, for reading a quiet account. */
  readonly dispatches: { day: number; persona: string; entry: unknown }[] = [];
  private readonly athletes: SimAthlete[] = [];
  private readonly byUser = new Map<string, SimAthlete>();
  private day = 0;

  constructor(
    private readonly t: TestDatabase,
    private readonly clock: Clock,
    private readonly token: string,
  ) {}

  private date(day: number) {
    return addDays(DAY_ZERO, day);
  }

  /** A local wall-clock time on simulated day `day`, as an instant. */
  private at(day: number, time: string, timeZone: string) {
    return fromDateTimeLocal(`${this.date(day)}T${time}`, timeZone)!;
  }

  private as<T>(a: SimAthlete, work: (tx: DbOrTx) => Promise<T>) {
    return withUser(this.t.db, a.userId, work);
  }

  private note(a: SimAthlete | null, stage: string, error: unknown) {
    this.findings.push({
      persona: a?.persona.name ?? "-",
      day: this.day,
      date: this.date(this.day),
      stage,
      message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    });
  }

  private async call(
    path: string[],
    init: { method?: string; body?: unknown; attempt?: string; query?: string } = {},
  ): Promise<HttpResult> {
    const query = [init.attempt ? `attemptId=${init.attempt}` : "", init.query ?? ""]
      .filter(Boolean)
      .join("&");
    const response = await handleCoachServiceRequest(
      this.t.db,
      new Request(
        `https://sim.test/api/coach/service/${path.join("/")}${query ? `?${query}` : ""}`,
        {
          method: init.method ?? "GET",
          headers: {
            authorization: `Bearer ${this.token}`,
            "content-type": "application/json",
          },
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        },
      ),
      path,
    );
    const text = await response.text();
    let body: Json;
    try {
      body = JSON.parse(text) as Json;
    } catch {
      body = { text };
    }
    return { status: response.status, body };
  }

  // --- Accounts -------------------------------------------------------------------------------

  /** Everything an athlete does before the first day: sign up, set up, and (maybe) train alone. */
  async enrol(persona: Persona) {
    const historyDays = (persona.historyWeeks ?? 0) * 7;
    const user = await this.t.createAuthUser(`${persona.name}-${crypto.randomUUID()}@sim.test`);
    const a: SimAthlete = {
      persona,
      userId: user.id,
      gymId: "",
      otherGymId: null,
      intakeId: null,
      coachFrom: 0,
      strength: new Map(),
      trainingDays: 0,
      open: null,
    };
    this.athletes.push(a);
    this.byUser.set(user.id, a);
    this.clock.set(this.at(-43, "09:00", "Asia/Kolkata"));
    await this.as(a, async (tx) => {
      await ensureProfile(tx, { id: user.id, email: user.email });
      await tx
        .update(profiles)
        .set({
          timeZone: persona.timeZone,
          preferredUnit: persona.unit,
          trainingGoal: "get_stronger",
        })
        .where(eq(profiles.id, user.id));
      await recordBodyWeight(tx, user.id, {
        measuredOn: this.date(-43),
        weightKg: persona.bodyWeightKg,
      });
      const gym = await createGym(tx, user.id, {
        name: persona.location === "home_dumbbells" ? "Home" : "Main gym",
        kind: persona.location === "home_dumbbells" ? "home" : "gym",
        address: null,
        notes: null,
      });
      a.gymId = gym.id;
      await this.equip(tx, a, gym.id, persona.location);
      if (persona.gymChanges?.length) {
        const other = await createGym(tx, user.id, {
          name: "Second gym",
          kind: "gym",
          address: null,
          notes: null,
        });
        a.otherGymId = other.id;
        await this.equip(tx, a, other.id, "starter_gym");
      }
    });
    if (historyDays > 0) {
      // Straight onto the template, no coach: the owner's own account, before it had one.
      await this.as(a, (tx) =>
        // The whole eight-week template, so weeks remain once the coach is switched on.
        createProgramFromBlueprint(
          tx,
          a.userId,
          { ...STRENGTH_AESTHETICS_HYBRID_8WK, slug: "template" },
          { startDate: this.date(-historyDays) },
        ),
      );
      a.coachFrom = 0;
    }
    return a;
  }

  private async equip(tx: DbOrTx, a: SimAthlete, gymId: string, location: Location) {
    if (location === "empty_gym") return;
    const types = await tx.select().from(equipmentTypes);
    const wanted =
      location === "home_dumbbells"
        ? types.filter((type) => ["dumbbells", "pull_up_bar", "bodyweight"].includes(type.slug))
        : types;
    const unit = a.persona.unit;
    await tx.insert(equipmentInstances).values(
      wanted.map((type) => {
        const known = location === "known_loads_gym" || location === "home_dumbbells";
        const increment =
          type.defaultResistanceMode === "selectorized"
            ? unit === "kg"
              ? 5
              : 10
            : type.slug === "dumbbells"
              ? unit === "kg"
                ? 2
                : 5
              : unit === "kg"
                ? 2.5
                : 5;
        const loads =
          known && type.defaultResistanceMode === "selectorized"
            ? Array.from({ length: 20 }, (_, i) => (i + 1) * increment)
            : known && type.slug === "dumbbells"
              ? Array.from({ length: 25 }, (_, i) => (i + 1) * increment)
              : [];
        return {
          userId: a.userId,
          gymId,
          equipmentTypeId: type.id,
          name: type.name,
          resistanceMode: type.defaultResistanceMode,
          unit: type.defaultUnit === "kg" ? unit : type.defaultUnit,
          loadIncrement: known ? increment : null,
          availableLoads: loads,
        };
      }),
    );
  }

  /** The athlete answers the coach's questions and asks for a programme. */
  private async switchCoachOn(a: SimAthlete) {
    const p = a.persona;
    await this.as(a, async (tx) => {
      const intake = await saveIntake(
        tx,
        a.userId,
        coachIntakeSchema.parse({
          goal: "Get stronger and keep two easy runs a week",
          sessionsPerWeek: 6,
          minutesPerSession: 60,
          runsPerWeek: 2,
          trainingLocation: p.location === "home_dumbbells" ? "home" : "gym",
          heightCm: 176,
          weightKg: p.bodyWeightKg,
          ageYears: 30,
          gymId: a.gymId,
          prompt: `Simulated athlete: ${p.name}.`,
        }),
        null,
      );
      await confirmIntake(tx, a.userId, intake.id);
      a.intakeId = intake.id;
    });
    if ((p.historyWeeks ?? 0) > 0) return;
    // A new athlete asks for a programme; the app fires the routine for it at once.
    const job = await this.as(a, (tx) =>
      requestProgramCreation(tx, a.userId, a.intakeId!, crypto.randomUUID()),
    );
    await this.work(a.userId, job.job.id, "create_program", "onboarding");
    const [draft] = await this.as(a, (tx) =>
      tx.select().from(programDrafts).where(eq(programDrafts.userId, a.userId)),
    );
    if (!draft) {
      this.note(a, "onboarding", "No programme draft to activate.");
      return;
    }
    const current = await this.as(a, (tx) => getProgramDraft(tx, a.userId, draft.id));
    await this.as(a, (tx) =>
      activateProgramDraft(tx, a.userId, draft.id, {
        expectedRevision: current!.revision,
        startDate: this.date(this.day + 1),
        transition: "new_block",
      }),
    ).catch((error) => this.note(a, "activate draft", error));
  }

  // --- The run --------------------------------------------------------------------------------

  /** Replays `days` days for every enrolled athlete, in the order they happen. */
  async run(days: number) {
    const first = this.firstDay();
    for (let day = first; day < days; day++) {
      this.day = day;
      const events: { at: Date; what: string; a: SimAthlete | null; run(): Promise<unknown> }[] =
        [];
      // The nightly routine: 04:05 in India, the boundary every account is dispatched on.
      if (day >= 0)
        events.push({
          at: this.at(day, "04:05", "Asia/Kolkata"),
          what: "routine",
          a: null,
          run: () => this.routine(),
        });
      // The coach is switched on the evening before its first night.
      if (day === -1)
        for (const a of this.athletes)
          events.push({
            at: this.at(day, "21:00", "Asia/Kolkata"),
            what: "switch coach on",
            a,
            run: () => this.switchCoachOn(a),
          });
      // Each athlete trains at five in their own evening: before the next Indian 04:00 whatever
      // the time zone, so the clock only ever moves forward.
      for (const a of this.athletes) {
        events.push({
          at: a.persona.earlyBird
            ? this.at(day, "03:55", "Asia/Kolkata")
            : this.at(day, "17:00", a.persona.timeZone),
          what: "athlete day",
          a,
          run: () => this.athleteDay(a, day),
        });
        // The early bird's workout is still open when the routine runs; it ends at half five.
        if (a.persona.earlyBird)
          events.push({
            at: this.at(day, "05:30", "Asia/Kolkata"),
            what: "finish workout",
            a,
            run: () => this.finishOpen(a),
          });
      }
      events.sort((x, y) => x.at.getTime() - y.at.getTime());
      for (const event of events) {
        this.clock.set(event.at);
        await event.run().catch((error) => this.note(event.a, event.what, error));
      }
    }
  }

  /** The first simulated day: the start of the longest history before the coach. */
  firstDay() {
    return -Math.max(1, ...this.athletes.map((a) => (a.persona.historyWeeks ?? 0) * 7 + 1));
  }

  /** What the routine does with no payload: drain dispatch, then work the queue until it stops. */
  private async routine() {
    let after: string | null = null;
    let pages = 0;
    do {
      const page = await this.call(["workflow", "dispatch"], { method: "POST", body: { after } });
      if (page.status !== 200) {
        this.note(null, "dispatch", `${page.status} ${JSON.stringify(page.body).slice(0, 400)}`);
        return;
      }
      for (const error of (page.body.errors as unknown[]) ?? [])
        this.note(null, "dispatch", JSON.stringify(error).slice(0, 400));
      for (const entry of (page.body.results as { userId?: string }[] | undefined) ??
        (page.body.jobs as { userId?: string }[] | undefined) ??
        [])
        this.dispatches.push({
          day: this.day,
          persona: this.byUser.get(entry.userId ?? "")?.persona.name ?? "-",
          entry,
        });
      after = (page.body.nextCursor as string | null) ?? null;
    } while (after && ++pages < 50);
    for (let pass = 0; pass < 8; pass++) {
      const queue = await this.call(["workflow", "queue"]);
      const jobs = (queue.body.jobs as { id: string; userId: string; kind: string }[]) ?? [];
      if (jobs.length === 0) return;
      let progress = false;
      for (const job of jobs)
        progress = (await this.work(job.userId, job.id, job.kind, "queue")) || progress;
      if (!progress) return;
    }
  }

  // --- The reference coach --------------------------------------------------------------------

  /** Claim, read, compute, submit and correct, exactly as the skill says. */
  private async work(userId: string, jobId: string, kind: string, trigger: string) {
    const a = this.byUser.get(userId)!;
    const record: JobRecord = {
      persona: a.persona.name,
      day: this.day,
      date: this.date(this.day),
      kind,
      trigger,
      outcome: "unclaimable",
      submissions: 0,
      refusals: [],
      contextBytes: null,
      contextMs: null,
    };
    this.jobs.push(record);
    const root = ["workflow", "users", userId, "jobs", jobId];
    try {
      const claim = await this.call([...root, "claim"], { method: "POST" });
      const job = claim.body.job as { attemptId: string; target: Json } | null;
      if (claim.status !== 200 || !job) {
        record.detail = claim.status === 200 ? "not claimable" : JSON.stringify(claim.body);
        return false;
      }
      const attempt = job.attemptId;
      const started = performance.now();
      const read = await this.call([...root, "context"], { attempt });
      record.contextMs = Math.round(performance.now() - started);
      record.contextBytes = JSON.stringify(read.body).length;
      if (read.status !== 200) {
        record.outcome = "context_error";
        record.detail = `${read.status} ${JSON.stringify(read.body).slice(0, 600)}`;
        await this.call([...root, "fail"], {
          method: "POST",
          attempt,
          body: { error: "Context unreadable.", retryable: true },
        });
        return true;
      }
      const context = read.body as unknown as Context;
      const sampleKey = `${kind}${context.job.target.occurrenceId ? ":endurance" : ""}`;
      if (!this.samples.has(sampleKey)) this.samples.set(sampleKey, read.body);
      // And the largest of each kind, which is the one a model is slowest to read.
      const largest = this.samples.get(`${sampleKey}:largest`);
      if (!largest || JSON.stringify(largest).length < record.contextBytes)
        this.samples.set(`${sampleKey}:largest`, read.body);
      let plan = await this.compose(a, context, root, attempt);
      for (;;) {
        record.submissions++;
        const sent = await this.call([...root, "result"], {
          method: "POST",
          attempt,
          body: plan.result,
        });
        if (sent.status === 200) {
          record.outcome = sent.body.accepted ? "accepted" : "not_accepted";
          if (!sent.body.accepted) record.detail = JSON.stringify(sent.body).slice(0, 400);
          return true;
        }
        record.refusals.push(issuesOf(sent));
        record.sent = plan.result;
        record.named = explain(context, issuesOf(sent));
        // The skill's budget: a first submission and two corrections.
        const corrected =
          sent.status === 422 && record.submissions < 3 ? plan.correct(issuesOf(sent)) : null;
        if (!corrected) break;
        plan = corrected;
      }
      record.outcome = "refused";
      await this.call([...root, "fail"], {
        method: "POST",
        attempt,
        body: { error: record.refusals.at(-1)!.join(" ").slice(0, 500), retryable: true },
      });
      return true;
    } catch (error) {
      record.outcome = "crashed";
      record.detail = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
      return false;
    }
  }

  private async compose(a: SimAthlete, context: Context, root: string[], attempt: string) {
    const kind = context.job.kind;
    if (kind === "create_program") return this.program(context, root, attempt);
    if (kind === "review_program") return fixed(await this.review(context, root, attempt));
    if (context.job.target.occurrenceId) return fixed(endurance(context));
    return session(context, a.persona.coach);
  }

  /** A review: hold, and answer every ask — proposing the exercise asked for, where it exists. */
  private async review(context: Context, root: string[], attempt: string): Promise<Json> {
    const plan = context.program?.blueprint;
    const sports = ["strength"];
    if (plan?.runs?.length || plan?.days.some((d) => d.includesRun)) sports.push("running");
    const opened = asks(context);
    const items = [
      ...context.requestsToAddress.items.map((item) => ({ id: item.id, quote: item.quote ?? "" })),
      ...opened.map((ask) => ({ id: ask.id, quote: ask.quote })),
    ];
    let revised: ProgramBlueprint | null = null;
    const decisions: Json[] = [];
    for (const item of items) {
      if (/curl/i.test(item.quote) && plan && !context.pendingProposal && !revised) {
        const found = await this.call([...root, "exercises"], {
          attempt,
          query: new URLSearchParams({
            q: item.quote.replace(/^can we add /i, ""),
            gymId: context.equipmentGymId ?? "",
            available: "true",
            limit: "5",
          }).toString(),
        });
        const pick = (
          (found.body.items as { slug: string; defaultPrescriptionType: string }[]) ?? []
        ).find((entry) => entry.defaultPrescriptionType === "reps");
        if (pick) {
          revised = structuredClone(plan);
          const day = revised.days.filter((d) => d.includesLifting).at(-1)!;
          const { lineageId: _lineage, ...template } = day.exercises.at(
            -1,
          )! as (typeof day.exercises)[number] & {
            lineageId?: string;
          };
          day.exercises.push({
            ...template,
            exerciseSlug: pick.slug,
            sets: 3,
            reps: [10, 15],
            rir: [1, 2],
            fallbacks: [],
          });
          decisions.push({
            requestId: item.id,
            state: "proposed",
            detail: `Adds ${pick.slug} to ${day.name}.`,
            changeRefs: [`add:${day.dayIndex}:${day.exercises.length}:${pick.slug}`],
          });
          continue;
        }
      }
      decisions.push({
        requestId: item.id,
        state: "needs_answer",
        detail: "Which days would you like this on, and how much time can it take?",
      });
    }
    const common = {
      rationale: "Holding what the evidence cannot move yet, and answering what was asked.",
      coverage: sports.map((sport) =>
        revised && sport === "strength"
          ? { sport, decision: "changed", reason: "Adds the exercise asked for." }
          : {
              sport,
              decision: "hold",
              reason: "Not enough comparable sessions to change anything yet.",
            },
      ),
      evidence: [],
      memory: memoryPatch(context, opened),
      requests: requestPatch(opened, decisions),
    };
    return revised
      ? {
          outcome: "program",
          headline: "Adds the curl you asked for to your last upper day.",
          blueprint: revised,
          openingPlan: null,
          ...common,
        }
      : { outcome: "no_change", ...common };
  }

  private async program(context: Context, root: string[], attempt: string) {
    const plan = blueprint();
    const gymId = (context.job.target.gymId as string | null) ?? context.equipmentGymId;
    type Item = {
      slug: string;
      available: boolean;
      machine: { id: string } | null;
      movementPattern: string | null;
      defaultPrescriptionType: string;
    };
    const lookup = async (params: Record<string, string>) => {
      const found = await this.call([...root, "exercises"], {
        attempt,
        query: new URLSearchParams({ gymId: gymId ?? "", limit: "50", ...params }).toString(),
      });
      return (found.body.items as Item[]) ?? [];
    };
    const known = new Map<string, Item | undefined>();
    const find = async (slug: string) => {
      if (!known.has(slug))
        known.set(
          slug,
          (await lookup({ q: slug.replace(/-/g, " ") })).find((item) => item.slug === slug),
        );
      return known.get(slug);
    };
    // What the location cannot do is swapped for the closest thing it can, by movement pattern
    // and measurement, as a coach searching the library would; nothing left, and it goes.
    for (const day of plan.days) {
      const kept: typeof day.exercises = [];
      for (const exercise of day.exercises) {
        const item = await find(exercise.exerciseSlug);
        if (item?.available) {
          kept.push(exercise);
          continue;
        }
        const alternatives = [
          ...(item?.movementPattern
            ? await lookup({ pattern: item.movementPattern, available: "true" })
            : []),
          ...(await lookup({ available: "true", limit: "100" })),
        ];
        const swap = alternatives.find(
          (alt) =>
            alt.defaultPrescriptionType === item?.defaultPrescriptionType &&
            !day.exercises.some((other) => other.exerciseSlug === alt.slug) &&
            !kept.some((other) => other.exerciseSlug === alt.slug),
        );
        if (swap) {
          known.set(swap.slug, swap);
          kept.push({ ...exercise, exerciseSlug: swap.slug });
        }
      }
      day.exercises = kept;
    }
    const first = [...plan.days]
      .sort((x, y) => x.dayIndex - y.dayIndex)
      .find((d) => d.includesLifting || d.includesRun)!;
    const exercises = [];
    for (const [index, slot] of first.exercises.entries()) {
      const item = await find(slot.exerciseSlug);
      exercises.push({
        orderIndex: index + 1,
        action: "keep",
        exerciseSlug: slot.exerciseSlug,
        equipmentInstanceId: item?.machine?.id ?? null,
        note: "Choose a load that leaves the target reps in reserve.",
        sets: [],
      });
    }
    return fixed({
      outcome: "program",
      headline: "A six-day strength block with two easy runs, built around your confirmed time.",
      blueprint: plan,
      openingPlan: {
        dayIndex: first.dayIndex,
        gymId,
        summary: "Find comfortable working loads on the first day.",
        exercises,
        run: first.includesRun ? { mode: "outdoor", durationMinutes: 25, rpe: 2 } : null,
      },
      rationale: "The confirmed frequency, location and goal.",
      evidence: [],
      uncertainties: ["No training history yet: starting loads are the athlete's to find."],
    });
  }

  // --- The athlete ----------------------------------------------------------------------------

  private async athleteDay(a: SimAthlete, day: number) {
    const p = a.persona;
    const coached = day >= a.coachFrom && a.intakeId !== null;
    if (!coached && (day < -(p.historyWeeks ?? 0) * 7 || !p.historyWeeks)) return;
    if (p.away && day >= p.away[0] && day <= p.away[1]) return;
    if (coached) await this.answerProposals(a).catch((error) => this.note(a, "proposal", error));
    let gymId = a.gymId;
    if (coached && p.gymChanges?.includes(day) && a.otherGymId) {
      // At the other gym before starting: the app fires the routine for this one athlete.
      gymId = a.otherGymId;
      const requested = await this.as(a, (tx) =>
        requestGymChange(tx, a.userId, a.otherGymId!, "Training at the other gym today."),
      ).catch((error) => {
        this.note(a, "gym change", error);
        return null;
      });
      const job = requested as { job?: { id: string } } | null;
      if (job?.job?.id) await this.work(a.userId, job.job.id, "prepare_session", "gym");
    }
    for (const note of p.notes ?? [])
      if (coached && note.day === day)
        await this.as(a, (tx) => saveCoachNotes(tx, a.userId, note.text)).catch((error) =>
          this.note(a, "note", error),
        );
    const sessions = p.catchUp?.includes(day) ? 3 : 1;
    for (let n = 0; n < sessions; n++) await this.trainNext(a, day, gymId);
  }

  /** The next thing the programme has: a rest day marked, a skip, or the day trained. */
  private async trainNext(a: SimAthlete, day: number, gymId: string) {
    const p = a.persona;
    const today = this.date(day);
    const schedule = await this.as(a, (tx) => getSchedule(tx, a.userId));
    if (!schedule) return;
    const ref = allSlots(schedule.state).find(
      (slot) => slotStatus(schedule.state, slot) === "pending",
    );
    if (!ref) return;
    const slot = schedule.state.slots.find((s) => s.dayIndex === ref.dayIndex)!;
    const programDay = schedule.days.find((d) => d.dayIndex === ref.dayIndex)!;
    if (isRestSlot(slot)) {
      await this.as(a, async (tx) => {
        await recordSlotEvent(tx, a.userId, schedule.program.id, ref, "session", "completed", {
          occurredOn: today,
          note: "Rest day done",
        });
        await voidPlanForSlot(tx, a.userId, schedule.program.id, ref);
      });
      return;
    }
    a.trainingDays++;
    if (p.skipEvery && a.trainingDays % p.skipEvery === 0) {
      await this.as(a, async (tx) => {
        for (const part of pendingParts(schedule.state, ref))
          await recordSlotEvent(tx, a.userId, schedule.program.id, ref, part, "skipped", {
            occurredOn: today,
            note: "Busy day.",
          });
        await voidPlanForSlot(tx, a.userId, schedule.program.id, ref);
      }).catch((error) => this.note(a, "skip", error));
      return;
    }
    const parts = pendingParts(schedule.state, ref);
    if (programDay.includesLifting && parts.includes("session"))
      await this.lift(a, gymId, programDay.id, ref.dayIndex).catch((error) =>
        this.note(a, "workout", error),
      );
    if (programDay.includesRun && parts.includes("run"))
      await this.runToday(a, ref).catch((error) => this.note(a, "run", error));
  }

  /** The athlete's answer to a waiting programme change: "Approve", as the app's one tap, or no. */
  private async answerProposals(a: SimAthlete) {
    await this.as(a, async (tx) => {
      const waiting = await tx
        .select()
        .from(programDrafts)
        .where(
          and(
            eq(programDrafts.userId, a.userId),
            eq(programDrafts.source, "weekly"),
            inArray(programDrafts.status, ["editing", "ready"]),
          ),
        );
      for (const found of waiting) {
        if (a.persona.declines) {
          await closeProgramDraft(tx, a.userId, found.id, "declined");
          await releaseRequestsForDraft(tx, a.userId, found.id, "declined", "");
          continue;
        }
        let draft = found;
        if (
          draft.status === "editing" ||
          draft.sourceRevision !== (await sourceRevision(tx, a.userId))
        )
          draft = await refreshProgramDraft(tx, a.userId, draft.id, draft.revision);
        const current = draft.baseProgramId
          ? await readProgramBlueprint(tx, a.userId, draft.baseProgramId)
          : null;
        const transition =
          current &&
          assessProgramChange(current.blueprint, draft.blueprint, []).structuralChanges.length === 0
            ? "continue"
            : "new_block";
        await activateProgramDraft(tx, a.userId, draft.id, {
          expectedRevision: draft.revision,
          startDate: todayInTimeZone(a.persona.timeZone),
          transition,
        });
      }
    });
  }

  private async lift(a: SimAthlete, gymId: string, programDayId: string, dayIndex: number) {
    const p = a.persona;
    const today = todayInTimeZone(p.timeZone);
    await this.as(a, async (tx) => {
      const schedule = (await getSchedule(tx, a.userId))!;
      const cycleIndex = pendingCycleForDay(schedule.state, dayIndex, "session");
      if (cycleIndex === null) return;
      await completeRestSlotsBefore(tx, a.userId, schedule, { cycleIndex, dayIndex }, today);
      const { sessionId } = await startPlannedSession(tx, a.userId, {
        gymId,
        programDayId,
        cycleIndex,
      });
      const detail = await getSessionDetail(tx, a.userId, sessionId, {});
      if (!detail) throw new Error("The workout just started cannot be read back.");
      const [plan] = await tx
        .select()
        .from(sessionPlans)
        .where(
          and(eq(sessionPlans.userId, a.userId), eq(sessionPlans.workoutSessionId, sessionId)),
        );
      const exercises = detail.exercises.filter((ex) => !ex.skippedAt);
      for (const [order, ex] of exercises.entries()) {
        const planned = plan?.exercises.find(
          (entry) =>
            entry.slotId === ex.planned?.programExerciseId ||
            (entry.slotId === null && entry.exerciseId === ex.exercise.id),
        );
        const targets = this.targets(ex, planned?.sets ?? null);
        const last = order === exercises.length - 1;
        const count = Math.max(
          1,
          targets.length + (p.extraSet ? 1 : 0) - (p.dropLastSet && last ? 1 : 0),
        );
        let index = 1;
        if (order === 0 && p.rampAsWorking && targets[0]?.weight) {
          for (const share of [0.5, 0.7]) {
            await logSet(tx, a.userId, {
              workoutExerciseId: ex.id,
              setIndex: index++,
              setType: "working",
              weight: roundTo(targets[0].weight * share, ex.weightStep || 2.5),
              unit: ex.equipment?.unit ?? p.unit,
              reps: 5,
              rir: 5,
              durationSeconds: null,
            });
          }
        }
        for (let i = 0; i < count; i++) {
          const target = targets[Math.min(i, targets.length - 1)]!;
          const done = this.perform(a, ex, target, i);
          await logSet(tx, a.userId, {
            workoutExerciseId: ex.id,
            setIndex: index++,
            setType: "working",
            unit: ex.equipment?.unit ?? p.unit,
            ...done,
          });
        }
      }
      if (p.earlyBird) a.open = sessionId;
      else await this.finish(tx, a, sessionId);
    });
  }

  /** Finishing, as the app's finish action does: the workout, then the slot it answered. */
  private async finish(tx: DbOrTx, a: SimAthlete, sessionId: string) {
    const finished = await finishSession(tx, a.userId, sessionId, {
      notes: null,
      bodyWeightKg: null,
    });
    if (finished.programId && finished.dayIndex !== null && finished.cycleIndex !== null)
      await recordSlotEvent(
        tx,
        a.userId,
        finished.programId,
        { cycleIndex: finished.cycleIndex, dayIndex: finished.dayIndex },
        "session",
        "completed",
        {
          occurredOn: todayInTimeZone(a.persona.timeZone, finished.startedAt),
          workoutSessionId: sessionId,
        },
      );
  }

  private async finishOpen(a: SimAthlete) {
    const open = a.open;
    if (!open) return;
    a.open = null;
    await this.as(a, (tx) => this.finish(tx, a, open));
  }

  /** What the athlete is asked for: the coach's rows, else the rule's, else the programme's. */
  private targets(
    ex: SessionExercise,
    planned: readonly LoggedSetInput[] | null,
  ): LoggedSetInput[] {
    const working = (sets: readonly LoggedSetInput[]) =>
      sets.filter((set) => set.setType === undefined || WORKING.has(set.setType));
    if (planned && working(planned).length) return working(planned);
    const rule = ex.suggestion?.sets as LoggedSetInput[] | undefined;
    if (rule && working(rule).length) return working(rule);
    const p = ex.planned;
    const type = p?.prescriptionType ?? ex.exercise.defaultPrescriptionType;
    return Array.from({ length: p?.sets ?? 3 }, () => ({
      setType: "working",
      weight: null,
      reps: type === "reps" ? (p?.repMin ?? 8) : null,
      rir: type === "reps" ? (p?.rirMin ?? 2) : null,
      durationSeconds: type === "duration" ? (p?.durationMinSeconds ?? 30) : null,
      distanceMeters: type === "distance" ? (p?.distanceMinMeters ?? 20) : null,
    }));
  }

  /** One set, as this athlete really does it. */
  private perform(a: SimAthlete, ex: SessionExercise, target: LoggedSetInput, index: number) {
    const p = a.persona;
    const unit = ex.equipment?.unit ?? p.unit;
    const toKg = (value: number) => (unit === "lb" ? value / 2.20462 : value);
    const fromKg = (value: number) => (unit === "lb" ? value * 2.20462 : value);
    const step = ex.weightStep || (unit === "lb" ? 5 : 2.5);
    const type = ex.planned?.prescriptionType ?? ex.exercise.defaultPrescriptionType;
    const rirWanted = target.rir ?? ex.planned?.rirMin ?? 2;
    const logRir =
      p.rir === "always" ? true : p.rir === "never" ? false : (index + a.trainingDays) % 2 === 0;
    if (type !== "reps")
      return {
        weight: target.weight ?? null,
        reps: null,
        rir: null,
        rpe: logRir ? 7 : null,
        durationSeconds: type === "duration" ? (target.durationSeconds ?? 30) : null,
        distanceMeters: type === "distance" ? (target.distanceMeters ?? 20) : null,
      };
    const bodyweight = !ex.exercise.requiresEquipment || ex.exercise.modality === "bodyweight";
    const max = this.maximum(a, ex);
    // The load: what the plan says, else one the athlete picks for the reps they were asked for.
    const wanted = target.reps ?? ex.planned?.repMin ?? 8;
    let load =
      target.weight ??
      (bodyweight ? 0 : roundTo(fromKg(max / (1 + (wanted + rirWanted) / 30)), step));
    if (!bodyweight && load <= 0) load = step;
    const external = toKg(load);
    // Reps to failure at that load, a little less on every later set.
    const capacity = bodyweight
      ? Math.max(1, Math.round(12 + (max - 40) / 5) - index)
      : Math.max(0, Math.floor(30 * (max / Math.max(external, 1) - 1)) - index);
    const reps = p.chasesReps
      ? Math.max(1, capacity - rirWanted)
      : Math.max(Math.min(wanted, capacity), Math.min(capacity, 1));
    const rir = Math.max(0, Math.min(5, capacity - reps));
    // Training moves the maximum a little, more for a novice.
    a.strength.set(ex.exercise.slug, max * (p.level === "novice" ? 1.006 : 1.002));
    const forget = p.forgetLoad && ((index * 7 + a.trainingDays * 3) % 10) / 10 < p.forgetLoad;
    return {
      weight: forget ? null : load,
      reps,
      rir: logRir ? rir : null,
      durationSeconds: null,
    };
  }

  private maximum(a: SimAthlete, ex: SessionExercise) {
    const known = a.strength.get(ex.exercise.slug);
    if (known) return known;
    const scale = a.persona.level === "novice" ? 1 : 1.5;
    const byModality: Record<string, number> = {
      barbell: 70,
      dumbbell: 18,
      machine: 55,
      cable: 35,
      smith_machine: 60,
      bodyweight: 45,
    };
    const start = (byModality[ex.exercise.modality] ?? 40) * scale;
    a.strength.set(ex.exercise.slug, start);
    return start;
  }

  private async runToday(a: SimAthlete, ref: { cycleIndex: number; dayIndex: number }) {
    const p = a.persona;
    const today = todayInTimeZone(p.timeZone);
    await this.as(a, async (tx) => {
      const schedule = (await getSchedule(tx, a.userId))!;
      const [occurrence] = await tx
        .select()
        .from(plannedOccurrences)
        .where(
          and(
            eq(plannedOccurrences.userId, a.userId),
            eq(plannedOccurrences.sport, "running"),
            eq(plannedOccurrences.cycleIndex, ref.cycleIndex),
            eq(plannedOccurrences.cycleDayIndex, ref.dayIndex),
            eq(plannedOccurrences.disposition, "pending"),
          ),
        );
      if (p.runs === "skipped") {
        if (occurrence) await skipOccurrence(tx, a.userId, occurrence.id, "No time.");
        else
          await recordSlotEvent(tx, a.userId, schedule.program.id, ref, "run", "skipped", {
            occurredOn: today,
          });
        return;
      }
      const run = await logTestRun(tx, a.userId, {
        startedAt: new Date(),
        // Longer than the programme asks some days, and never a whole number of minutes.
        durationSeconds: (21 + (a.trainingDays % 9)) * 60 + 40,
        distanceMeters: 3000 + (a.trainingDays % 5) * 400,
        timeZone: p.timeZone,
        rpe: p.runs === "no_effort" ? null : 2,
        effortReported: p.runs !== "no_effort",
        origin: occurrence?.currentRevisionId
          ? plannedOrigin(occurrence.id, occurrence.currentRevisionId)
          : AD_HOC_ORIGIN,
      });
      if (!occurrence)
        await recordSlotEvent(tx, a.userId, schedule.program.id, ref, "run", "completed", {
          occurredOn: today,
          runId: run.id,
        });
    });
  }
}

// --- The reference coach's results -------------------------------------------------------------

type LoggedSetInput = {
  setType?: string;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  rpe?: number | null;
  durationSeconds: number | null;
  distanceMeters?: number | null;
};

type Plan = { result: Json; correct(issues: string[]): Plan | null };

const fixed = (result: Json): Plan => ({ result, correct: () => null });

function blueprint(): ProgramBlueprint {
  const weeks = 6;
  return {
    ...STRENGTH_AESTHETICS_HYBRID_8WK,
    slug: "sim-hybrid",
    name: "Simulated hybrid",
    weeks,
    runs: STRENGTH_AESTHETICS_HYBRID_8WK.runs.filter((run) => run.weekIndex <= weeks),
  };
}

/** The context's slot and trend for every exercise a refusal names, for whoever reads the report. */
function explain(context: Context, issues: string[]) {
  const named = new Set(issues.map((issue) => issue.split(":")[0]!.trim()));
  return (context.nextSession?.exercises ?? [])
    .filter(
      (slot) => named.has(slot.planned.slug ?? "") || named.has(slot.atThisGym.exerciseSlug ?? ""),
    )
    .map((slot) => ({
      slot: { ...slot, rule: slot.rule },
      trends: context.trainingEvidence.exerciseTrends
        .filter((trend) => trend.lineageId === slot.lineageId)
        .map((trend) => ({ ...trend, observations: undefined })),
    }));
}

function issuesOf(sent: HttpResult): string[] {
  const issues = sent.body.issues as unknown[] | undefined;
  if (issues?.length)
    return issues.map((issue) =>
      typeof issue === "string"
        ? issue
        : `${((issue as { path?: unknown[] }).path ?? []).join(".")}: ${(issue as { message?: string }).message}`,
    );
  return [String(sent.body.error ?? JSON.stringify(sent.body)).slice(0, 600)];
}

/**
 * The asks in the athlete's pending notes, as the skill tells a worker to open them: one item per
 * ask, quoting the athlete's exact words. Not on a job that is not the scheduled work.
 */
function asks(context: Context) {
  if (context.job.target.intentId) return [];
  return (context.memo.notes.pending ?? []).flatMap((note) =>
    /\b(add|can we|could we|more)\b/i.test(note.text)
      ? note.text
          .split(/, and |; /)
          .map((quote) => quote.trim())
          .filter(Boolean)
          .map((quote) => ({
            id: crypto.randomUUID(),
            sourceId: `note:${note.id}`,
            quote,
            summary: quote.slice(0, 200),
            note: note.id,
          }))
      : [],
  );
}

function memoryPatch(context: Context, opened: readonly { note: string }[] = []) {
  const pending = context.memo.notes.pending ?? [];
  const training = context.memo.notes.training?.pending ?? [];
  if (!pending.length && !training.length) return undefined;
  const asked = new Set(opened.map((ask) => ask.note));
  return {
    expectedRevision: context.memo.memoryRevision ?? 0,
    reviewedNotes: [
      ...pending.map((note) =>
        asked.has(note.id)
          ? {
              id: note.id,
              disposition: "queued_for_review",
              detail: "The programme review decides this.",
            }
          : { id: note.id, disposition: "no_action", detail: "Read; nothing to change yet." },
      ),
      ...training.map((note) => ({
        id: note.sourceId,
        disposition: "no_action",
        detail: "Read; nothing to change in this session.",
      })),
    ],
  };
}

const requestPatch = (opened: ReturnType<typeof asks>, decisions: Json[] = []) =>
  opened.length || decisions.length
    ? {
        open: opened.map((ask) => ({
          id: ask.id,
          sourceId: ask.sourceId,
          quote: ask.quote,
          summary: ask.summary,
        })),
        decisions,
      }
    : undefined;

function endurance(context: Context): Json {
  const target = context.job.target as {
    occurrenceId: string;
    occurrenceRevisionId: string;
    sport: string;
  };
  const opened = asks(context);
  return {
    outcome: "session",
    rationale: "The approved session, as approved.",
    evidence: [],
    memory: memoryPatch(context, opened),
    requests: requestPatch(opened),
    plan: {
      summary: "Easy and conversational.",
      exercises: [],
      run: null,
      endurance: [
        {
          occurrenceId: target.occurrenceId,
          occurrenceRevisionId: target.occurrenceRevisionId ?? context.occurrence?.revisionId,
          sport: target.sport ?? context.occurrence?.sport ?? "running",
          summary: "Easy and conversational.",
          prescription: null,
        },
      ],
    },
  };
}

const clamp = (value: number, range: [number | null, number | null] | null) =>
  Math.min(range?.[1] ?? Infinity, Math.max(range?.[0] ?? 0, value));

/** A strength session: every pending slot kept, swapped or dropped, and each set's target. */
function session(context: Context, strategy: Persona["coach"]): Plan {
  const slots = context.nextSession?.exercises ?? [];
  const home = context.nextSession?.gym?.kind === "home";
  let adjustment = "normal";
  const evidence = new Set<string>();
  /** What the server has named for an exercise, kept through every later correction. */
  type Pins = { field?: string; values?: string[]; loads?: number[] };
  type Entry = { slot: Slot; trend: Trend | undefined; entry: Json; hold: Json[]; pins?: Pins };
  const entries: Entry[] = slots.map((slot) => {
    const p = slot.prescription!;
    const status = slot.atThisGym.status;
    const machine = slot.atThisGym.machine?.id ?? null;
    if (status !== "direct" && !(status === "fallback" && slot.atThisGym.exerciseSlug)) {
      adjustment = "equipment";
      return {
        slot,
        trend: undefined,
        hold: [],
        entry: { slotId: slot.slotId, action: "drop", exerciseSlug: slot.planned.slug, sets: [] },
      };
    }
    const substitute = status === "fallback";
    if (substitute) adjustment = "equipment";
    const slug = substitute ? slot.atThisGym.exerciseSlug! : slot.planned.slug!;
    const trend = context.trainingEvidence.exerciseTrends.find(
      (t) => t.lineageId === slot.lineageId && t.slug === slug && t.equipmentId === machine,
    );
    const latest = (trend?.latestSets ?? []).filter((set) => WORKING.has(set.setType));
    const known = latest.find((set) => set.weight !== null)?.weight ?? null;
    const range = p.type === "reps" ? p.reps : p.type === "duration" ? p.seconds : p.meters;
    const hold = Array.from({ length: p.sets }, (_, i) => {
      const prior = latest[i];
      const value =
        p.type === "reps"
          ? prior?.reps
          : p.type === "duration"
            ? prior?.durationSeconds
            : prior?.distanceMeters;
      const rule = slot.rule?.sets.filter((set) => WORKING.has(set.setType))[i];
      const fallback =
        (p.type === "reps"
          ? rule?.reps
          : p.type === "duration"
            ? rule?.durationSeconds
            : rule?.distanceMeters) ??
        range?.[0] ??
        (p.type === "reps" ? 8 : 30);
      const target = clamp(value ?? fallback, range);
      return {
        setType: "working",
        weight: prior?.weight ?? known,
        reps: p.type === "reps" ? target : null,
        durationSeconds: p.type === "duration" ? target : null,
        distanceMeters: p.type === "distance" ? target : null,
        rir: p.type === "reps" ? (p.rir[0] ?? 2) : null,
        rpe: p.type === "reps" ? null : 7,
      };
    });
    let sets: Json[] = hold;
    if (strategy === "rule" && slot.rule?.sets.length) {
      sets = slot.rule.sets
        .filter((set) => WORKING.has(set.setType))
        .map((set) => ({
          setType: "working",
          weight: set.weight,
          reps: set.reps,
          durationSeconds: set.durationSeconds,
          distanceMeters: set.distanceMeters,
          rir: p.type === "reps" ? (set.rir ?? p.rir[0] ?? 2) : null,
          rpe: p.type === "reps" ? null : 7,
        }));
      for (const id of trend?.stepEvidenceIds ?? []) evidence.add(id);
      for (const id of trend?.revert?.evidenceIds ?? []) evidence.add(id);
    } else if (strategy === "progress" && trend && p.type === "reps") {
      if (trend.revert) {
        sets = hold.map((set, i) => ({
          ...set,
          weight: trend.revert!.loads[i] ?? trend.revert!.load,
          reps: range?.[0] ?? set.reps,
        }));
        for (const id of trend.revert.evidenceIds) evidence.add(id);
      } else if (trend.loadReady && known !== null && known > 0) {
        // One real step: what the machine shows, else the typed jump — never at home, where
        // only a load known to exist will do, and never onto a bodyweight movement.
        const shown = slot.atThisGym.machine?.steps.find((s) => Math.abs(s.from - known) < 0.01);
        const harder =
          shown?.harder?.load ?? (home ? null : slot.weightStep ? known + slot.weightStep : null);
        if (harder !== null && harder !== undefined) {
          sets = hold.map((set) => ({ ...set, weight: harder, reps: range?.[0] ?? set.reps }));
          for (const id of trend.stepEvidenceIds) evidence.add(id);
        }
      }
    }
    return {
      slot,
      trend,
      hold,
      entry: {
        slotId: slot.slotId,
        action: substitute ? "substitute" : "keep",
        exerciseSlug: slug,
        equipmentInstanceId: machine,
        note: "",
        sets,
      },
    };
  });
  const opened = asks(context);
  const target = context.nextSession?.slot?.runTarget ?? null;
  const firstRun = {
    mode: "outdoor",
    durationMinutes: target?.durationMaxMinutes ?? 25,
    distanceKm: null as number | null,
    rpe: target?.rpeMax ?? target?.rpeMin ?? 2,
    paceNote: "Conversational.",
    stopRule: "",
    note: "",
    programRunId: context.nextSession?.slot?.programRunId ?? null,
  };
  const build = (list: Entry[], extra: Set<string>, adjust: string, run: typeof firstRun): Plan => {
    const result: Json = {
      outcome: "session",
      rationale: "Holding what the evidence cannot move; stepping what it can.",
      evidence: [...extra],
      adjustment: adjust,
      memory: memoryPatch(context, opened),
      requests: requestPatch(opened),
      plan: {
        summary: "Today's session.",
        exercises: list.map((item) => item.entry),
        // The day's run goes with it while that half of the day is still to come.
        run: context.pendingComponents?.includes("run") ? run : null,
      },
    };
    return {
      result,
      correct(issues) {
        const next = list.map((item) => ({
          ...item,
          entry: { ...item.entry },
          pins: { ...item.pins } as Pins,
        }));
        const cite = new Set(extra);
        let adjustNext = adjust;
        let runNext = run;
        for (const issue of issues) {
          const held = /Unchanged, the run is (\d+) minutes(?: and ([\d.]+) km)?\.$/.exec(issue);
          if (held) {
            runNext = {
              ...runNext,
              durationMinutes: Number(held[1]),
              distanceKm: held[2] ? Number(held[2]) : null,
            };
            continue;
          }
          const slug = issue.split(":")[0]!.trim();
          const item = next.find((candidate) => candidate.entry.exerciseSlug === slug);
          const named =
            /Unchanged, its working (?:sets are|set is) (.+) (reps|seconds|metres)\.$/.exec(issue);
          const stands = /this change stands on (.+?); cite/.exec(issue);
          const loads = /Unchanged, its (?:loads are|load is) (.+) (?:kg|lb)\.$/.exec(issue);
          // What the server names is pinned, and applied after every other issue, so a hold
          // for the same exercise, now or in a later correction, cannot undo it.
          if (loads && item) {
            item.pins.loads = loads[1]!.split(/, | and /).map(Number);
            continue;
          }
          if (named && item) {
            item.pins.values = named[1]!.split(/, | and /);
            item.pins.field =
              named[2] === "reps"
                ? "reps"
                : named[2] === "seconds"
                  ? "durationSeconds"
                  : "distanceMeters";
          } else if (stands) {
            for (const id of stands[1]!.split(", ")) cite.add(id);
          } else if (
            item &&
            /not supported by repeated comparable performance|cite two new comparable training dates|exceeds the automatic limit|combined .*need review|targets outside the program range|home equipment is known to have|set-count changes|set change needs athlete review|logged with no added load/.test(
              issue,
            )
          ) {
            item.entry.sets = item.hold;
          } else if (item && /no comparable starting load/.test(issue)) {
            item.entry.sets = (item.entry.sets as Json[]).map((set) => ({ ...set, weight: null }));
          } else if (item && /retain the known load/.test(issue)) {
            item.entry.sets = item.hold;
            if (!(item.hold as Json[]).some((set) => set.weight !== null))
              adjustNext = "calibration";
          } else if (/Choose a compatible registered machine/.test(issue)) {
            const position = /exercises\.(\d+)/.exec(issue);
            const target = position ? next[Number(position[1])] : item;
            if (!target) return null;
            target.entry = {
              slotId: target.slot.slotId,
              action: "drop",
              exerciseSlug: target.slot.planned.slug,
              sets: [],
            };
            adjustNext = "equipment";
          } else return null;
        }
        for (const item of next) {
          const { loads, values, field } = item.pins;
          if (item.entry.action === "drop" || (!loads && !values)) continue;
          item.entry.sets = (item.entry.sets as Json[]).map((set, i) => ({
            ...set,
            ...(loads ? { weight: loads[i] ?? loads.at(-1) } : {}),
            ...(values && field && /^\d+(\.\d+)?$/.test(values[i] ?? "")
              ? { [field]: Number(values[i]) }
              : {}),
          }));
        }
        return build(next, cite, adjustNext, runNext);
      },
    };
  };
  return build(entries, evidence, adjustment, firstRun);
}

function roundTo(value: number, step: number) {
  return Math.max(step, Math.round(value / step) * step);
}
