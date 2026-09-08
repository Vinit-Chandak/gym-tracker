// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { draftKey, writeDraft } from "@/lib/workout-drafts";
import { SessionView } from "./session-view";
import type { SessionVM, SetVM } from "./view-model";

const actions = vi.hoisted(() => ({ log: vi.fn(), remove: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/sessions", () => ({
  logSetAction: actions.log,
  deleteSetAction: actions.remove,
  setExerciseCompletedAction: vi.fn(),
  setWarmupCompletedAction: vi.fn(),
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
  unit: "kg",
  completedAt: "2026-09-08T12:00:00.000Z",
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
  warnings: [],
  timeZone: "Asia/Kolkata",
  exercises: [
    {
      id: "slot",
      orderIndex: 1,
      exercise: {
        id: "bench",
        name: "Bench press",
        slug: "bench",
        modality: "barbell",
        loadPortability: "global",
        requiresEquipment: true,
      },
      equipment: null,
      planned: null,
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
    },
  ],
};
beforeEach(() => {
  localStorage.clear();
  actions.log.mockReset();
  actions.remove.mockReset();
});
afterEach(cleanup);

it("removes the last unsaved row without leaving completion blocked", async () => {
  render(<SessionView session={session} userId="user" />);
  fireEvent.change(screen.getByRole("textbox", { name: "Reps" }), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Remove set 1" }));
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
  expect((screen.getByRole("textbox", { name: "Reps" }) as HTMLInputElement).value).toBe("");
  expect(screen.getByRole("link", { name: "Finish session" })).toBeTruthy();
});

it("retains unmatched drafts for review when the workout was finished elsewhere", async () => {
  writeDraft(localStorage, context, {
    setIndex: 1,
    setType: "working",
    weight: "65",
    reps: "5",
    rir: "2",
    duration: "",
    baseCompletedAt: null,
  });
  render(<SessionView userId="user" session={{ ...session, completedAt: saved.completedAt }} />);
  await screen.findByText(/This workout is finished, so these entries cannot be saved here/);
  expect(localStorage.getItem(draftKey(context))).toContain('"weight":"65"');
  fireEvent.click(screen.getByRole("button", { name: "Discard this local draft" }));
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
});

it("keeps edits through a failed save and a remount, then clears them only after a confirmed retry", async () => {
  actions.log.mockRejectedValueOnce(new Error("offline"));
  const view = render(<SessionView session={session} userId="user" />);
  fireEvent.change(screen.getByRole("textbox", { name: "kg" }), { target: { value: "60" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Reps" }), { target: { value: "5" } });
  fireEvent.change(screen.getByRole("textbox", { name: "RIR" }), { target: { value: "2" } });
  expect(localStorage.getItem(draftKey(context))).toContain('"weight":"60"');
  fireEvent.click(screen.getByRole("button", { name: "Log set" }));
  await screen.findByRole("button", { name: "Retry save" });
  expect(screen.getByRole("button", { name: "Save drafts first" })).toBeTruthy();
  view.unmount();
  render(<SessionView session={session} userId="user" />);
  await screen.findByText("Unsaved draft restored. Review and retry saving.");
  expect((screen.getByRole("textbox", { name: "kg" }) as HTMLInputElement).value).toBe("60");
  actions.log.mockResolvedValueOnce({ ok: true, set: saved });
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
  await screen.findByText("Saved ✓");
  expect(screen.getByRole("link", { name: "Finish session" })).toBeTruthy();
});

it("shows the next row immediately while a request is still in flight", async () => {
  let resolve!: (value: { ok: true; set: SetVM }) => void;
  actions.log.mockReturnValueOnce(
    new Promise((r) => {
      resolve = r;
    }),
  );
  render(<SessionView session={session} userId="user" />);
  fireEvent.change(screen.getByRole("textbox", { name: "Reps" }), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Log set" }));
  expect(screen.getByText("Set 2")).toBeTruthy();
  expect(screen.queryByText("Saved ✓")).toBeNull();
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
    baseCompletedAt: null,
  });
  render(
    <SessionView
      userId="user"
      session={{
        ...session,
        exercises: [{ ...session.exercises[0]!, sets: [{ ...saved, setIndex: 3 }] }],
      }}
    />,
  );
  await waitFor(() => expect(localStorage.getItem(draftKey(context))).toBeNull());
  expect(screen.getAllByText("Set 3")).toHaveLength(1);
  expect(screen.getByText("Set 4")).toBeTruthy();
});
