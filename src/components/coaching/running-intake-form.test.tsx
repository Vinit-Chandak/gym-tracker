// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import {
  createCoachProgramAction,
  removeCoachAttachmentAction,
  saveCoachIntakeAction,
} from "@/server/actions/coaching-workflow";
import { RunningIntakeForm } from "./running-intake-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  unstable_rethrow: () => {},
}));
vi.mock("@/server/actions/coaching-workflow", () => ({
  saveCoachIntakeAction: vi.fn(),
  createCoachProgramAction: vi.fn(),
  removeCoachAttachmentAction: vi.fn(),
}));

const id = "11111111-1111-4111-8111-111111111111";
const history = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Strava export.csv",
  mimeType: "text/csv",
  sizeBytes: 900,
};
const plan = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Old marathon plan.pdf",
  mimeType: "application/pdf",
  sizeBytes: 4000,
};
const props = {
  prefill: coachIntakeSchema.parse({ programmeSport: "running" }),
  snapshot: { weeklyKm: 0, runsPerWeek: 0, longest: null, effort: null, days: [] },
  unit: "km" as const,
  today: "2026-10-21",
};

beforeEach(() => {
  vi.mocked(saveCoachIntakeAction).mockImplementation(async (input, revision) => ({
    ok: true,
    value: {
      id,
      userId: id,
      sport: "running",
      revision: (revision ?? 0) + 1,
      answers: coachIntakeSchema.parse(input),
      confirmedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  }));
  vi.mocked(createCoachProgramAction).mockResolvedValue({
    ok: true,
    value: { userId: id, jobId: id, created: true },
  });
  vi.mocked(removeCoachAttachmentAction).mockResolvedValue({ ok: true, value: undefined });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function answer() {
  fireEvent.change(screen.getByLabelText("What are you training for?"), {
    target: { value: "base" },
  });
  fireEvent.change(screen.getByLabelText("Runs a week"), { target: { value: "3" } });
}

/** The running answers the last save sent. */
function sentRunning() {
  const input = vi.mocked(saveCoachIntakeAction).mock.calls.at(-1)![0];
  return coachIntakeSchema.parse(input).sports[0]!;
}

it("waits for change handlers before showing editable coach questions", () => {
  const html = renderToString(
    <RunningIntakeForm {...props} initial={null} reports={[]} configured={false} />,
  );
  expect(html).toContain('role="status"');
  expect(html).not.toMatch(/<(?:input|textarea|select)[\s>]/);
});

it("saves partial answers without requiring a goal or training schedule", async () => {
  render(<RunningIntakeForm {...props} initial={null} reports={[]} configured={false} />);
  fireEvent.change(screen.getByLabelText("In your own words"), {
    target: { value: "Keep my partial running brief." },
  });
  const save = screen.getByRole("button", { name: "Save answers" });
  // JSDOM validates the form even for a formNoValidate submitter; the browser audit covers
  // the real click. Dispatch the resulting submit here to check the partial saved payload.
  expect(save).toHaveProperty("formNoValidate", true);
  fireEvent(
    save.closest("form")!,
    new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: save }),
  );
  await screen.findByText("Answers saved.");
  expect(saveCoachIntakeAction).toHaveBeenCalledWith(
    expect.objectContaining({
      programmeSport: "running",
      prompt: "Keep my partial running brief.",
      sessionsPerWeek: null,
    }),
    null,
  );
  expect(createCoachProgramAction).not.toHaveBeenCalled();
});

it("asks with the run history and plans ticked for this request", async () => {
  render(
    <RunningIntakeForm
      {...props}
      initial={{
        id,
        revision: 3,
        answers: coachIntakeSchema.parse({
          programmeSport: "running",
          attachmentIds: [history.id],
        }),
      }}
      reports={[history, plan]}
      configured
    />,
  );
  answer();
  expect(screen.getByRole("checkbox", { name: "Strava export.csv" })).toHaveProperty(
    "checked",
    true,
  );
  expect(screen.getByRole("checkbox", { name: "Old marathon plan.pdf" })).toHaveProperty(
    "checked",
    false,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: "Old marathon plan.pdf" }));
  fireEvent.click(screen.getByRole("button", { name: "Ask the coach for a programme" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/plan/requests/${id}`));
  expect(saveCoachIntakeAction).toHaveBeenCalledWith(
    expect.objectContaining({
      programmeSport: "running",
      attachmentIds: [history.id, plan.id],
    }),
    3,
  );
});

it("removes a kept file and leaves it out of the answers", async () => {
  render(
    <RunningIntakeForm
      {...props}
      initial={{
        id,
        revision: 1,
        answers: coachIntakeSchema.parse({
          programmeSport: "running",
          attachmentIds: [history.id],
        }),
      }}
      reports={[history]}
      configured
    />,
  );
  answer();
  fireEvent.click(screen.getByRole("button", { name: "Remove Strava export.csv" }));
  await waitFor(() => expect(screen.queryByText("Strava export.csv")).toBeNull());
  expect(removeCoachAttachmentAction).toHaveBeenCalledWith(history.id);
  fireEvent.click(screen.getByRole("button", { name: "Save answers" }));
  expect(await screen.findByText("Answers saved.")).toBeTruthy();
  expect(saveCoachIntakeAction).toHaveBeenCalledWith(
    expect.objectContaining({ attachmentIds: [] }),
    1,
  );
});

it("keeps the asking in view, and says when the coach is taking no new programmes", () => {
  render(<RunningIntakeForm {...props} initial={null} reports={[]} configured={false} />);
  const ask = screen.getByRole("button", { name: "Ask the coach for a programme" });
  expect(ask).toHaveProperty("disabled", true);
  expect(ask.closest(".pinned-actions")).not.toBeNull();
  expect(screen.getByText("The coach is not taking new programmes right now.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save answers" })).toHaveProperty("disabled", false);
});

it("shows what the coach asked on an earlier request", () => {
  render(
    <RunningIntakeForm
      {...props}
      initial={{
        id,
        revision: 1,
        answers: coachIntakeSchema.parse({
          programmeSport: "running",
          clarifications: [{ question: "Is the race hilly?", answer: "Rolling, two climbs." }],
        }),
      }}
      reports={[]}
      configured
    />,
  );
  expect(screen.getByText("What the coach asked")).toBeTruthy();
  expect(screen.getByText("Rolling, two climbs.")).toBeTruthy();
});

/**
 * ADR 0063: a runner's time is a limit on the days that have one, and none is required: with
 * none, the coach sizes each run. An older intake's minutes come back as each day's limit.
 */
it("asks without any time, and sends each day's limit where one is given", async () => {
  render(<RunningIntakeForm {...props} initial={null} reports={[]} configured />);
  answer();
  fireEvent.click(screen.getByRole("button", { name: "Ask the coach for a programme" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/plan/requests/${id}`));
  expect(sentRunning()).toMatchObject({
    minutesPerSession: null,
    running: { timeLimits: [], longRunMinutes: null },
  });

  fireEvent.change(screen.getByLabelText("Tuesday (minutes)"), { target: { value: "40" } });
  fireEvent.change(screen.getByLabelText("Thursday (minutes)"), { target: { value: "40" } });
  expect(screen.getByText("2 days")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Save answers" }));
  await screen.findByText("Answers saved.");
  expect(sentRunning().running?.timeLimits).toEqual([
    { day: 2, minutes: 40 },
    { day: 4, minutes: 40 },
  ]);
});

it("opens an older intake's minutes as the limit of every day but the long run's", () => {
  render(
    <RunningIntakeForm
      {...props}
      initial={{
        id,
        revision: 2,
        answers: coachIntakeSchema.parse({
          programmeSport: "running",
          sports: [
            {
              sport: "running",
              sessionsPerWeek: 4,
              preferredDays: [2, 4, 6, 7],
              minutesPerSession: 40,
              running: { goal: "base", longRunDay: 7 },
            },
          ],
        }),
      }}
      reports={[]}
      configured
    />,
  );
  expect(screen.getByLabelText("Tuesday (minutes)")).toHaveProperty("value", "40");
  expect(screen.getByLabelText("Saturday (minutes)")).toHaveProperty("value", "40");
  expect(screen.getByLabelText("Sunday (minutes)")).toHaveProperty("value", "");
  // Only the days they can run are asked.
  expect(screen.queryByLabelText("Monday (minutes)")).toBeNull();
});

it("starts the days from the logs, says so, and holds them to the runs a week", async () => {
  render(
    <RunningIntakeForm
      {...props}
      snapshot={{ ...props.snapshot, runsPerWeek: 3, days: [2, 4, 7] }}
      initial={null}
      reports={[]}
      configured
    />,
  );
  for (const day of ["Tuesday", "Thursday", "Sunday"])
    expect(screen.getByRole("button", { name: day })).toHaveProperty("ariaPressed", "true");
  expect(screen.getByText("From your logs")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("What are you training for?"), {
    target: { value: "base" },
  });
  fireEvent.change(screen.getByLabelText("Runs a week"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Ask the coach for a programme" }));
  expect(
    await screen.findByText("Choose at least 4 days you can run, or leave them empty."),
  ).toBeTruthy();
  expect(createCoachProgramAction).not.toHaveBeenCalled();
});

it("names a later race and asks for its date", async () => {
  render(<RunningIntakeForm {...props} initial={null} reports={[]} configured />);
  fireEvent.change(screen.getByLabelText("What are you training for?"), {
    target: { value: "race" },
  });
  fireEvent.change(screen.getByLabelText("Distance"), { target: { value: "half_marathon" } });
  fireEvent.change(screen.getByLabelText("Race date"), { target: { value: "2027-01-01" } });
  fireEvent.change(screen.getByLabelText("Runs a week"), { target: { value: "4" } });
  fireEvent.change(screen.getByLabelText("A later race"), { target: { value: "marathon" } });
  fireEvent.click(screen.getByRole("button", { name: "Save answers" }));
  expect(await screen.findByText("Choose the later race's date.")).toBeTruthy();
  expect(saveCoachIntakeAction).not.toHaveBeenCalled();

  fireEvent.change(screen.getByLabelText("Its date"), { target: { value: "2027-03-21" } });
  fireEvent.click(screen.getByRole("button", { name: "Save answers" }));
  await screen.findByText("Answers saved.");
  const input = coachIntakeSchema.parse(vi.mocked(saveCoachIntakeAction).mock.calls.at(-1)![0]);
  expect(input.sports[0]!.running?.nextRace).toEqual({
    raceDistance: "marathon",
    raceDistanceMetres: null,
    raceDate: "2027-03-21",
  });
  expect(input.goal).toContain("A later race: Marathon on");
});
