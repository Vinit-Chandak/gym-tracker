// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { draftKey, writeDraft } from "@/lib/workout-drafts";
import { ExerciseLogger } from "./exercise-logger";
import type { ExerciseVM, SessionVM, SetVM } from "./view-model";

const actions = vi.hoisted(() => ({ log: vi.fn(), remove: vi.fn(), complete: vi.fn() }));
// `unstable_rethrow` is how a failed save tells a redirect from a dropped connection; the
// mock has to carry it, or every failure here looks like the framework's own.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  unstable_rethrow: () => {},
}));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/sessions", () => ({
  logSetAction: actions.log,
  deleteSetAction: actions.remove,
  setExerciseCompletedAction: actions.complete,
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
  effortReported: true,
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
  coachPerSide: null,
  guidance: null,
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
    onLogged?: (seconds: number) => void;
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
      onLogged={overrides.onLogged ?? (() => {})}
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
  actions.complete.mockReset();
});

/** A promise the test answers when it chooses, as a slow connection would. */
function later<T>() {
  let answer!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    answer = resolve;
  });
  return { promise, answer };
}

/** A tap on a figure types it: the entry's three fields come up, and these are filled. */
function fill(values: Record<string, string>) {
  const [first] = Object.keys(values);
  if (!screen.queryByRole("textbox", { name: first }))
    fireEvent.click(
      screen.getAllByRole("button", { name: /\. Type (a load|reps|RIR|RPE|metres|seconds)$/ })[0]!,
    );
  for (const [label, value] of Object.entries(values))
    fireEvent.change(screen.getByRole("textbox", { name: label }), { target: { value } });
}
const field = (label: string) => screen.getByRole("textbox", { name: label }) as HTMLInputElement;
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
/** The entry, by the set it is on. */
const entry = (name: string) => screen.getByRole("region", { name });
/** Opens More, then one of its options. */
function more(option: string) {
  press("Complete, skip, superset, substitute");
  press(option);
}

/** Fills set 1's reps and RIR and presses Save. */
function saveFirstSet() {
  fill({ Reps: "5", RIR: "2" });
  press("Save");
}
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
  // The coach wrote one warm-up and one working set, not the programme's four.
  expect(entry("Warm-up 1 of 1")).toBeTruthy();
  press("Save");
  await waitFor(() => expect(actions.log).toHaveBeenCalledTimes(1));
  expect(actions.log.mock.calls[0]?.[0]).toMatchObject({ setType: "warmup", weight: 60, reps: 5 });
  expect(await screen.findByRole("region", { name: "Set 1 of 1" })).toBeTruthy();
});

it("prefills a warm-up turned into a working set with the coach's working set, and says why", async () => {
  // Upper B's incline bench as the coach wrote it: a ramp of three, then 3 × 55 kg × 6 at 2 RIR.
  const target = (setIndex: number, weight: number, reps: number, rir: number | null) => ({
    ...saved,
    setIndex,
    setType: rir === null ? ("warmup" as const) : ("working" as const),
    weight,
    reps,
    rir,
  });
  actions.log.mockResolvedValue({ ok: true, set: { ...saved, weight: 55, reps: 6, rir: 2 } });
  renderLogger({
    exercise: {
      coachNote: "Back to 55 kg. Low incline.",
      suggestion: {
        kind: "coach",
        basis: "exercise",
        reason: "Coach plan for today",
        advice: null,
        loadIncrement: 2.5,
        sets: [
          target(1, 30, 6, null),
          target(2, 40, 5, null),
          target(3, 50, 4, null),
          target(4, 55, 6, 2),
          target(5, 55, 6, 2),
          target(6, 55, 6, 2),
        ],
      },
    },
  });
  // The warm-up says what it is, with its own figures.
  expect(entry("Warm-up 1 of 3")).toBeTruthy();
  press(/^Coach plan: why 30 kilograms × 6$/);
  expect(screen.getByRole("dialog", { name: "Why this suggestion" })).toBeTruthy();
  // Skipping the warm-up: the row is now the first working set, and asks for the work.
  press("Set options: add a set, type, remove");
  fireEvent.change(screen.getByRole("combobox", { name: "Type" }), {
    target: { value: "working" },
  });
  expect(entry("Set 1 of 3")).toBeTruthy();
  expect(screen.getByRole("button", { name: "55 kilograms, suggested. Type a load" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "6 reps, suggested. Type reps" })).toBeTruthy();
  expect(screen.getByRole("button", { name: /^Coach plan: why 55 kilograms × 6$/ })).toBeTruthy();
  // The reps say the working set's figure under them, not the warm-up's.
  expect(screen.getByText(/^target\s6$/)).toBeTruthy();
  // Saved untouched, it is the coach's working set, never the warm-up's 30 kg.
  fill({ RIR: "2" });
  press("Save");
  await waitFor(() => expect(actions.log).toHaveBeenCalledTimes(1));
  expect(actions.log.mock.calls[0]?.[0]).toMatchObject({
    setType: "working",
    weight: 55,
    reps: 6,
  });
  // The ramp nobody did is passed: the entry goes on to the second working set.
  expect(await screen.findByRole("region", { name: "Set 2 of 3" })).toBeTruthy();
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
  expect(screen.getByRole("button", { name: "Load not set. Type a load" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "5 reps, suggested. Type reps" })).toBeTruthy();
  expect(screen.getByText(/Nothing on record/)).toBeTruthy();
  press(/^Coach plan: why 5$/);
  expect(screen.getByRole("dialog", { name: "Why this suggestion" })).toBeTruthy();
});

