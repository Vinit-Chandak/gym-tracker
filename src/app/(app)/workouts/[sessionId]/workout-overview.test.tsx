// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ExerciseVM, SessionVM, SetVM } from "./view-model";
import { draftsWarning, WorkoutOverview } from "./workout-overview";

/** The innermost element whose whole text is `text`: a fact's figures stand in spans of their own. */
const whole = (text: string) => (_: string, element: Element | null) =>
  element?.textContent === text &&
  ![...element.children].some((child) => child.textContent === text);

const actions = vi.hoisted(() => ({ warmup: vi.fn() }));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/sessions", () => ({ setWarmupCompletedAction: actions.warmup }));

const set = (setIndex: number, weight: number, reps: number): SetVM => ({
  id: `set-${setIndex}`,
  setIndex,
  setType: "working",
  weight,
  unit: "kg",
  reps,
  rir: 2,
  rpe: null,
  effortReported: true,
  durationSeconds: null,
  distanceMeters: null,
  completedAt: "2026-09-29T07:40:00.000Z",
});

function exercise(name: string, patch: Partial<ExerciseVM> = {}): ExerciseVM {
  const slug = name.toLowerCase().replace(/\W+/g, "-");
  return {
    id: slug,
    orderIndex: 1,
    exercise: {
      id: slug,
      name,
      slug,
      modality: "barbell",
      loadPortability: "global",
      requiresEquipment: true,
      defaultPrescriptionType: "reps",
      rirNote: null,
      defaults: {
        repMin: null,
        repMax: null,
        durationMinSeconds: null,
        durationMaxSeconds: null,
        distanceMinMeters: null,
        distanceMaxMeters: null,
        rir: null,
        restSeconds: null,
      },
    },
    equipment: null,
    planned: {
      programExerciseId: `${slug}-slot`,
      plannedExerciseName: name,
      sets: 4,
      prescriptionType: "reps",
      repMin: 3,
      repMax: 5,
      durationMinSeconds: null,
      durationMaxSeconds: null,
      distanceMinMeters: null,
      distanceMaxMeters: null,
      perSide: false,
      rirMin: 2,
      rirMax: 2,
      restMinSeconds: 180,
      restMaxSeconds: 240,
      targetLoadNote: null,
      progressionNotes: null,
      keyCue: null,
    },
    supersetGroup: null,
    substitutionReason: null,
    notes: null,
    completedAt: null,
    skippedAt: null,
    weightStep: 2.5,
    sets: [],
    previous: null,
    basis: null,
    suggestion: null,
    regressionStreak: 0,
    decision: null,
    coachNote: null,
    coachRestSeconds: null,
    coachPerSide: null,
    guidance: null,
    ...patch,
  };
}

// Upper A, cycle 3 (sessions.test.ts): the bench under way at 60 × 4, the rest to come.
const SESSION: SessionVM = {
  id: "00000000-0000-4000-8000-00000000c0de",
  gym: { id: "gym", name: "Anytime Fitness", kind: "gym" },
  day: { id: "day", name: "Upper A", focus: null, includesRun: false, timeNote: "70–90 min" },
  cycleIndex: 3,
  startedAt: "2026-09-29T07:30:00.000Z",
  completedAt: null,
  bodyWeightKg: null,
  sleepHours: 5,
  sleepQuality: null,
  energy: null,
  fatigue: null,
  soreness: null,
  warmupCompleted: false,
  notes: null,
  warmup: {
    name: "Upper-body warm-up",
    drills: [
      { order: 1, name: "Easy cardio", dose: "3–5 min", cue: "Easy", purpose: "Temperature" },
      {
        order: 2,
        name: "Arm circles + shoulder rotations",
        dose: "8 each",
        cue: "Pain-free",
        purpose: "Shoulder motion",
      },
    ],
  },
  restTimerEnabled: false,
  warnings: [
    {
      code: "short_sleep",
      title: "Sleep 5 h",
      advice: "Hold loads today rather than adding, and keep the RIR honest.",
    },
  ],
  coachPlan: null,
  timeZone: "UTC",
  preferredUnit: "kg",
  exercises: [
    exercise("Barbell bench press", { sets: [set(1, 60, 4), set(2, 60, 4)] }),
    exercise("Barbell curl", { completedAt: "2026-09-29T07:58:00.000Z" }),
    exercise("Cable crunch", {
      skippedAt: "2026-09-29T07:30:00.000Z",
      coachNote: "Back is sore today.",
    }),
    exercise("Face pull", {
      planned: null,
      coachNote: "Light, for the shoulders.",
      suggestion: {
        kind: "coach",
        basis: "exercise",
        reason: "The coach's plan for today.",
        advice: null,
        loadIncrement: 2.5,
        sets: [
          {
            setIndex: 1,
            setType: "working",
            weight: 15,
            reps: 15,
            rir: 2,
            durationSeconds: null,
            distanceMeters: null,
          },
        ],
      },
    }),
  ],
};

