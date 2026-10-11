// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { coachIntakeSchema } from "@/domain/coaching-workflow";

const actions = vi.hoisted(() => ({
  save: vi.fn(),
  create: vi.fn(),
  track: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/server/actions/coaching-workflow", () => ({
  saveCoachIntakeAction: actions.save,
  createCoachProgramAction: actions.create,
  chooseTrainingModeAction: actions.track,
}));
vi.mock("next/navigation", () => ({
  unstable_rethrow: () => {},
  useRouter: () => ({ push: actions.push, replace: vi.fn() }),
}));

import { SetupCoachForm } from "./setup-coach-form";

afterEach(() => {
  cleanup();
  for (const mock of Object.values(actions)) mock.mockReset();
});

const prefill = coachIntakeSchema.parse({
  track: "guided",
  trainingLocation: "gym",
  gymId: "00000000-0000-4000-8000-0000000000a1",
  runsPerWeek: 0,
});

function show(detailed = false) {
  render(
    <SetupCoachForm
      detailed={detailed}
      initial={null}
      prefill={{ ...prefill, track: detailed ? "detailed" : "guided" }}
      reports={[]}
      preferredUnit="kg"
      configured
      offerTracking={!detailed}
    />,
  );
}

/** Audit B12: the coach accepted nothing and said so only on Create, in one line at the foot. */
it("says what the coach still needs under each question, all at once", () => {
  show();
  fireEvent.click(screen.getByRole("button", { name: "Create my programme" }));
  const alerts = screen.getAllByRole("alert").map((alert) => alert.textContent);
  expect(alerts).toEqual([
    "Choose a goal.",
    "Choose the days you can train.",
    "Add your height, weight and age.",
  ]);
  expect(actions.save).not.toHaveBeenCalled();
  // Answering a question takes its sentence away.
  fireEvent.click(screen.getByRole("radio", { name: "Build muscle" }));
  expect(screen.queryByText("Choose a goal.")).toBeNull();
});

it("asks someone who already trains how long a session runs, and folds the rest away", () => {
  show(true);
  fireEvent.click(screen.getByRole("button", { name: "Create my programme" }));
  expect(screen.getByText("Choose how long a session.")).toBeTruthy();
  expect(screen.getByText("What you lift now")).toBeTruthy();
  expect(screen.getByText("Anything to avoid?")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Just log workouts for now" })).toBeNull();
});

it("saves the answers, asks the coach, and moves on to the writing screen", async () => {
  actions.save.mockResolvedValue({ ok: true, value: { id: "intake-1", revision: 1 } });
  actions.create.mockResolvedValue({ ok: true, value: { jobId: "job-1" } });
  show();
  fireEvent.click(screen.getByRole("radio", { name: "Build muscle" }));
  for (const day of ["Monday", "Wednesday", "Friday"])
    fireEvent.click(screen.getByRole("checkbox", { name: day }));
  fireEvent.change(screen.getByLabelText("Height"), { target: { value: "165" } });
  fireEvent.change(screen.getByLabelText("Weight"), { target: { value: "62" } });
  fireEvent.change(screen.getByLabelText("Age"), { target: { value: "29" } });
  fireEvent.click(screen.getByRole("button", { name: "Create my programme" }));
  await waitFor(() => expect(actions.push).toHaveBeenCalledWith("/welcome/programme/jobs/job-1"));
  expect(actions.save.mock.calls[0]![0]).toMatchObject({
    track: "guided",
    goal: "Build muscle",
    preferredDays: [1, 3, 5],
    sessionsPerWeek: 3,
    heightCm: 165,
    weightKg: 62,
    ageYears: 29,
    trainingLocation: "gym",
    runsPerWeek: 0,
  });
  expect(actions.create).toHaveBeenCalledWith("intake-1", expect.any(String));
});

it("lets a beginner log their own workouts instead", async () => {
  actions.track.mockResolvedValue({ ok: true, value: "user-1" });
  show();
  fireEvent.click(screen.getByRole("button", { name: "Just log workouts for now" }));
  await waitFor(() => expect(actions.push).toHaveBeenCalledWith("/today"));
  expect(actions.track).toHaveBeenCalledWith("track");
});