it("preserves decimal metres in the entry and in the set it saved", async () => {
  actions.log.mockResolvedValue({
    ok: true,
    set: { ...saved, weight: 20, reps: null, rir: null, rpe: 7, distanceMeters: 25.5 },
  });
  renderLogger({
    exercise: { exercise: { ...exercise.exercise, defaultPrescriptionType: "distance" } },
  });
  fill({ Metres: "25.5", RPE: "7" });
  expect(field("Metres").value).toBe("25.5");
  press("Save");
  await waitFor(() =>
    expect(actions.log).toHaveBeenCalledWith(expect.objectContaining({ distanceMeters: 25.5 })),
  );
  press(/^Set 1: 20 kilograms, 25\.5 metres, RPE 7\. Edit$/);
  fireEvent.change(field("Metres"), { target: { value: "26.5" } });
  expect(field("Metres").value).toBe("26.5");
});

it("picks up a set carried here by a machine answer as the row it was, whenever it arrives", async () => {
  // The machine answer lands after the exercise reopened on its machine: the carried row is
  // the one being typed, not a recovered draft, so it carries no warning.
  renderLogger({
    exercise: { equipment: { id: "m1", name: "Hack squat", unit: "kg", ladder: null } },
  });
  const there = { ...context, equipmentId: "m1" };
  act(() => {
    writeDraft(localStorage, there, {
      effortVersion: 2,
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
      carried: true,
    });
  });
  await screen.findByRole("button", { name: "60 kilograms. Type a load" });
  expect(screen.queryByText("Unsaved draft restored. Review and retry saving.")).toBeNull();
  // Carried once: kept as an ordinary draft of this row from here.
  expect(localStorage.getItem(draftKey(there))).not.toContain("carried");
});

