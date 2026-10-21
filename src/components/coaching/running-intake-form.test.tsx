// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
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
  snapshot: { weeklyKm: 0, runsPerWeek: 0, longest: null, effort: null },
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
  fireEvent.change(screen.getByLabelText("Minutes on a usual run"), { target: { value: "40" } });
}

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
