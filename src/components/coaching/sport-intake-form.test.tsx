// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import {
  createCoachProgramAction,
  saveCoachIntakeAction,
} from "@/server/actions/coaching-workflow";
import { SportIntakeForm } from "./sport-intake-form";

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
const plan = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Pool plan.pdf",
  mimeType: "application/pdf",
  sizeBytes: 900,
};
const export_ = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Watch export.csv",
  mimeType: "text/csv",
  sizeBytes: 400,
};

beforeEach(() => {
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
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

function answer(sport: "cycling" | "swimming") {
  const words =
    sport === "cycling"
      ? { perWeek: "Rides a week", minutes: "Minutes on a usual ride" }
      : { perWeek: "Swims a week", minutes: "Minutes on a usual swim" };
  fireEvent.change(screen.getByLabelText("What are you training for?"), {
    target: { value: "An autumn sportive" },
  });
  fireEvent.change(screen.getByLabelText(words.perWeek), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText(words.minutes), { target: { value: "40" } });
}

it("keeps typed answers when a save loses its connection", async () => {
  vi.mocked(saveCoachIntakeAction).mockRejectedValue(new TypeError("Failed to fetch"));
  render(
    <SportIntakeForm
      sport="cycling"
      initial={null}
      prefill={coachIntakeSchema.parse({ programmeSport: "cycling" })}
      reports={[]}
      configured
    />,
  );
  answer("cycling");
  fireEvent.click(screen.getByRole("button", { name: "Save answers" }));
  await screen.findByText(/Connection lost/);
  expect(screen.getByLabelText("What are you training for?")).toHaveProperty(
    "value",
    "An autumn sportive",
  );
  expect(screen.getByLabelText("Rides a week")).toHaveProperty("value", "3");
  expect(screen.queryByLabelText("Height (cm)")).toBeNull();
  await waitFor(() =>
    expect(saveCoachIntakeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        programmeSport: "cycling",
        scope: "programme",
        sessionsPerWeek: 3,
        sports: [expect.objectContaining({ sport: "cycling", sessionsPerWeek: 3 })],
      }),
      null,
    ),
  );
});

it("carries where you are now, the days and the ticked files with the answers", async () => {
  render(
    <SportIntakeForm
      sport="swimming"
      initial={{
        id,
        revision: 2,
        answers: coachIntakeSchema.parse({
          programmeSport: "swimming",
          attachmentIds: [plan.id],
        }),
      }}
      prefill={coachIntakeSchema.parse({ programmeSport: "swimming" })}
      reports={[plan, export_]}
      configured
    />,
  );
  answer("swimming");
  expect(screen.getByRole("checkbox", { name: "Pool plan.pdf" })).toHaveProperty("checked", true);
  fireEvent.click(screen.getByRole("checkbox", { name: "Watch export.csv" }));
  fireEvent.click(screen.getByRole("button", { name: "Monday" }));
  fireEvent.click(screen.getByRole("button", { name: "Thursday" }));
  fireEvent.change(screen.getByLabelText("What you swim now"), {
    target: { value: "2,000 m twice a week" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save answers" }));
  expect(await screen.findByText("Answers saved.")).toBeTruthy();
  expect(saveCoachIntakeAction).toHaveBeenCalledWith(
    expect.objectContaining({
      programmeSport: "swimming",
      recentTraining: "2,000 m twice a week",
      attachmentIds: [plan.id, export_.id],
      sports: [expect.objectContaining({ sport: "swimming", preferredDays: [1, 4] })],
    }),
    2,
  );
});

it("adds a file, ticks it for this request and asks with it", async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ file: export_ }),
  });
  vi.stubGlobal("fetch", fetch);
  render(
    <SportIntakeForm
      sport="cycling"
      initial={null}
      prefill={coachIntakeSchema.parse({ programmeSport: "cycling" })}
      reports={[]}
      configured
    />,
  );
  answer("cycling");
  const file = new File(["date,km\n2026-10-01,40\n"], "Watch export.csv", { type: "" });
  fireEvent.change(screen.getByLabelText(/Reports and plans/), { target: { files: [file] } });
  const ticked = await screen.findByRole("checkbox", { name: "Watch export.csv" });
  expect(ticked).toHaveProperty("checked", true);
  // A browser that names no type for an export still sends the right one, from its suffix.
  expect(fetch).toHaveBeenCalledWith(
    "/api/coaching/attachments",
    expect.objectContaining({ headers: expect.objectContaining({ "Content-Type": "text/csv" }) }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Ask the coach for a programme" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith(`/plan/requests/${id}`));
  expect(saveCoachIntakeAction).toHaveBeenCalledWith(
    expect.objectContaining({ attachmentIds: [export_.id] }),
    null,
  );
  expect(createCoachProgramAction).toHaveBeenCalledWith(id, expect.any(String));
});

it("refuses a sixth file for one request before uploading anything", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(
    <SportIntakeForm
      sport="cycling"
      initial={null}
      prefill={coachIntakeSchema.parse({ programmeSport: "cycling" })}
      reports={[]}
      configured
    />,
  );
  const six = Array.from({ length: 6 }, (_, i) => new File(["x"], `ride-${i}.txt`));
  fireEvent.change(screen.getByLabelText(/Reports and plans/), { target: { files: six } });
  expect(await screen.findByText("Attach up to five files.")).toBeTruthy();
  expect(fetch).not.toHaveBeenCalled();
  // Any other answer changed, the failure is history.
  answer("cycling");
  expect(screen.queryByText("Attach up to five files.")).toBeNull();
});

it("says the coach is taking no new programmes, and still saves the answers", async () => {
  render(
    <SportIntakeForm
      sport="swimming"
      initial={null}
      prefill={coachIntakeSchema.parse({ programmeSport: "swimming" })}
      reports={[]}
      configured={false}
    />,
  );
  expect(screen.getByText("The coach is not taking new programmes right now.")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Ask the coach for a programme" })).toHaveProperty(
    "disabled",
    true,
  );
  answer("swimming");
  fireEvent.click(screen.getByRole("button", { name: "Save answers" }));
  expect(await screen.findByText("Answers saved.")).toBeTruthy();
  expect(createCoachProgramAction).not.toHaveBeenCalled();
});

it("shows what the coach asked, with the answers given", () => {
  render(
    <SportIntakeForm
      sport="cycling"
      initial={{
        id,
        revision: 1,
        answers: coachIntakeSchema.parse({
          programmeSport: "cycling",
          clarifications: [{ question: "Do you ride with power?", answer: "No, heart rate." }],
        }),
      }}
      prefill={coachIntakeSchema.parse({ programmeSport: "cycling" })}
      reports={[]}
      configured
    />,
  );
  expect(screen.getByText("What the coach asked")).toBeTruthy();
  expect(screen.getByText("1 answered")).toBeTruthy();
  expect(screen.getByText("No, heart rate.")).toBeTruthy();
});