function show(patch: Partial<ComponentProps<typeof WorkoutOverview>> = {}) {
  const open = vi.fn();
  render(
    <WorkoutOverview
      session={SESSION}
      readOnly={false}
      onOpenExercise={open}
      onOpenDetails={() => {}}
      onEditSuperset={() => {}}
      title="Upper A"
      layer
      {...patch}
    />,
  );
  return { open };
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  actions.warmup.mockReset();
});
afterEach(cleanup);

it("is the session's layer: Minimise to Today, Finish and More", () => {
  show();
  expect(screen.getByRole("heading", { level: 1, name: "Upper A" })).toBeTruthy();
  // One heading for the one name: no second, hidden one beside it.
  expect(screen.getAllByRole("heading", { name: /Upper A/ })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Minimise the workout" }).getAttribute("href")).toBe(
    "/today",
  );
  expect(screen.getByRole("link", { name: "Finish" }).getAttribute("href")).toBe(
    `/workouts/${SESSION.id}/finish`,
  );
  // Add exercise and Superset stand under the list, so More is the session's details alone.
  expect(screen.getByRole("button", { name: "Session details" })).toBeTruthy();
  expect(screen.getAllByRole("link", { name: "Add exercise" })).toHaveLength(1);
  expect(screen.getAllByRole("button", { name: "Superset" })).toHaveLength(1);
  expect(screen.getByText(whole("70–90 min"))).toBeTruthy();
});

it("holds Finish back while a set draft is unsaved, and says where", () => {
  show({ drafts: { count: 1, names: ["Barbell bench press"] } });
  expect(screen.queryByRole("link", { name: "Finish" })).toBeNull();
  const finish = screen.getByRole("button", { name: "Finish" });
  expect(finish.getAttribute("aria-disabled")).toBe("true");
  const why = document.getElementById(finish.getAttribute("aria-describedby")!);
  expect(why?.textContent).toBe(
    "A set in Barbell bench press is not saved yet. Save or remove it before finishing.",
  );
});

it("names every exercise holding drafts, and none it cannot find", () => {
  expect(draftsWarning({ count: 3, names: ["Barbell bench press", "Plank"] })).toBe(
    "Sets in Barbell bench press and Plank are not saved yet. Save or remove them before finishing.",
  );
  expect(draftsWarning({ count: 2, names: [] })).toBe(
    "Sets on this device are not saved yet. Save or remove them before finishing.",
  );
});

it("says where a row stands only when that is news", () => {
  const { open } = show();
  const bench = screen.getByRole("button", { name: /Barbell bench press/ });
  expect(bench.textContent).toContain("60 kg × 4, 60 kg × 4");
  expect(bench.textContent).toContain("in progress, 2 of 4 sets done. Resume");
  expect(
    within(screen.getByRole("button", { name: /Barbell curl/ })).getByRole("img", { name: "Done" }),
  ).toBeTruthy();
  const crunch = screen.getByRole("button", { name: /Cable crunch/ });
  expect(crunch.textContent).toContain("Skipped");
  expect(crunch.textContent).toContain("Back is sore today.");
  expect(screen.getByRole("button", { name: /Face pull/ }).textContent).toContain(
    "15 kg · 1 × 15 @ 2 RIR",
  );
  // The coach's note for an exercise is its own screen's to say whole (DESIGN.md, The session):
  // the row says there is one, and that the coach added it, without cutting it short.
  const pull = screen.getByRole("button", { name: /Face pull/ });
  expect(pull.textContent).toContain("Added by the coach");
  expect(pull.textContent).not.toContain("Light, for the shoulders.");
  expect(
    within(pull).getByRole("img", { name: "The coach wrote a note for this exercise" }),
  ).toBeTruthy();

  fireEvent.click(bench);
  expect(open).toHaveBeenCalledWith("barbell-bench-press");
});

it("gives the recovery check its own note", () => {
  show();
  const note = screen.getByRole("complementary", { name: "Recovery check" });
  expect(note.textContent).toContain("Sleep 5 h");
  expect(note.textContent).toContain("Hold loads today rather than adding");
});

it("opens the warm-up and marks it done once the server answers", async () => {
  let answer!: (value: { ok: true }) => void;
  actions.warmup.mockReturnValue(new Promise((resolve) => (answer = resolve)));
  show();
  fireEvent.click(screen.getByRole("button", { name: /Upper-body warm-up/ }));
  const sheet = within(screen.getByRole("dialog", { name: "Upper-body warm-up", hidden: true }));
  expect(sheet.getByText("Arm circles + shoulder rotations")).toBeTruthy();
  fireEvent.click(sheet.getByRole("button", { name: "Mark done", hidden: true }));
  expect(sheet.getByRole("button", { name: "Saving…", hidden: true })).toBeTruthy();
  answer({ ok: true });
  await sheet.findByRole("button", { name: "Done", hidden: true });
  expect(actions.warmup).toHaveBeenCalledWith(SESSION.id, true);
});

