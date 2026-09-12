// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { draftKey, writeDraft } from "@/lib/workout-drafts";
import { ExerciseLogger } from "./exercise-logger";
import type { ExerciseVM, SessionVM, SetVM } from "./view-model";

const actions = vi.hoisted(() => ({ log: vi.fn(), remove: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/sessions", () => ({
  logSetAction: actions.log,
  deleteSetAction: actions.remove,
  setExerciseCompletedAction: vi.fn(),
  skipExerciseAction: vi.fn(),
  applyFallbackAction: vi.fn(),
}));

const context = {
  userId: "user",
  sessionId: "session",
  workoutExerciseId: "slot",
  exerciseId: "bench",
  equipmentId: null,
};

const saved: SetVM = {
  id: "set",
  setIndex: 1,
  setType: "working",
  weight: 60,
  reps: 5,
  rir: 2,
  durationSeconds: null,
  distanceMeters: null,
  unit: "kg",
  completedAt: "2026-09-08T12:00:00.000Z",
};

const exercise: ExerciseVM = {
  id: "slot",
  orderIndex: 1,
  exercise: {
    id: "bench",
    name: "Bench press",
    slug: "bench",
    modality: "barbell",
    loadPortability: "global",
    requiresEquipment: true,
    defaultPrescriptionType: "reps",
    rirNote: null,
  },
  equipment: null,
  planned: null,
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
};

const session: SessionVM = {
  id: "session",
  gym: { id: "gym", name: "Test gym", kind: "gym" },
  day: null,
  cycleIndex: null,
  startedAt: "2026-09-08T11:00:00.000Z",
  completedAt: null,
  bodyWeightKg: null,
  sleepHours: null,
  sleepQuality: null,
  energy: null,
  fatigue: null,
  soreness: null,
  backPainPre: null,
  shinLeftPre: null,
  shinRightPre: null,
  warmupCompleted: false,
  notes: null,
  warmup: null,
  restTimerEnabled: false,
  coachPlan: null,
  warnings: [],
  timeZone: "Asia/Kolkata",
  preferredUnit: "kg" as const,
  exercises: [exercise],
};

function renderLogger(
  overrides: {
    exercise?: Partial<ExerciseVM>;
    readOnly?: boolean;
    preferredUnit?: "kg" | "lb";
  } = {},
) {
  const merged = { ...exercise, ...overrides.exercise };
  return render(
    <ExerciseLogger
      exercise={merged}
      session={{ ...session, preferredUnit: overrides.preferredUnit ?? "kg", exercises: [merged] }}
      userId="user"
      readOnly={overrides.readOnly ?? false}
      onBack={() => {}}
      onDirtyChange={() => {}}
      onLogged={() => {}}
    />,
  );
}

// jsdom ships <dialog> without its modal methods; the sheet only needs open/close to work.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
  localStorage.clear();
  actions.log.mockReset();
  actions.remove.mockReset();
});
afterEach(cleanup);

