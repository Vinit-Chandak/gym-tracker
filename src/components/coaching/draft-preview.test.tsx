// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { endurancePrescriptionSchema } from "@/domain/activity-prescription";
import { programBlueprintSchema } from "@/domain/program-blueprint";
import {
  askForFirstProgrammeChangesAction,
  saveProgramDraftAction,
} from "@/server/actions/coaching-workflow";
import type { ProgramDraft } from "@/server/repositories/program-drafts";

import { DraftPreview } from "./draft-preview";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  unstable_rethrow: () => {},
}));
vi.mock("@/server/actions/coaching-workflow", () => ({
  activateProgramDraftAction: vi.fn(),
  askForFirstProgrammeChangesAction: vi.fn(),
  rejectProgramDraftAction: vi.fn(),
  reviewProgramDraftAction: vi.fn(),
  saveProgramDraftAction: vi.fn(),
  saveStandaloneDraftAction: vi.fn(),
}));

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute("open");
      this.dispatchEvent(new Event("close"));
    },
  });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

const run = (sessionType: string, minutes: [number, number] | null = null) =>
  endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport: "running",
    sessionTargets: minutes
      ? { durationMs: [minutes[0] * 60_000, minutes[1] * 60_000], paceSecondsPerKm: [450, 530] }
      : { distanceMetres: [7000, 8000], paceSecondsPerKm: [450, 530] },
    running: { sessionType },
  });

/** A week and a half from Monday 26 October 2026: Tue, Thu and Sun, then a race on Friday. */
const blueprint = programBlueprintSchema.parse({
  blueprintVersion: 1,
  sport: "running",
  slug: "half",
  name: "Half marathon: 6 November 2026",
  weeks: 2,
  days: [],
  runs: [],
  startsOn: "2026-10-26",
  enduranceSessions: [
    [1, "easy", [30, 35]],
    [3, "easy", [30, 35]],
    [6, "long", null],
    [8, "easy", [30, 35]],
    [11, "race", null],
  ].map(([day, type, minutes]) => ({
    lineageId: crypto.randomUUID(),
    name: "",
    weekIndex: Math.floor((day as number) / 7) + 1,
    dayOffset: day,
    prescription: run(type as string, minutes as [number, number] | null),
  })),
});

const draft = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  source: "ai",
  sport: "running",
  standalone: false,
  savedSessionId: null,
  status: "ready",
  blueprint,
  openingPlan: null,
  jobId: null,
  intakeId: null,
  baseProgramId: null,
  sourceRevision: 1,
  revision: 1,
  headline: "",
  rationale: "Starts from your logged weeks.",
  uncertainties: ["Your maximum heart rate is estimated from your age."],
  toConfirm: ["Can the Sunday long run take up to 2 h 10 min?"],
  gateReasons: [],
  activatedProgramId: null,
  closedAs: null,
  closedAt: null,
  revisionNoteId: null,
  createdAt: new Date("2026-10-24"),
  updatedAt: new Date("2026-10-24"),
} as ProgramDraft;

function preview(today = "2026-10-24") {
  return render(
    <DraftPreview
      draft={draft}
      library={[]}
      today={today}
      base="/plan"
      stale={false}
      machines={[]}
      preferredUnit="kg"
      length="m"
    />,
  );
}

it("keeps a race plan's dates when it is started late, and says what it leaves out", () => {
  preview("2026-10-28");
  const start = screen.getByLabelText("Start date");
  expect(start).toHaveProperty("value", "2026-10-28");
  // Tuesday's run is behind the start; the race stays on Friday 6 November.
  expect(screen.getByText(/Leaves out 1 session before Wed\s28\sOct\./)).toBeTruthy();
  expect(start.getAttribute("max")).toBe("2026-11-06");
  // The first week keeps Thursday and Sunday: 35 minutes at 8:10 /km and 8 km, about 12.
  expect(screen.getByText(/^2 runs · ≈\s12\skm · 26\sOct$/)).toBeTruthy();
});

it("asks the coach's questions first, and sends the answers with Ask for changes", async () => {
  vi.mocked(askForFirstProgrammeChangesAction).mockResolvedValue({
    ok: true,
    value: { userId: draft.userId, jobId: "33333333-3333-4333-8333-333333333333", created: true },
  });
  preview();
  const asks = screen.getByRole("region", { name: "The coach asks" });
  expect(within(asks).getByText("Can the Sunday long run take up to 2 h 10 min?")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Ask for changes" }));
  const send = screen.getByRole("button", { name: "Send to the coach" });
  expect(send).toHaveProperty("disabled", true);
  fireEvent.change(screen.getByLabelText("Can the Sunday long run take up to 2 h 10 min?"), {
    target: { value: "Up to 90 minutes." },
  });
  fireEvent.click(send);
  await waitFor(() =>
    expect(push).toHaveBeenCalledWith("/plan/requests/33333333-3333-4333-8333-333333333333"),
  );
  expect(askForFirstProgrammeChangesAction).toHaveBeenCalledWith(draft.id, "", expect.any(String), [
    { question: "Can the Sunday long run take up to 2 h 10 min?", answer: "Up to 90 minutes." },
  ]);
});

it("moves every week's runs from one day to another, the race kept", async () => {
  vi.mocked(saveProgramDraftAction).mockImplementation(async (saved) => ({
    ok: true,
    value: { ...draft, blueprint: saved as typeof blueprint, revision: 2, status: "editing" },
  }));
  preview();
  expect(screen.getByText("Tue, Thu, Sun")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Change run days" }));
  fireEvent.change(screen.getByLabelText("Tuesday"), { target: { value: "4" } });
  expect(screen.getByText("Give each run day its own new day.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Thursday"), { target: { value: "5" } });
  fireEvent.change(screen.getByLabelText("Tuesday"), { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Move 3 sessions" }));
  await waitFor(() => expect(screen.getByText("Wed, Fri, Sun")).toBeTruthy());
  const [saved, id, revision] = vi.mocked(saveProgramDraftAction).mock.calls[0]!;
  expect([id, revision]).toEqual([draft.id, 1]);
  expect(
    (saved as typeof blueprint).enduranceSessions!.map((session) => session.dayOffset),
  ).toEqual([2, 4, 6, 9, 11]);
});