it("marks the warm-up done from its row, and undoes it there", async () => {
  actions.warmup.mockResolvedValue({ ok: true });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Mark warm-up done" }));
  const done = await screen.findByRole("button", { name: "Warm-up done. Mark not done" });
  expect(done.getAttribute("aria-pressed")).toBe("true");
  await screen.findByText("Done");
  expect(actions.warmup).toHaveBeenLastCalledWith(SESSION.id, true);
  fireEvent.click(done);
  await screen.findByRole("button", { name: "Mark warm-up done" });
  expect(actions.warmup).toHaveBeenLastCalledWith(SESSION.id, false);
});

it("writes the coach's warm-up out whole on its row, with no sheet to repeat it", () => {
  show({
    session: {
      ...SESSION,
      coachPlan: {
        summary: null,
        warmup: [
          "Before the bench: an empty bar for 10, then 40 kg × 5.",
          "Band pull-aparts, 2 × 15, between the warm-up sets.",
        ],
        generatedAt: "2026-09-29T04:00:00.000Z",
      },
    },
  });
  expect(screen.getByText("Before the bench: an empty bar for 10, then 40 kg × 5.")).toBeTruthy();
  expect(screen.getByText("Band pull-aparts, 2 × 15, between the warm-up sets.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Before the bench/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Mark warm-up done" })).toBeTruthy();
});

it("says what Add exercise just added, and takes focus to the first of them", async () => {
  show({ added: 2 });
  // The status line is in place before its words arrive, so a screen reader hears them.
  const line = await screen.findByText("Added Cable crunch and Face pull.");
  expect(line.getAttribute("role")).toBe("status");
  expect(document.activeElement).toBe(screen.getByRole("button", { name: /Cable crunch/ }));
});

it("names a few additions in full and many by count", async () => {
  const { addedLine } = await import("./workout-overview");
  expect(addedLine([])).toBe("");
  expect(addedLine(["Leg press"])).toBe("Added Leg press.");
  expect(addedLine(["A", "B", "C", "D"])).toBe("Added A, B, C and D.");
  expect(addedLine(["A", "B", "C", "D", "E", "F"])).toBe("Added 6 exercises: A, B, C and 3 more.");
});

it("takes each row's numbers from one source: the coach's, the programme's or the defaults", () => {
  const coached: ExerciseVM["suggestion"] = {
    kind: "coach",
    basis: "exercise",
    reason: "Coach plan for today",
    advice: null,
    loadIncrement: 5,
    sets: [1, 2, 3].map((setIndex) => ({
      setIndex,
      setType: "working" as const,
      weight: 100,
      reps: 5,
      rir: 2,
      durationSeconds: null,
      distanceMeters: null,
    })),
  };
  show({
    session: {
      ...SESSION,
      coachPlan: { summary: null, warmup: [], generatedAt: "2026-09-29T06:00:00.000Z" },
      exercises: [
        // Planned by the coach on a machine that counts in pounds: the coach's sets, its unit.
        exercise("Leg press", {
          equipment: { id: "lp", name: "Leg press 2", unit: "lb", ladder: null },
          suggestion: coached,
          coachRestSeconds: 150,
        }),
        // The coach left this one's sets to the programme.
        exercise("Seated leg curl"),
        // Added on the spot: the exercise's own defaults.
        exercise("Cable lateral raise", {
          planned: null,
          exercise: {
            ...exercise("Cable lateral raise").exercise,
            defaults: {
              repMin: 12,
              repMax: 20,
              durationMinSeconds: null,
              durationMaxSeconds: null,
              distanceMinMeters: null,
              distanceMaxMeters: null,
              rir: 2,
              restSeconds: 60,
            },
          },
        }),
      ],
    },
  });
  expect(screen.getByRole("button", { name: /Leg press/ }).textContent).toContain(
    "100 lb · 3 × 5 @ 2 RIR",
  );
  expect(screen.getByRole("button", { name: /Seated leg curl/ }).textContent).toContain(
    "4 × 3–5 @ 2 RIR",
  );
  expect(screen.getByRole("button", { name: /Cable lateral raise/ }).textContent).toContain(
    "12–20 reps @ 2 RIR",
  );
});

it("says on the row when an exercise's machine is still to settle", () => {
  show({
    session: {
      ...SESSION,
      exercises: [
        exercise("Hack squat", {
          exercise: { ...exercise("Hack squat").exercise, modality: "machine" },
        }),
      ],
    },
  });
  expect(screen.getByRole("button", { name: /Hack squat/ }).textContent).toContain(
    "4 × 3–5 @ 2 RIR · Machine not chosen",
  );
});
