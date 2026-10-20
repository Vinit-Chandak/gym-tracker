// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AiCoachSettings } from "./ai-coach-settings";
import { saveCoachNotesAction } from "@/server/actions/coach";
import type { CoachDashboard } from "@/server/repositories/coach-dashboard";

vi.mock("@/server/actions/coach", () => ({
  saveCoachNotesAction: vi.fn(),
  setAiCoachEnabledAction: vi.fn(),
}));
vi.mock("@/server/actions/coaching-workflow", () => ({
  answerProgramRequestAction: vi.fn(),
  withdrawProgramRequestAction: vi.fn(),
  requestProgramReviewAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  unstable_rethrow: () => {},
}));
afterEach(cleanup);

it("shows read-only memory and a separate empty message box without discarding prior notes", () => {
  render(
    <AiCoachSettings
      workflow
      enabled
      status={null}
      noteId={crypto.randomUUID()}
      notes={[
        { id: "prior", text: "Prefer dumbbells.", when: "14 September", outcome: null },
        {
          id: "answered",
          text: "Can we add Bayesian curls?",
          when: "15 September",
          outcome: "Queued for your programme review — needs a new slot, so it goes to review.",
        },
      ]}
      overview="preference: Prefers dumbbells."
      attempts={[]}
    />,
  );
  // The coach files facts by category; the athlete reads the fact.
  expect(screen.getByText("Prefers dumbbells.")).toBeTruthy();
  expect(screen.queryByText(/preference:/)).toBeNull();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(
    (screen.getByRole("textbox", { name: "Notes for the coach" }) as HTMLTextAreaElement).value,
  ).toBe("");
  expect(screen.getByText("Prefer dumbbells.")).toBeTruthy();
  // A note that has not been read yet says so, in two words.
  expect(screen.getByText(/Not read yet/)).toBeTruthy();
  expect(screen.getByText(/Queued for your programme review — needs a new slot/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send note" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /save memory|add memory|remove item/i })).toBeNull();
});

const dashboard: CoachDashboard = {
  programmes: ["strength", "running"].map((sport) => ({
    id: sport,
    sport: sport as "strength" | "running",
    name: sport === "strength" ? "Build strength" : "My first 5K",
    pending: 0,
    review: { offered: false, canAsk: true, running: false, nextOn: null },
  })),
  proposals: [],
  requests: [],
  recentChanges: [],
  history: { requests: [], changes: [] },
  legacy: [],
  jobs: [],
  expiredJobs: false,
  waiting: 0,
};
const baseProps = {
  workflow: true,
  enabled: true,
  status: null,
  noteId: "first",
  notes: [],
  overview: "",
  attempts: [],
  dashboard,
};

it("opens a focused overview and preserves the draft and programme while changing tabs", () => {
  render(<AiCoachSettings {...baseProps} />);
  expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("coach-tab-overview");
  fireEvent.change(screen.getByLabelText("Which programme is this for?"), {
    target: { value: "running" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Notes for the coach" }), {
    target: { value: "Move my long run" },
  });
  fireEvent.click(screen.getByRole("tab", { name: "Notes & memory" }));
  expect(screen.queryByRole("textbox")).toBeNull();
  fireEvent.click(screen.getByRole("tab", { name: "Overview" }));
  expect((screen.getByLabelText("Which programme is this for?") as HTMLSelectElement).value).toBe(
    "running",
  );
  expect(
    (screen.getByRole("textbox", { name: "Notes for the coach" }) as HTMLTextAreaElement).value,
  ).toBe("Move my long run");
});

it("submits the selected programme and keeps text, scope and retry ID on failure", async () => {
  vi.mocked(saveCoachNotesAction).mockResolvedValueOnce({ formError: "Please retry." });
  const { container } = render(<AiCoachSettings {...baseProps} />);
  fireEvent.change(screen.getByLabelText("Which programme is this for?"), {
    target: { value: "running" },
  });
  const input = screen.getByRole("textbox", { name: "Notes for the coach" }) as HTMLTextAreaElement;
  fireEvent.change(input, { target: { value: "Move my long run" } });
  fireEvent.submit(input.closest("form")!);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Please retry."));
  const submitted = vi.mocked(saveCoachNotesAction).mock.calls.at(-1)![1];
  expect(submitted.get("sport")).toBe("running");
  expect(submitted.get("noteId")).toBe("first");
  expect(input.value).toBe("Move my long run");
  expect((screen.getByLabelText("Which programme is this for?") as HTMLSelectElement).value).toBe(
    "running",
  );
  expect((container.querySelector('[name="noteId"]') as HTMLInputElement).value).toBe("first");
});

it("uses keyboard tab navigation and does not mislabel new or past programmes with the active name", () => {
  render(
    <AiCoachSettings
      {...baseProps}
      dashboard={{
        ...dashboard,
        proposals: [
          {
            id: "new",
            title: "Marathon build",
            sport: "running",
            kind: "programme",
            fromCoach: true,
            status: "ready",
            rationale: null,
          },
        ],
        waiting: 1,
      }}
    />,
  );
  const overview = screen.getByRole("tab", { name: "Overview" });
  overview.focus();
  fireEvent.keyDown(overview, { key: "ArrowRight" });
  expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe("coach-tab-requests");
  const panel = within(screen.getByRole("tabpanel"));
  expect(
    panel
      .getByRole("link", { name: /Running.*Marathon build.*Review new programme/ })
      .getAttribute("href"),
  ).toBe("/profile/programme/drafts/new");
  expect(panel.queryByText("My first 5K")).toBeNull();
});

it("keeps coach questions that block programme creation visible in the inbox", () => {
  render(
    <AiCoachSettings
      {...baseProps}
      dashboard={{
        ...dashboard,
        waiting: 1,
        jobs: [
          {
            id: "question",
            sport: "swimming",
            scope: "programme",
            kind: "create_program",
            status: "needs_input",
            progress: null,
            when: "Today",
            error: null,
          },
        ],
      }}
    />,
  );
  fireEvent.click(screen.getByRole("tab", { name: /Requests & changes/ }));
  expect(
    screen
      .getByRole("link", { name: /Swimming.*Finish your programme brief/ })
      .getAttribute("href"),
  ).toBe("/profile/programme/jobs/question");
  expect(screen.queryByRole("heading", { name: "You’re all caught up" })).toBeNull();
});

it("lists what the coach knows as facts, one a line", () => {
  render(
    <AiCoachSettings
      workflow
      enabled
      status={null}
      noteId={crypto.randomUUID()}
      notes={[]}
      overview={"preference: Strength comes first.\ntrend: Easy runs finish short."}
      attempts={[]}
    />,
  );
  const memo = screen.getByText("Strength comes first.").closest("ul")!;
  expect([...memo.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
    "Strength comes first.",
    "Easy runs finish short.",
  ]);
  expect(screen.queryByText(/read separately/)).toBeNull();
});

it("keeps a note being typed when the page is drawn again for the switch", () => {
  const props = {
    workflow: true,
    enabled: true,
    status: null,
    notes: [],
    overview: "",
    attempts: [],
  };
  const { container, rerender } = render(<AiCoachSettings {...props} noteId="first" />);
  const note = screen.getByRole("textbox", { name: "Notes for the coach" }) as HTMLTextAreaElement;
  fireEvent.change(note, { target: { value: "Knee is sore after lunges." } });
  // Saving the switch refreshes the page, which comes back with a new id for the next note.
  rerender(<AiCoachSettings {...props} enabled={false} noteId="second" />);
  expect(
    (screen.getByRole("textbox", { name: "Notes for the coach" }) as HTMLTextAreaElement).value,
  ).toBe("Knee is sore after lunges.");
  // The note still goes under the id its form was opened with.
  expect((container.querySelector('input[name="noteId"]') as HTMLInputElement | null)?.value).toBe(
    "first",
  );
});

it("says what the coach could not finish in plain words, with the way to try again", () => {
  render(
    <AiCoachSettings
      {...baseProps}
      dashboard={{
        ...dashboard,
        jobs: [
          {
            id: "failed",
            sport: "running",
            scope: "programme",
            kind: "create_program",
            status: "failed",
            progress: null,
            when: "Today",
            error: "The local audit worker was unavailable.",
          },
        ],
      }}
    />,
  );
  const activity = screen.getByText("Coach activity").closest("details")!;
  expect(activity.textContent).toContain("1 could not finish");
  expect(
    screen
      .getByRole("link", { name: /The coach could not finish your programme.*Try again/ })
      .getAttribute("href"),
  ).toBe("/profile/programme/jobs/failed");
  // What the worker wrote is for whoever runs the coach, not the athlete.
  expect(screen.queryByText(/audit worker/)).toBeNull();
  expect(screen.queryByText(/A run needs attention/)).toBeNull();
});
