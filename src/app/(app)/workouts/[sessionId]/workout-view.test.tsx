// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Route } from "next";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { setChangesMade } from "@/components/set-changes";

import type { ExerciseVM, SessionVM, SetVM } from "./view-model";
import { WorkoutView } from "./workout-view";

/** The innermost element whose whole text is `text`: a fact's figures stand in spans of their own. */
const whole = (text: string) => (_: string, element: Element | null) =>
  element?.textContent === text &&
  ![...element.children].some((child) => child.textContent === text);

const actions = vi.hoisted(() => ({ log: vi.fn(), remove: vi.fn() }));
// The exercise in focus is a search parameter moved with the History API; the hook reads it
// back from the address, as Next's does once it has seen the change.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
  unstable_rethrow: () => {},
}));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/sessions", () => ({
  logSetAction: actions.log,
  deleteSetAction: actions.remove,
  setExerciseCompletedAction: vi.fn(),
  skipExerciseAction: vi.fn(),
  applyFallbackAction: vi.fn(),
  setWarmupCompletedAction: vi.fn(),
  saveSupersetAction: vi.fn(),
  removeSupersetAction: vi.fn(),
}));

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

function workout(id: string, sets: SetVM[] = []): SessionVM {
  return {
    id,
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
    timeZone: "UTC",
    preferredUnit: "kg",
    exercises: [{ ...exercise, sets }],
  };
}

const saved: SetVM = {
  id: "set",
  setIndex: 1,
  setType: "working",
  weight: 60,
  unit: "kg",
  reps: 5,
  rir: 2,
  rpe: null,
  effortReported: true,
  durationSeconds: null,
  distanceMeters: null,
  completedAt: "2026-09-08T11:10:00.000Z",
};

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
  };
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  window.history.replaceState(null, "", "/workouts/session");
  localStorage.clear();
  actions.log.mockReset();
  actions.remove.mockReset();
});
afterEach(cleanup);

