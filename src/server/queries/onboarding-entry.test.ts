import { beforeEach, expect, it, vi } from "vitest";

const { state, programme, transaction, tx } = vi.hoisted(() => {
  const tx = {};
  return {
    state: vi.fn(),
    programme: vi.fn(),
    tx,
    transaction: vi.fn((_db: unknown, _id: string, run: (tx: unknown) => unknown) => run(tx)),
  };
});
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({ withUser: transaction }));
vi.mock("@/server/queries/setup-state", () => ({
  readSetupState: state,
  pendingFirstProgramme: programme,
}));

import { onboardingEntry } from "./onboarding-entry";

const place = { id: "gym-1", name: "Iron Temple", kind: "gym", equipmentCount: 0 };

beforeEach(() => {
  transaction.mockClear();
  state.mockReset();
  programme.mockReset();
  programme.mockResolvedValue(null);
});

/**
 * Setup's steps are sequential, so what has been saved says how far it got. Returning everyone
 * to the first step made them repeat themselves, and the gym step took the same name twice.
 */
it("starts at the first step until its two answers are saved", async () => {
  state.mockResolvedValue({ experience: null, sports: null, place: null });
  expect(await onboardingEntry("user-1", null)).toBe("/welcome");
  state.mockResolvedValue({ experience: "new", sports: null, place: null });
  expect(await onboardingEntry("user-1", "new")).toBe("/welcome");
  expect(transaction).toHaveBeenCalledWith({}, "user-1", expect.any(Function), { readOnly: true });
  expect(state).toHaveBeenCalledWith(tx, "user-1", "new");
});

it("asks a lifter where they train once the first step is answered", async () => {
  state.mockResolvedValue({ experience: "new", sports: ["strength"], place: null });
  expect(await onboardingEntry("user-1", "new")).toBe("/welcome/gym");
});

/**
 * Audit B4: a gym with no machines is what passing the optional equipment step with nothing
 * ticked leaves, so it is not a reason to be sent back to that step.
 */
it("goes on to the plan once there is a place, machines or none", async () => {
  state.mockResolvedValue({ experience: "experienced", sports: ["strength"], place });
  expect(await onboardingEntry("user-1", "experienced")).toBe("/welcome/programme");
});

it("comes back to a programme the coach is writing, or has written", async () => {
  state.mockResolvedValue({ experience: "new", sports: ["strength", "running"], place });
  programme.mockResolvedValue({ jobId: "job-1" });
  expect(await onboardingEntry("user-1", "new")).toBe("/welcome/programme/jobs/job-1");
  programme.mockResolvedValue({ draftId: "draft-1" });
  expect(await onboardingEntry("user-1", "new")).toBe("/welcome/programme/drafts/draft-1");
});

/** A swimmer's setup ends on its first step, so that is where an unfinished one resumes. */
it("never sends an account that does not lift to the gym steps", async () => {
  state.mockResolvedValue({ experience: "new", sports: ["swimming"], place: null });
  expect(await onboardingEntry("user-1", "new")).toBe("/welcome");
  expect(programme).not.toHaveBeenCalled();
});