it("converts a restored draft after a preference change and submits its displayed unit", async () => {
  writeDraft(localStorage, context, {
    effortVersion: 2,
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
  await screen.findByRole("button", { name: "132.28 pounds. Type a load" });
  expect(screen.getByText("Unsaved draft restored. Review and retry saving.")).toBeTruthy();
  press("Retry saving set 1");
  await waitFor(() =>
    expect(actions.log).toHaveBeenCalledWith(
      expect.objectContaining({ weight: 132.28, unit: "lb" }),
    ),
  );
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
});

it("removes the set being entered from its options without leaving a draft behind", async () => {
  renderLogger();
  press("One rep more");
  expect(localStorage.getItem(draftKey(context))).toContain('"reps":"1"');
  press("Set options: add a set, type, remove");
  press("Remove this set");
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
  expect(screen.getByRole("button", { name: "Reps not set. Type reps" })).toBeTruthy();
});

it("deletes only the version of a logged set that the athlete is looking at", async () => {
  actions.remove.mockResolvedValueOnce({ ok: false, error: "This set changed on another device." });
  renderLogger({ exercise: { sets: [saved] } });
  press("Set 1: 60 kilograms, 5 reps, 2 reps in reserve. Edit");
  press("Delete this set");
  // It asks once, in place: a logged set cannot be brought back.
  expect(actions.remove).not.toHaveBeenCalled();
  press("Delete it");
  await waitFor(() => expect(actions.remove).toHaveBeenCalledWith("slot", 1, saved.completedAt));
  await screen.findByText("This set changed on another device.");
  // The set stays as the server has it.
  expect(
    screen.getByRole("button", { name: "Set 1: 60 kilograms, 5 reps, 2 reps in reserve. Edit" }),
  ).toBeTruthy();
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
  press("Discard this local draft");
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
});

it("keeps edits through a failed save and a remount, then clears them only after a confirmed retry", async () => {
  // What a save that never leaves the device actually rejects with.
  actions.log.mockRejectedValueOnce(new TypeError("Failed to fetch"));
  const onLogged = vi.fn();
  const view = renderLogger({ onLogged });
  fill({ "Load in kilograms": "60", Reps: "5", RIR: "2" });
  expect(localStorage.getItem(draftKey(context))).toContain('"weight":"60"');
  press("Save");
  await screen.findByRole("button", { name: "Retry saving set 1" });
  expect(
    screen.getByText("Connection lost. Your entries are still here. Retry saving when connected."),
  ).toBeTruthy();
  // Nothing was written, so rest does not start.
  expect(onLogged).not.toHaveBeenCalled();
  view.unmount();
  renderLogger();
  await screen.findByText("Unsaved draft restored. Review and retry saving.");
  expect(screen.getByRole("button", { name: "60 kilograms. Type a load" })).toBeTruthy();
  actions.log.mockResolvedValueOnce({ ok: true, set: saved });
  press("Retry saving set 1");
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
  await screen.findByRole("button", {
    name: "Set 1: 60 kilograms, 5 reps, 2 reps in reserve. Edit",
  });
});

it("turns to the next set, and starts rest, only once the server has the set", async () => {
  const reply = later<{ ok: true; set: SetVM }>();
  actions.log.mockReturnValueOnce(reply.promise);
  const onLogged = vi.fn();
  renderLogger({ onLogged });
  saveFirstSet();
  // Nothing is written before the server has it: the set stays in the entry, saving.
  expect(screen.getByRole("button", { name: "Saving…" })).toBeTruthy();
  expect(entry("Set 1")).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Set 1: / })).toBeNull();
  expect(onLogged).not.toHaveBeenCalled();
  // Said as well as drawn (WCAG 4.1.3), on one status line that stays on the page.
  expect(screen.getByRole("status").textContent).toBe("Saving set 1");
  await act(async () => reply.answer({ ok: true, set: saved }));
  expect(
    screen.getByRole("button", { name: "Set 1: 60 kilograms, 5 reps, 2 reps in reserve. Edit" }),
  ).toBeTruthy();
  expect(entry("Set 2")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe(
    "Set 1 saved: 60 kilograms, 5 reps, 2 reps in reserve. Set 2 next.",
  );
  expect(onLogged).toHaveBeenCalledWith(90);
  // The values go back to suggestions and RIR empties.
  expect(screen.getByRole("button", { name: "RIR not set. Type RIR" })).toBeTruthy();
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
  expect(screen.getAllByRole("button", { name: /^Set 3: / })).toHaveLength(1);
  // The first set not yet done is entered first.
  expect(entry("Set 1")).toBeTruthy();
});

it("keeps each set's values to itself when the next one is edited", async () => {
  actions.log.mockResolvedValue({ ok: true, set: saved });
  renderLogger();
  fill({ "Load in kilograms": "60", Reps: "5", RIR: "2" });
  press("Save");
  await screen.findByRole("region", { name: "Set 2" });

  // A second set that happens to start from the same numbers is still its own record.
  fill({ "Load in kilograms": "62.5", Reps: "4" });
  expect(
    screen.getByRole("button", { name: "Set 1: 60 kilograms, 5 reps, 2 reps in reserve. Edit" }),
  ).toBeTruthy();
});

const repeating = {
  suggestion: {
    kind: "repeat" as const,
    basis: "exercise" as const,
    reason: "Same as last time",
    advice: null,
    loadIncrement: 2.5,
    sets: [
      {
        setIndex: 1,
        setType: "working" as const,
        weight: 60,
        reps: 5,
        rir: 2,
        durationSeconds: null,
        distanceMeters: null,
      },
    ],
  },
};

it("requires reported RIR after clearing it and never restores the target as actual effort", async () => {
  actions.log.mockResolvedValue({ ok: true, set: { ...saved, rir: null } });
  renderLogger({ exercise: repeating });
  // The suggestion's RIR is never shown as an entry.
  expect(screen.getByRole("button", { name: "RIR not set. Type RIR" })).toBeTruthy();
  // Typing then clearing is a decision, not silence: it must not come back as the target.
  fill({ RIR: "3" });
  fireEvent.change(field("RIR"), { target: { value: "" } });
  press("Save");
  await screen.findByText(/Enter RIR/);
  expect(actions.log).not.toHaveBeenCalled();
});