/** Types set 1's load, reps and RIR into the entry and presses Save. */
function enterFirstSet() {
  fireEvent.click(screen.getByRole("button", { name: /Type a load$/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Load in kilograms" }), {
    target: { value: "60" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Reps" }), { target: { value: "5" } });
  fireEvent.change(screen.getByRole("textbox", { name: "RIR" }), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
}
const LINE = "Set 1: 60 kilograms, 5 reps, 2 reps in reserve. Edit";
/** Back to the workout: the logger's back link names it (an unplanned session here). */
const BACK = "Unplanned session";

async function saveFirstSet() {
  enterFirstSet();
  await screen.findByRole("button", { name: LINE });
}

it("shows a saved set in the list, in the reopened exercise and on Back, without a new render", async () => {
  const rendered = workout(crypto.randomUUID());
  const seen = setChangesMade();
  const view = () => <WorkoutView session={rendered} seenSetChanges={seen} userId="user" />;
  actions.log.mockResolvedValue({ ok: true, set: saved });
  const page = render(view());
  // A row says where it stands only when that is news: nothing until a set is in.
  expect(screen.getByText("Free weights")).toBeTruthy();
  expect(screen.queryByText("Resume")).toBeNull();

  fireEvent.click(screen.getByRole("button", { name: /Bench press/ }));
  page.rerender(view());
  await saveFirstSet();

  fireEvent.click(screen.getByRole("button", { name: BACK }));
  page.rerender(view());
  expect(screen.getByText(whole("60 kg × 5"))).toBeTruthy();
  expect(screen.getByText("Resume")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: /Bench press/ }));
  page.rerender(view());
  expect(screen.getByRole("button", { name: LINE })).toBeTruthy();

  // Back to this page brings the same render out of the browser's copy.
  page.unmount();
  render(view());
  expect(screen.getAllByRole("button", { name: LINE })).toHaveLength(1);
  expect(screen.getByRole("region", { name: "Set 2" })).toBeTruthy();
});

it("takes a render that already holds the set as it is", async () => {
  const id = crypto.randomUUID();
  actions.log.mockResolvedValue({ ok: true, set: saved });
  const page = render(
    <WorkoutView session={workout(id)} seenSetChanges={setChangesMade()} userId="user" />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Bench press/ }));
  page.rerender(
    <WorkoutView session={workout(id)} seenSetChanges={setChangesMade()} userId="user" />,
  );
  await saveFirstSet();
  page.unmount();

  window.history.replaceState(null, "", "/workouts/session");
  render(
    <WorkoutView session={workout(id, [saved])} seenSetChanges={setChangesMade()} userId="user" />,
  );
  expect(screen.getByText(whole("60 kg × 5"))).toBeTruthy();
});

it("drops a deleted set from the list", async () => {
  const id = crypto.randomUUID();
  const rendered = workout(id, [saved]);
  const seen = setChangesMade();
  actions.remove.mockResolvedValue({ ok: true });
  window.history.replaceState(null, "", "/workouts/session?exercise=slot");
  const page = render(<WorkoutView session={rendered} seenSetChanges={seen} userId="user" />);
  fireEvent.click(screen.getByRole("button", { name: LINE }));
  fireEvent.click(screen.getByRole("button", { name: "Delete this set" }));
  fireEvent.click(screen.getByRole("button", { name: "Delete it" }));
  await vi.waitFor(() => expect(actions.remove).toHaveBeenCalledWith("slot", 1, saved.completedAt));
  await vi.waitFor(() => expect(setChangesMade()).toBeGreaterThan(seen));

  fireEvent.click(screen.getByRole("button", { name: BACK }));
  page.rerender(<WorkoutView session={rendered} seenSetChanges={seen} userId="user" />);
  expect(screen.queryByText(whole("60 kg × 5"))).toBeNull();
  expect(screen.queryByText("Resume")).toBeNull();
});

it("brings the list up to date when a save lands after the exercise was left", async () => {
  const rendered = workout(crypto.randomUUID());
  const seen = setChangesMade();
  let land!: (value: { ok: true; set: SetVM }) => void;
  actions.log.mockReturnValue(new Promise((resolve) => (land = resolve)));
  window.history.replaceState(null, "", "/workouts/session?exercise=slot");
  const page = render(<WorkoutView session={rendered} seenSetChanges={seen} userId="user" />);
  enterFirstSet();

  fireEvent.click(screen.getByRole("button", { name: BACK }));
  page.rerender(<WorkoutView session={rendered} seenSetChanges={seen} userId="user" />);
  expect(screen.queryByText("Resume")).toBeNull();
  await act(async () => land({ ok: true, set: saved }));
  expect(screen.getByText(whole("60 kg × 5"))).toBeTruthy();
});

it("opens a finished workout for changes within its week, and closes the edit in place (ADR 0049)", async () => {
  const rendered: SessionVM = {
    ...workout(crypto.randomUUID(), [saved]),
    completedAt: "2026-09-08T12:00:00.000Z",
    exercises: [
      { ...exercise, sets: [saved] },
      { ...exercise, id: "row", exercise: { ...exercise.exercise, id: "row", name: "Cable row" } },
    ],
  };
  const seen = setChangesMade();
  const view = (editUntil: string | null) => (
    <WorkoutView
      session={rendered}
      seenSetChanges={seen}
      userId="user"
      title="Upper A"
      backHref="/progress/history"
      editUntil={editUntil}
      addExerciseHref={"/workouts/session/add-exercise?from=history" as Route}
    />
  );
  window.history.replaceState(null, "", "/workouts/session?from=history");
  // Past its week, the record has no Edit.
  const page = render(view(null));
  expect(screen.getByText("Not done")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Edit workout" })).toBeNull();

  page.rerender(view("2026-09-15"));
  fireEvent.click(screen.getByRole("button", { name: "Edit workout" }));
  expect(window.location.search).toBe("?from=history&edit=1");
  page.rerender(view("2026-09-15"));
  expect(screen.getByText(/Each change saves as you make it, until Tue 15 Sept/)).toBeTruthy();
  // Every exercise opens, the one not done as well, and more can be added.
  expect(screen.getByRole("button", { name: /Cable row\s*No sets/ })).toBeTruthy();
  expect(screen.queryByText("Not done")).toBeNull();
  expect(screen.getByRole("link", { name: "Add exercise" }).getAttribute("href")).toBe(
    "/workouts/session/add-exercise?from=history",
  );

  // Opened, the exercise's set is a line that edits it, and Add set takes another.
  fireEvent.click(screen.getByRole("button", { name: /Bench press/ }));
  page.rerender(view("2026-09-15"));
  expect(screen.getByRole("button", { name: LINE })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add set" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: BACK }));
  page.rerender(view("2026-09-15"));

  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(window.location.search).toBe("?from=history");
  page.rerender(view("2026-09-15"));
  expect(screen.getByRole("button", { name: "Edit workout" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Add exercise" })).toBeNull();

  // Read only, the same exercise's line no longer opens it for changes.
  fireEvent.click(screen.getByRole("button", { name: /Bench press/ }));
  page.rerender(view("2026-09-15"));
  expect(screen.queryByRole("button", { name: LINE })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add set" })).toBeNull();
});