it("uses the coach's exact set count and types instead of repeating targets to fill the programme", async () => {
  actions.log.mockResolvedValue({ ok: true, set: { ...saved, setType: "warmup" } });
  renderLogger({
    exercise: {
      planned: {
        programExerciseId: "planned",
        plannedExerciseName: "Bench press",
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
      suggestion: {
        kind: "coach",
        basis: "exercise",
        reason: "Test coach plan",
        advice: null,
        loadIncrement: 2.5,
        sets: [
          { ...saved, setType: "warmup" },
          { ...saved, setIndex: 2 },
        ],
      },
    },
  });
  expect(screen.getByRole("button", { name: "Save set 2" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Save set 3" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Save set 1" }));
  await waitFor(() => expect(actions.log).toHaveBeenCalledTimes(1));
  expect(actions.log.mock.calls[0]?.[0]).toMatchObject({ setType: "warmup", weight: 60, reps: 5 });
});

it("says what an open-ended coach plan asks for instead of a load it never set", () => {
  renderLogger({
    exercise: {
      coachNote: "Nothing on record: find a load you could stop three short of.",
      suggestion: {
        kind: "coach",
        basis: "exercise",
        reason: "First session at this gym",
        advice: null,
        loadIncrement: 2.5,
        // The coach left the weight open: there is no previous load, so none can be "the same".
        sets: [{ ...saved, weight: null, reps: 5, rir: 3 }],
      },
    },
  });
  expect(screen.queryByText(/the same load/)).toBeNull();
  expect(screen.getByText(/5 reps · Nothing on record/)).toBeTruthy();
});

it("preserves decimal metres in the grid and the set options", async () => {
  actions.log.mockResolvedValue({
    ok: true,
    set: { ...saved, weight: 20, reps: null, distanceMeters: 25.5 },
  });
  renderLogger({
    exercise: { exercise: { ...exercise.exercise, defaultPrescriptionType: "distance" } },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Set 1 metres" }), {
    target: { value: "25.5" },
  });
  expect((screen.getByRole("textbox", { name: "Set 1 metres" }) as HTMLInputElement).value).toBe(
    "25.5",
  );
  fireEvent.click(screen.getByRole("button", { name: "Set 1 options" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Metres" }), { target: { value: "26.5" } });
  expect((screen.getByRole("textbox", { name: "Metres" }) as HTMLInputElement).value).toBe("26.5");
});

it("converts a restored draft after a preference change and submits its displayed unit", async () => {
  writeDraft(localStorage, context, {
    unit: "kg",
    setIndex: 1,
    setType: "working",
    weight: "60",
    reps: "5",
    rir: "2",
    duration: "",
    distance: "",
    touched: ["weight", "reps", "rir"],
    baseCompletedAt: null,
  });
  actions.log.mockResolvedValue({ ok: true, set: { ...saved, weight: 132.28, unit: "lb" } });
  renderLogger({ preferredUnit: "lb" });
  await waitFor(() =>
    expect(
      (screen.getByRole("textbox", { name: "Set 1 load, lb" }) as HTMLInputElement).value,
    ).toBe("132.28"),
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry saving set 1" }));
  await waitFor(() =>
    expect(actions.log).toHaveBeenCalledWith(
      expect.objectContaining({ weight: 132.28, unit: "lb" }),
    ),
  );
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
});

it("removes the last unsaved row from its set options without leaving a draft behind", async () => {
  renderLogger();
  fireEvent.change(screen.getByRole("textbox", { name: "Set 1 reps" }), {
    target: { value: "5" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Set 1 options" }));
  fireEvent.click(screen.getByRole("button", { name: "Remove set 1" }));
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
  expect((screen.getByRole("textbox", { name: "Set 1 reps" }) as HTMLInputElement).value).toBe("");
});

it("retains unmatched drafts for review when the workout was finished elsewhere", async () => {
  writeDraft(localStorage, context, {
    setIndex: 1,
    setType: "working",
    weight: "65",
    reps: "5",
    rir: "2",
    duration: "",
    distance: "",
    touched: ["weight", "reps", "rir"],
    baseCompletedAt: null,
  });
  renderLogger({ readOnly: true });
  await screen.findByText(/This workout is finished, so these entries cannot be saved here/);
  expect(localStorage.getItem(draftKey(context))).toContain('"weight":"65"');
  fireEvent.click(screen.getByRole("button", { name: "Discard this local draft" }));
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
});

it("keeps edits through a failed save and a remount, then clears them only after a confirmed retry", async () => {
  actions.log.mockRejectedValueOnce(new Error("offline"));
  const view = renderLogger();
  fireEvent.change(screen.getByRole("textbox", { name: "Set 1 load, kg" }), {
    target: { value: "60" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Set 1 reps" }), { target: { value: "5" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Set 1 RIR" }), { target: { value: "2" } });
  expect(localStorage.getItem(draftKey(context))).toContain('"weight":"60"');
  fireEvent.click(screen.getByRole("button", { name: "Save set 1" }));
  await screen.findByRole("button", { name: "Retry saving set 1" });
  view.unmount();
  renderLogger();
  await screen.findByText("Unsaved draft restored. Review and retry saving.");
  expect((screen.getByRole("textbox", { name: "Set 1 load, kg" }) as HTMLInputElement).value).toBe(
    "60",
  );
  actions.log.mockResolvedValueOnce({ ok: true, set: saved });
  fireEvent.click(screen.getByRole("button", { name: "Retry saving set 1" }));
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
  await screen.findByText("Set 1 saved");
});

it("shows the next row immediately while a request is still in flight", async () => {
  let resolve!: (value: { ok: true; set: SetVM }) => void;
  actions.log.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  renderLogger();
  fireEvent.change(screen.getByRole("textbox", { name: "Set 1 reps" }), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Save set 1" }));
  expect(screen.getByRole("button", { name: "Set 2 options" })).toBeTruthy();
  expect(screen.queryByText("Set 1 saved")).toBeNull();
  await act(async () => resolve({ ok: true, set: saved }));
});

it("recognizes an acknowledged-on-the-server draft and does not duplicate non-contiguous set indices", async () => {
  writeDraft(localStorage, context, {
    setIndex: 3,
    setType: "working",
    weight: "60",
    reps: "5",
    rir: "2",
    duration: "",
    distance: "",
    touched: ["weight", "reps", "rir"],
    baseCompletedAt: null,
  });
  renderLogger({ exercise: { sets: [{ ...saved, setIndex: 3 }] } });
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
  expect(screen.getAllByRole("button", { name: "Set 3 options" })).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Set 4 options" })).toBeTruthy();
});

it("keeps each set's values to itself when a sibling row is edited", async () => {
  actions.log.mockResolvedValue({ ok: true, set: saved });
  renderLogger();
  fireEvent.change(screen.getByRole("textbox", { name: "Set 1 load, kg" }), {
    target: { value: "60" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Set 1 reps" }), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Save set 1" }));
  await screen.findByText("Set 1 saved");

  // A second row that happens to start from the same numbers is still its own record.
  fireEvent.change(screen.getByRole("textbox", { name: "Set 2 load, kg" }), {
    target: { value: "62.5" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Set 2 reps" }), { target: { value: "4" } });
  expect((screen.getByRole("textbox", { name: "Set 1 load, kg" }) as HTMLInputElement).value).toBe(
    "60",
  );
  expect((screen.getByRole("textbox", { name: "Set 1 reps" }) as HTMLInputElement).value).toBe("5");
  expect(screen.getByText("Set 1 saved")).toBeTruthy();
});

it("saves a cleared optional value as unknown instead of restoring its suggestion", async () => {
  actions.log.mockResolvedValue({ ok: true, set: { ...saved, rir: null } });
  renderLogger({
    exercise: {
      suggestion: {
        kind: "repeat",
        basis: "exercise",
        reason: "Same as last time",
        advice: null,
        loadIncrement: 2.5,
        sets: [
          {
            setIndex: 1,
            setType: "working",
            weight: 60,
            reps: 5,
            rir: 2,
            durationSeconds: null,
            distanceMeters: null,
          },
        ],
      },
    },
  });

  const rir = screen.getByRole("textbox", { name: "Set 1 RIR" }) as HTMLInputElement;
  // The suggestion is offered, unconfirmed, as the row's placeholder.
  expect(rir.placeholder).toBe("2");
  // Typing then clearing is a decision, not silence: it must not come back as the target.
  fireEvent.change(rir, { target: { value: "3" } });
  fireEvent.change(rir, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save set 1" }));

  await waitFor(() => expect(actions.log).toHaveBeenCalledTimes(1));
  expect(actions.log.mock.calls[0]?.[0]).toMatchObject({ setIndex: 1, rir: null, reps: 5 });
});

it("takes an untouched row's suggestion, so a blank set still records the target", async () => {
  actions.log.mockResolvedValue({ ok: true, set: saved });
  renderLogger({
    exercise: {
      suggestion: {
        kind: "repeat",
        basis: "exercise",
        reason: "Same as last time",
        advice: null,
        loadIncrement: 2.5,
        sets: [
          {
            setIndex: 1,
            setType: "working",
            weight: 60,
            reps: 5,
            rir: 2,
            durationSeconds: null,
            distanceMeters: null,
          },
        ],
      },
    },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save set 1" }));
  await waitFor(() => expect(actions.log).toHaveBeenCalledTimes(1));
  expect(actions.log.mock.calls[0]?.[0]).toMatchObject({ weight: 60, reps: 5, rir: 2 });
});