it("accepts load and reps targets only after the athlete supplies actual effort", async () => {
  actions.log.mockResolvedValue({ ok: true, set: saved });
  renderLogger({ exercise: repeating });
  // Save waits for RIR; pressed, it says what is missing in the slot over it.
  const save = screen.getByRole("button", { name: "Save" });
  expect(save.getAttribute("aria-disabled")).toBe("true");
  press("Save");
  await screen.findByText(/Enter RIR/);
  expect(actions.log).not.toHaveBeenCalled();
  fill({ RIR: "3" });
  expect(screen.queryByText(/Enter RIR/)).toBeNull();
  press("Save");
  await waitFor(() => expect(actions.log).toHaveBeenCalledTimes(1));
  expect(actions.log.mock.calls[0]?.[0]).toMatchObject({ weight: 60, reps: 5, rir: 3 });
});

it("takes the target when the empty RIR's dash is tapped, and steps either side of it", () => {
  renderLogger({ exercise: { planned: benchSlot } });
  press("RIR not set, target 2. Use the target");
  expect(screen.getByRole("button", { name: "2 reps in reserve. Type RIR" })).toBeTruthy();
  press("One less in reserve");
  expect(screen.getByRole("button", { name: "1 rep in reserve. Type RIR" })).toBeTruthy();
});

it("uses mandatory RPE for a carry and persists that reported effort", async () => {
  actions.log.mockResolvedValue({
    ok: true,
    set: { ...saved, reps: null, rir: null, rpe: 7, distanceMeters: 25 },
  });
  renderLogger({
    exercise: { exercise: { ...exercise.exercise, defaultPrescriptionType: "distance" } },
  });
  expect(screen.queryByRole("button", { name: "What RIR means" })).toBeNull();
  fill({ Metres: "25" });
  press("Save");
  await screen.findByText(/Enter effort/);
  expect(actions.log).not.toHaveBeenCalled();
  fill({ RPE: "7" });
  press("Save");
  await waitFor(() =>
    expect(actions.log).toHaveBeenCalledWith(
      expect.objectContaining({ rir: null, rpe: 7, distanceMeters: 25 }),
    ),
  );
});

