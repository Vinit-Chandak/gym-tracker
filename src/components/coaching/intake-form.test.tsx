// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import { CoachIntakeForm } from "./intake-form";
import {
  createCoachProgramAction,
  removeCoachAttachmentAction,
  saveCoachIntakeAction,
} from "@/server/actions/coaching-workflow";
const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/server/actions/coaching-workflow", () => ({
  saveCoachIntakeAction: vi.fn(),
  createCoachProgramAction: vi.fn(),
  removeCoachAttachmentAction: vi.fn(),
}));
const id = "11111111-1111-4111-8111-111111111111",
  gymId = "22222222-2222-4222-8222-222222222222";
const answers = coachIntakeSchema.parse({
  goal: "Improve strength",
  sessionsPerWeek: 3,
  minutesPerSession: 45,
  reviewWeekday: 7,
  gymId,
  prompt: "My detailed training brief.",
});
const props = {
  initial: { id, revision: 1, answers },
  reports: [],
  gyms: [{ id: gymId, name: "My gym" }],
  machines: [],
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
it("can request a personalised programme while measurements and initial lifts are unknown", async () => {
  render(<CoachIntakeForm {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "6. Review" }));
  await screen.findByRole("button", { name: "Confirm and create my programme" });
  expect(screen.getByText("None attached")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Confirm and create my programme" }));
  await waitFor(() =>
    expect(createCoachProgramAction).toHaveBeenCalledWith(id, expect.any(String)),
  );
  expect(push).toHaveBeenCalledWith(`/welcome/programme/jobs/${id}`);
});
it("saves the latest detailed prompt before leaving a step and shows a failed save", async () => {
  render(<CoachIntakeForm {...props} />);
  fireEvent.change(screen.getByLabelText("Your full brief (optional)"), {
    target: { value: "Updated prompt with the user's own requirements." },
  });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  await screen.findByText("Rest day for your weekly review");
  expect(saveCoachIntakeAction).toHaveBeenCalledWith(
    expect.objectContaining({ prompt: "Updated prompt with the user's own requirements." }),
    1,
  );
  vi.mocked(saveCoachIntakeAction).mockResolvedValueOnce({
    ok: false,
    error: "Answers changed on another device.",
  });
  fireEvent.change(screen.getByLabelText("Usual minutes per session"), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Answers changed on another device.",
  );
  expect((screen.getByLabelText("Usual minutes per session") as HTMLInputElement).value).toBe("30");
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
  fireEvent.click(screen.getByRole("button", { name: "5. Reports" }));
  await screen.findByText("Report.txt");
  fireEvent.click(screen.getByRole("button", { name: "Remove file" }));
  await waitFor(() => expect(removeCoachAttachmentAction).toHaveBeenCalledWith(report.id));
  await waitFor(() => expect(screen.queryByText("Report.txt")).toBeNull());
  expect(saveCoachIntakeAction).toHaveBeenCalledWith(
    expect.objectContaining({ attachmentIds: [] }),
    1,
  );
});
