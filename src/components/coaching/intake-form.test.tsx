// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import { CoachIntakeForm } from "./intake-form";
import {
  createCoachProgramAction,
  removeCoachAttachmentAction,
  saveCoachIntakeAction,
} from "@/server/actions/coaching-workflow";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), unstable_rethrow: vi.fn() }));
vi.mock("@/server/actions/coaching-workflow", () => ({
  saveCoachIntakeAction: vi.fn(),
  createCoachProgramAction: vi.fn(),
  removeCoachAttachmentAction: vi.fn(),
}));
const id = "11111111-1111-4111-8111-111111111111";
const answered = {
  goal: "Improve strength",
  sessionsPerWeek: 3,
  minutesPerSession: 45,
  trainingLocation: "gym",
  heightCm: 178,
  weightKg: 74.5,
  ageYears: 31,
};
const answers = coachIntakeSchema.parse({
  ...answered,
  track: "detailed",
  prompt: "My detailed training brief.",
});
const props = {
  initial: { id, revision: 1, answers },
  reports: [],
  library: [],
  base: "/welcome/programme" as const,
  configured: true,
};
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  vi.mocked(saveCoachIntakeAction).mockImplementation(async (input, revision) => ({
    ok: true,
    value: {
      id,
      userId: id,
      sport: coachIntakeSchema.parse(input).programmeSport,
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

it("waits for change handlers before showing editable strength questions", () => {
  const html = renderToString(<CoachIntakeForm {...props} />);
  expect(html).toContain('role="status"');
  expect(html).not.toMatch(/<(?:input|textarea|select)[\s>]/);
});

it("asks which route you want before it asks anything else", async () => {
  render(
    <CoachIntakeForm
      {...props}
      initial={{ id, revision: 1, answers: coachIntakeSchema.parse({}) }}
    />,
  );
  expect(screen.getByText("Which sounds like you?")).toBeTruthy();
  expect(screen.queryByText("Days you can train")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Set it up in detail" }));
  await screen.findByLabelText("What are you training for?");
  await waitFor(() =>
    expect(saveCoachIntakeAction).toHaveBeenCalledWith(
      expect.objectContaining({ track: "detailed" }),
      1,
    ),
  );
});

it("keeps preview edits and navigation local without saving intake or requesting coaching", async () => {
  render(<CoachIntakeForm {...props} preview />);
  fireEvent.change(screen.getByLabelText("Your brief"), {
    target: { value: "Example edits must stay local." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Days you can train");
  expect(saveCoachIntakeAction).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Step 5 of 5: Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Create my programme" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Preview only");
  expect(createCoachProgramAction).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
});

it("creates a programme from the guided route without a session length", async () => {
  render(
    <CoachIntakeForm
      {...props}
      initial={{
        id,
        revision: 1,
        answers: coachIntakeSchema.parse({
          ...answered,
          track: "guided",
          minutesPerSession: null,
          preferredDays: [1, 3, 5],
        }),
      }}
    />,
  );
  // One screen: no steps to walk through, and the questions the detailed route asks are absent.
  expect(screen.queryByText("Step 1 of 5")).toBeNull();
  expect(screen.getByText("Days you can train")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Create my programme" }));
  await waitFor(() =>
    expect(createCoachProgramAction).toHaveBeenCalledWith(id, expect.any(String)),
  );
  expect(push).toHaveBeenCalledWith(`/welcome/programme/jobs/${id}`);
});

it("can request a programme while the starting point and reports are unknown", async () => {
  render(<CoachIntakeForm {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Step 5 of 5: Review" }));
  await screen.findByRole("button", { name: "Create my programme" });
  expect(screen.getByText("Not answered")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Create my programme" }));
  await waitFor(() =>
    expect(createCoachProgramAction).toHaveBeenCalledWith(id, expect.any(String)),
  );
  expect(push).toHaveBeenCalledWith(`/welcome/programme/jobs/${id}`);
});

it("names every answer a confirmed programme still needs", async () => {
  render(
    <CoachIntakeForm
      {...props}
      initial={{ id, revision: 1, answers: coachIntakeSchema.parse({ track: "detailed" }) }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Step 5 of 5: Review" }));
  fireEvent.click(await screen.findByRole("button", { name: "Create my programme" }));
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Tell the coach your main goal.");
  expect(alert.textContent).toContain("Add your height.");
  expect(createCoachProgramAction).not.toHaveBeenCalled();
});

it("saves the latest brief before leaving a step and shows a failed save", async () => {
  render(<CoachIntakeForm {...props} />);
  fireEvent.change(screen.getByLabelText("Your brief"), {
    target: { value: "Updated prompt with the user's own requirements." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Days you can train");
  expect(saveCoachIntakeAction).toHaveBeenCalledWith(
    expect.objectContaining({ prompt: "Updated prompt with the user's own requirements." }),
    1,
  );
  vi.mocked(saveCoachIntakeAction).mockResolvedValueOnce({
    ok: false,
    error: "Answers changed on another device.",
  });
  fireEvent.change(screen.getByLabelText("Usual session length (minutes)"), {
    target: { value: "30" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Answers changed on another device.",
  );
  expect((screen.getByLabelText("Usual session length (minutes)") as HTMLInputElement).value).toBe(
    "30",
  );
});

it("keeps the intake editable when an action response is lost", async () => {
  render(<CoachIntakeForm {...props} />);
  vi.mocked(saveCoachIntakeAction).mockRejectedValueOnce(new TypeError("Failed to fetch"));
  fireEvent.change(screen.getByLabelText("Your brief"), {
    target: { value: "Keep this unsaved brief." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect((await screen.findByRole("alert")).textContent).toContain("Connection lost");
  expect((screen.getByLabelText("Your brief") as HTMLTextAreaElement).value).toBe(
    "Keep this unsaved brief.",
  );
  expect((screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  expect(createCoachProgramAction).not.toHaveBeenCalled();
});

it("removes a retained report and its request reference before continuing", async () => {
  const report = {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Report.txt",
    mimeType: "text/plain",
    sizeBytes: 50,
  };
  render(
    <CoachIntakeForm
      {...props}
      initial={{ ...props.initial, answers: { ...answers, attachmentIds: [report.id] } }}
      reports={[report]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Step 4 of 5: Starting point" }));
  await screen.findByText("Report.txt");
  fireEvent.click(screen.getByRole("button", { name: "Remove Report.txt" }));
  await waitFor(() => expect(removeCoachAttachmentAction).toHaveBeenCalledWith(report.id));
  await waitFor(() => expect(screen.queryByText("Report.txt")).toBeNull());
  expect(saveCoachIntakeAction).toHaveBeenCalledWith(
    expect.objectContaining({ attachmentIds: [] }),
    1,
  );
});

it("starts from the answer given at setup, and still offers both routes from Back", async () => {
  render(
    <CoachIntakeForm
      {...props}
      initial={null}
      prefill={coachIntakeSchema.parse({ track: "guided" })}
    />,
  );
  expect(screen.queryByText("Which sounds like you?")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back" }));
  expect(await screen.findByText("Which sounds like you?")).toBeTruthy();
});

it("keeps the folded session strip's place beside Back, on every step and on either route", () => {
  const view = render(<CoachIntakeForm {...props} />);
  // The step's actions are this screen's pinned actions: at large text, while a workout is open,
  // the strip folds into them (rows.css), on the line Back has to itself, before Continue.
  const back = screen.getByRole("button", { name: "Back" });
  const kept = back.parentElement!;
  expect(kept.classList.contains("sticky-actions")).toBe(true);
  expect(back.nextElementSibling?.className).toBe("pinned-fold");
  expect(back.nextElementSibling?.nextElementSibling).toBe(
    screen.getByRole("button", { name: "Continue" }),
  );
  view.unmount();

  render(
    <CoachIntakeForm
      {...props}
      initial={null}
      prefill={coachIntakeSchema.parse({ track: "guided" })}
    />,
  );
  expect(screen.getByRole("button", { name: "Back" }).nextElementSibling?.className).toBe(
    "pinned-fold",
  );
});