it("preserves an older draft but requires its possibly copied effort to be re-entered", async () => {
  writeDraft(localStorage, context, {
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
  actions.log.mockResolvedValue({ ok: true, set: { ...saved, rir: 3 } });
  renderLogger();
  await screen.findByText("Unsaved draft restored. Review and retry saving.");
  press("Retry saving set 1");
  await screen.findByText(/Review and re-enter actual RIR/);
  expect(actions.log).not.toHaveBeenCalled();
  expect(localStorage.getItem(draftKey(context))).toContain('"weight":"60"');
  fill({ RIR: "3" });
  press("Save");
  await waitFor(() =>
    expect(actions.log).toHaveBeenCalledWith(
      expect.objectContaining({ weight: 60, rir: 3, effortInputVersion: 2 }),
    ),
  );
});

it("does not confirm an older saved effort rating when only the load is edited", async () => {
  renderLogger({ exercise: { sets: [{ ...saved, effortReported: false }] } });
  press("Set 1: 60 kilograms, 5 reps, 2 reps in reserve. Edit");
  const sheet = screen.getByRole("dialog", { name: "Set 1" });
  fireEvent.change(within(sheet).getByRole("textbox", { name: "Load in kilograms" }), {
    target: { value: "62.5" },
  });
  fireEvent.click(within(sheet).getByRole("button", { name: "Update" }));
  await within(sheet).findByText(/Review and re-enter actual RIR/);
  expect(actions.log).not.toHaveBeenCalled();
  // Closed, the sheet takes its sentence with it: the set is as the server has it.
  fireEvent.click(within(sheet).getByRole("button", { name: "Close sheet" }));
  await waitFor(() => expect(screen.queryByText(/Review and re-enter actual RIR/)).toBeNull());
});

it("updates a logged set from its line without starting rest again", async () => {
  actions.log.mockResolvedValue({ ok: true, set: { ...saved, weight: 62.5 } });
  const onLogged = vi.fn();
  renderLogger({ exercise: { sets: [saved] }, onLogged });
  press("Set 1: 60 kilograms, 5 reps, 2 reps in reserve. Edit");
  const sheet = screen.getByRole("dialog", { name: "Set 1" });
  fireEvent.click(within(sheet).getByRole("button", { name: "More load, 2.5 kg" }));
  fireEvent.click(within(sheet).getByRole("button", { name: "Update" }));
  await waitFor(() =>
    expect(actions.log).toHaveBeenCalledWith(
      expect.objectContaining({
        setIndex: 1,
        weight: 62.5,
        expectedCompletedAt: saved.completedAt,
      }),
    ),
  );
  await screen.findByRole("button", {
    name: "Set 1: 62.5 kilograms, 5 reps, 2 reps in reserve. Edit",
  });
  expect(onLogged).not.toHaveBeenCalled();
});

it("leaves a set being typed into alone when the saved sets change underneath it", async () => {
  const props = {
    session,
    userId: "user",
    readOnly: false,
    onBack: () => {},
    onDirtyChange: () => {},
    onLogged: () => {},
  };
  const view = render(<ExerciseLogger {...props} exercise={exercise} />);
  fill({ Reps: "5" });
  // Another set of the exercise saved: the sets change while set 1 is still being entered.
  view.rerender(
    <ExerciseLogger {...props} exercise={{ ...exercise, sets: [{ ...saved, setIndex: 2 }] }} />,
  );
  await act(async () => {});
  expect(screen.queryByText("Unsaved draft restored. Review and retry saving.")).toBeNull();
  expect(field("Reps").value).toBe("5");
  expect(localStorage.getItem(draftKey(context))).toContain('"reps":"5"');
});

const benchSlot: NonNullable<ExerciseVM["planned"]> = {
  programExerciseId: "planned",
  plannedExerciseName: "Bench press",
  sets: 3,
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
};
const target = (
  setIndex: number,
  weight: number,
  reps: number,
  setType: SetVM["setType"] = "working",
) => ({
  setIndex,
  setType,
  weight,
  reps,
  rir: setType === "warmup" ? null : 2,
  durationSeconds: null,
  distanceMeters: null,
});
/** The rule holding 3 × 5 at 100 kg, with `ramp` in front of it as warm-up targets. */
const holding = (ramp: ReturnType<typeof target>[] = []): Partial<ExerciseVM> => ({
  planned: benchSlot,
  suggestion: {
    kind: "hold",
    basis: "exercise",
    reason: "Same weight",
    advice: null,
    loadIncrement: 2.5,
    sets: [...ramp, ...[1, 2, 3].map((index) => target(ramp.length + index, 100, 5))],
  },
});

it("offers the ramp in front of the work as warm-ups, and the programme's sets after it", async () => {
  actions.log.mockResolvedValue({ ok: true, set: { ...saved, setType: "warmup", weight: 40 } });
  renderLogger({
    exercise: holding([
      target(1, 40, 8, "warmup"),
      target(2, 57.5, 5, "warmup"),
      target(3, 72.5, 3, "warmup"),
    ]),
  });
  expect(entry("Warm-up 1 of 3")).toBeTruthy();
  // A warm-up's RIR is optional, so Save is ready; its tag is the work's, not the warm-up's.
  expect(
    screen.getByRole("button", { name: "RIR not set, optional for a warm-up. Type RIR" }),
  ).toBeTruthy();
  expect(screen.queryByRole("button", { name: /^Hold: why/ })).toBeNull();
  // A warm-up takes its targets, and no RIR, as it is.
  press("Save");
  await waitFor(() => expect(actions.log).toHaveBeenCalledTimes(1));
  expect(actions.log.mock.calls[0]?.[0]).toMatchObject({
    setType: "warmup",
    weight: 40,
    reps: 8,
    rir: null,
  });
  expect(await screen.findByRole("region", { name: "Warm-up 2 of 3" })).toBeTruthy();
});

it("saves a light set with no RIR before the work as a warm-up, says so, and takes it back", async () => {
  actions.log.mockResolvedValueOnce({
    ok: true,
    set: { ...saved, setType: "warmup", weight: 60, rir: null },
  });
  renderLogger({ exercise: holding() });
  expect(entry("Set 1 of 3")).toBeTruthy();
  fill({ "Load in kilograms": "60" });
  press("Save");
  await waitFor(() => expect(actions.log).toHaveBeenCalledTimes(1));
  expect(actions.log.mock.calls[0]?.[0]).toMatchObject({
    setType: "warmup",
    weight: 60,
    rir: null,
  });
  // Said on the status line as it lands, and drawn over the entry with its way back.
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toMatch(
      /^Saved as a warm-up: .*\. Set 1 of 3 next\.$/,
    ),
  );
  expect(screen.getByText(/Saved as a warm-up/, { selector: ".entry-slot span" })).toBeTruthy();

  // It was a working set after all: back it goes, and it is saved again with its RIR.
  press("Set 1 was a working set");
  expect(screen.queryByText(/Saved as a warm-up/, { selector: ".entry-slot span" })).toBeNull();
  const sheet = screen.getByRole("dialog", { name: "Set 1" });
  expect(within(sheet).getByRole("combobox", { name: "Type" })).toHaveProperty("value", "working");
  fireEvent.change(within(sheet).getByRole("textbox", { name: "RIR" }), { target: { value: "3" } });
  actions.log.mockResolvedValueOnce({ ok: true, set: { ...saved, weight: 60, rir: 3 } });
  fireEvent.click(within(sheet).getByRole("button", { name: "Update" }));
  await waitFor(() => expect(actions.log).toHaveBeenCalledTimes(2));
  expect(actions.log.mock.calls[1]?.[0]).toMatchObject({ setType: "working", weight: 60, rir: 3 });
});

it("keeps a light set with its RIR, or one after the work has started, as a working set", async () => {
  actions.log.mockResolvedValue({ ok: true, set: { ...saved, weight: 60, rir: 3 } });
  renderLogger({ exercise: holding() });
  // A lighter day on purpose is the athlete's to call.
  fill({ "Load in kilograms": "60", RIR: "3" });
  press("Save");
  await waitFor(() => expect(actions.log).toHaveBeenCalledTimes(1));
  expect(actions.log.mock.calls[0]?.[0]).toMatchObject({ setType: "working", weight: 60 });
  cleanup();

  // After a set of the work, a light one is not the warm-up, and a working set needs its RIR.
  renderLogger({ exercise: { ...holding(), sets: [{ ...saved, weight: 100 }] } });
  expect(entry("Set 2 of 3")).toBeTruthy();
  fill({ "Load in kilograms": "60" });
  press("Save");
  await screen.findByText(/Enter RIR/);
  expect(actions.log).toHaveBeenCalledTimes(1);
});

it("shows an exercise done the moment Complete is pressed, before the server answers", async () => {
  const reply = later<{ ok: true }>();
  actions.complete.mockReturnValueOnce(reply.promise);
  renderLogger({ exercise: { sets: [saved] } });
  more("Complete");
  await screen.findByText("Done");
  expect(actions.complete).toHaveBeenCalledWith("slot", true);
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  await act(async () => reply.answer({ ok: true }));
  expect(screen.getByText("Done")).toBeTruthy();
  // Done, the dock hands back to the list; a change of mind is in More.
  expect(screen.getByRole("button", { name: "Back to Unplanned session" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Reopen" })).toBeNull();
  press("Complete, skip, superset, substitute");
  expect(screen.getByRole("button", { name: "Reopen" })).toBeTruthy();
});

it("makes Complete the dock's button once the planned sets are in, another set a tap away", async () => {
  const sets = [1, 2, 3].map((setIndex) => ({ ...saved, id: `set-${setIndex}`, setIndex }));
  renderLogger({ exercise: { planned: benchSlot, sets } });
  expect(screen.getByRole("button", { name: "Complete Bench press" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Log another set" }));
  // The entry stands where Complete was, for the set past the plan; Complete stays in its slot.
  expect(entry("Set 4")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Complete Bench press" })).toBeTruthy();
});

it("offers Complete once the planned sets are in, and keeps focus with the exercise as it completes", async () => {
  actions.complete.mockResolvedValueOnce({ ok: true });
  const sets = [1, 2, 3].map((setIndex) => ({ ...saved, id: `set-${setIndex}`, setIndex }));
  renderLogger({ exercise: { planned: benchSlot, sets } });
  expect(screen.getByText(/^3 of 3 sets done\./)).toBeTruthy();
  const complete = screen.getByRole("button", { name: "Complete Bench press" });
  complete.focus();
  fireEvent.click(complete);
  // The slot goes with the entry; focus goes to the line that says the exercise is done.
  await waitFor(() => expect(document.activeElement?.textContent).toBe("Done"));
  expect(actions.complete).toHaveBeenCalledWith("slot", true);
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Bench press done."));
});

it("puts an exercise back, and says why, when completing it fails", async () => {
  actions.complete.mockResolvedValueOnce({ ok: false, error: "That session no longer exists." });
  renderLogger({ exercise: { sets: [saved] } });
  more("Complete");
  await screen.findByText("That session no longer exists.");
  await waitFor(() => expect(screen.queryByText("Done")).toBeNull());
  expect(entry("Set 2")).toBeTruthy();
});

it("takes Complete while the last set is still saving, and completes once the set has landed", async () => {
  const save = later<{ ok: true; set: SetVM }>();
  actions.log.mockReturnValueOnce(save.promise);
  actions.complete.mockResolvedValueOnce({ ok: true });
  renderLogger();
  saveFirstSet();
  press("Complete, skip, superset, substitute");
  const complete = screen.getByRole("button", { name: "Complete" }) as HTMLButtonElement;
  expect(complete.disabled).toBe(false);
  fireEvent.click(complete);
  await screen.findByRole("button", { name: "Completing…" });
  // Nothing is completed on the server before the set it depends on is there.
  expect(actions.complete).not.toHaveBeenCalled();
  await act(async () => save.answer({ ok: true, set: saved }));
  await screen.findByText("Done");
  expect(actions.complete).toHaveBeenCalledWith("slot", true);
});

it("keeps an exercise open when the set it was waiting on does not save", async () => {
  const save = later<{ ok: false; error: string }>();
  actions.log.mockReturnValueOnce(save.promise);
  renderLogger({ exercise: { sets: [{ ...saved, setIndex: 2, id: "set-2" }] } });
  saveFirstSet();
  more("Complete");
  await screen.findByRole("button", { name: "Completing…" });
  await act(async () =>
    save.answer({ ok: false, error: "Something went wrong. Please try again." }),
  );
  await screen.findByRole("button", { name: "Retry saving set 1" });
  expect(actions.complete).not.toHaveBeenCalled();
  expect(screen.queryByText("Done")).toBeNull();
  // The failed set holds changes nobody has saved, so it has to be dealt with first, and
  // Complete says so.
  press("Complete, skip, superset, substitute");
  const complete = screen.getByRole("button", { name: "Complete" }) as HTMLButtonElement;
  expect(complete.disabled).toBe(true);
  expect(complete.getAttribute("aria-describedby")).toBeTruthy();
  expect(document.getElementById(complete.getAttribute("aria-describedby")!)?.textContent).toBe(
    "Save the unsaved set first.",
  );
});

const programmeSlot: NonNullable<ExerciseVM["planned"]> = {
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
  targetLoadNote: "About 75% of your best.",
  progressionNotes: "Add 2.5 kg when every set reaches 5.",
  keyCue: "Pause on the chest.",
};

it("says the coach's numbers under the name when the coach planned the session", () => {
  renderLogger({
    exercise: {
      planned: programmeSlot,
      coachRestSeconds: 150,
      suggestion: {
        kind: "coach",
        basis: "exercise",
        reason: "Coach plan for today",
        advice: null,
        loadIncrement: 2.5,
        sets: [1, 2, 3].map((setIndex) => ({ ...saved, setIndex, weight: 60, reps: 5, rir: 2 })),
      },
    },
  });
  // The programme says 3–5 reps and 3–4 min; the coach wrote 5 reps and 150 s. The figures sit
  // in spans of their own (Figures), so the line is read whole.
  const meta = document.querySelector(".session-meta")?.textContent ?? "";
  expect(meta).toContain("5 reps");
  expect(meta).toContain("2.5 min");
  expect(meta).not.toContain("3–5 reps");
  expect(meta).not.toContain("3–4 min");
  // Off the Log tab, the line under the name gives the whole prescription.
  fireEvent.click(screen.getByRole("tab", { name: "Technique" }));
  expect(document.querySelector(".session-meta")?.textContent).toContain("60 kg · 3 × 5 @ 2 RIR");
});

it("shows the guide and the programme's cue in Technique, and none of the programme's notes", () => {
  renderLogger({
    exercise: {
      planned: { ...programmeSlot, plannedExerciseName: "Dumbbell bench press" },
      substitutionReason: "No free bench",
      guidance: {
        guide: {
          status: "published",
          setup: "Lie on the bench with your eyes under the bar.",
          steps: ["Unrack the bar.", "Lower it to your chest.", "Press it back up."],
          cues: ["Feet down.", "Wrists straight."],
          mistakes: ["Bouncing the bar.", "Flaring the elbows."],
        },
        logNote: "Log the bar and plates together.",
        notes: null,
        ownNotes: false,
        formUrl: null,
        demonstrations: [
          {
            title: "How to bench press",
            channel: "Coach Channel",
            url: "https://www.youtube.com/watch?v=abcdefghijk",
            status: "approved",
          },
        ],
      },
    },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Technique" }));
  const terms = screen.getAllByRole("term").map((term) => term.textContent);
  expect(terms).toEqual([
    "Setup",
    "Steps",
    "Cues",
    "Common mistakes",
    "How to log",
    "Programme cue",
  ]);
  expect(screen.getByText("Pause on the chest.")).toBeTruthy();
  // The programme's load and progression notes and the substitution reason leave the workout;
  // the line under the name already says what the exercise stands in for.
  expect(screen.queryByText("About 75% of your best.")).toBeNull();
  expect(screen.queryByText("Add 2.5 kg when every set reaches 5.")).toBeNull();
  expect(screen.queryByText("No free bench")).toBeNull();
  expect(screen.queryByText("No cues in the programme.")).toBeNull();
  expect(screen.getByText("instead of Dumbbell bench press")).toBeTruthy();
  expect(screen.getByRole("link", { name: /Watch demonstration/ }).getAttribute("href")).toBe(
    "https://www.youtube.com/watch?v=abcdefghijk",
  );
  expect(
    screen.getByRole("link", { name: "Open in the exercise library" }).getAttribute("href"),
  ).toBe("/exercises/bench");
});

it("says honestly when an exercise has no guide yet, keeping how to log it", () => {
  renderLogger({
    exercise: {
      guidance: {
        guide: null,
        logNote: "Load is per dumbbell.",
        notes: null,
        ownNotes: false,
        formUrl: null,
        demonstrations: [],
      },
    },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Technique" }));
  expect(screen.getByText("Guide not available yet.")).toBeTruthy();
  expect(screen.getByText("Load is per dumbbell.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open in the exercise library" })).toBeTruthy();
});

const asking = (kind: "confirm_basic" | "unknown"): ExerciseVM["decision"] => ({
  resolution: {
    status: "unknown",
    exercise: {
      id: "bench",
      slug: "bench",
      modality: "machine",
      loadPortability: "equipment_specific",
      requiresEquipment: true,
    },
    missingEquipmentTypeIds: ["hack"],
  } as NonNullable<ExerciseVM["decision"]>["resolution"],
  resolvedExerciseName: "Hack squat",
  fallbackOptions: [],
  missingTypes: [{ id: "hack", name: "Hack squat" }],
  ask: { kind, typeId: "hack", slug: "hack_squat", name: "Hack squat", art: null, family: null },
  machines: [],
});

it("holds Save while the machine question is open, and points at the question", () => {
  renderLogger({ exercise: { decision: asking("confirm_basic") } });
  const save = screen.getByRole("button", { name: "Save" });
  expect(save.getAttribute("aria-disabled")).toBe("true");
  expect(save.getAttribute("aria-describedby")).toBeTruthy();
  fireEvent.click(save);
  expect(actions.log).not.toHaveBeenCalled();
  expect(screen.getByRole("alert").textContent).toContain("Answer the machine question first.");
  expect(document.activeElement?.textContent).toBe("Is there a hack squat here?");
});

it("still takes the answer once a set is typed, so Save is never stuck behind it", () => {
  renderLogger({ exercise: { decision: asking("confirm_basic") } });
  // Typed first, as people do: Save waits for the answer, so the answer cannot wait for Save.
  fill({ Reps: "5", RIR: "2" });
  press("Save");
  expect(actions.log).not.toHaveBeenCalled();
  for (const name of ["Yes, it’s here", "Not here"])
    expect(screen.getByRole("button", { name }).hasAttribute("disabled")).toBe(false);
});

it("does not hold Save for a question about what an attached machine is used with", () => {
  renderLogger({
    exercise: {
      equipment: { id: "smith", name: "Garage Smith", unit: "kg", ladder: null },
      decision: asking("unknown"),
    },
  });
  // The machine is already on the exercise, so the bench question changes nothing recorded:
  // Save asks only for what any set needs.
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("alert").textContent).not.toContain("machine question");
});

it("lets Not sure release Save for a machine nobody has answered for", () => {
  renderLogger({ exercise: { decision: asking("unknown") } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("alert").textContent).toContain("or tap Not sure");
  fireEvent.click(screen.getByRole("button", { name: "Not sure" }));
  expect(screen.queryByText(/machine question/)).toBeNull();
  // Save now asks only for what any set needs: the effort.
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  expect(screen.getByRole("alert").textContent).not.toContain("machine question");
});
