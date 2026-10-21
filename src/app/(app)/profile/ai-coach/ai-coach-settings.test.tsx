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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  unstable_rethrow: () => {},
}));
afterEach(cleanup);

const note = () =>
  screen.getByRole("textbox", { name: "Notes for every programme" }) as HTMLTextAreaElement;

it("shows read-only memory and a separate empty message box without discarding prior notes", () => {
  render(
    <AiCoachSettings
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
          sport: "strength",
        },
      ]}
      overview="preference: Prefers dumbbells."
      attempts={[]}
    />,
  );
  // The coach files facts by category; the athlete reads the fact, a tap away, counted.
  const memory = screen.getByText("What the coach remembers").closest("details")!;
  expect(memory.open).toBe(false);
  expect(memory.textContent).toContain("Prefers dumbbells.");
  expect(screen.queryByText(/preference:/)).toBeNull();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(note().value).toBe("");
  // What they sent, folded and counted, each with the programme it was for.
  const sent = screen.getByText("Your notes").closest("details")!;
  expect(sent.open).toBe(false);
  expect(within(sent).getByText("2")).toBeTruthy();
  expect(sent.textContent).toContain("Prefer dumbbells.");
  expect(sent.textContent).toContain("Every programme");
  // A note that has not been read yet says so, in two words.
  expect(within(sent).getByText(/Not read yet/)).toBeTruthy();
  expect(
    within(sent).getByText(/Queued for your programme review — needs a new slot/),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();
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
  history: { requests: [], changes: [] },
  legacy: [],
  jobs: [],
  expiredJobs: false,
};
const baseProps = {
  enabled: true,
  status: null,
  noteId: "first",
  notes: [],
  overview: "",
  attempts: [],
  dashboard,
};

/** ADR 0058: a programme's own asks are its page's; this one is for every programme at once. */
it("is one column: no tabs, no programme picker, and a note for every programme", async () => {
  vi.mocked(saveCoachNotesAction).mockResolvedValueOnce({});
  render(<AiCoachSettings {...baseProps} />);
  expect(screen.queryByRole("tablist")).toBeNull();
  expect(screen.queryByRole("tab")).toBeNull();
  expect(screen.queryByRole("combobox")).toBeNull();
  expect(screen.getByRole("heading", { name: "Notes for every programme" })).toBeTruthy();
  fireEvent.change(note(), { target: { value: "I have less time next week." } });
  fireEvent.submit(note().closest("form")!);
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Note sent."));
  const submitted = vi.mocked(saveCoachNotesAction).mock.calls.at(-1)![1];
  expect(submitted.get("sport")).toBeNull();
  expect(submitted.get("userNotes")).toBe("I have less time next week.");
  expect(note().value).toBe("");
  // Starting a strength programme is New programme's, not a link of the coach's.
  expect(screen.queryByRole("link", { name: /strength programme|shared reports/i })).toBeNull();
  // Access for a coach of the athlete's own is a row of the coach's page.
  expect(screen.getByRole("link", { name: "Access tokens" }).getAttribute("href")).toBe(
    "/profile/coach",
  );
});

it("keeps the text and the retry id when a note fails to send", async () => {
  vi.mocked(saveCoachNotesAction).mockResolvedValueOnce({ formError: "Please retry." });
  const { container } = render(<AiCoachSettings {...baseProps} />);
  fireEvent.change(note(), { target: { value: "Move my long run" } });
  fireEvent.submit(note().closest("form")!);
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Please retry."));
  const submitted = vi.mocked(saveCoachNotesAction).mock.calls.at(-1)![1];
  expect(submitted.get("noteId")).toBe("first");
  expect(note().value).toBe("Move my long run");
  expect((container.querySelector('[name="noteId"]') as HTMLInputElement).value).toBe("first");
});

it("names each programme waiting for you by its state alone, and opens its page", () => {
  render(
    <AiCoachSettings
      {...baseProps}
      dashboard={{
        ...dashboard,
        proposals: [
          {
            id: "change",
            title: "Swaps the Thursday tempo for hills",
            sport: "running",
            kind: "change",
            fromCoach: true,
            status: "ready",
            rationale: null,
          },
          // The athlete's own edit is theirs, on the programme's page, not the coach's to report.
          {
            id: "edit",
            title: "Your edit",
            sport: "strength",
            kind: "change",
            fromCoach: false,
            status: "editing",
            rationale: null,
          },
          // A first programme of a sport with none yet has no page: its row opens its review.
          {
            id: "new",
            title: "Marathon build",
            sport: "cycling",
            kind: "programme",
            fromCoach: true,
            status: "ready",
            rationale: null,
          },
        ],
        requests: [
          {
            id: "question",
            sport: "strength",
            quote: "More core work",
            state: "needs_answer",
            detail: "Which day has the most time?",
            condition: "",
            reconsiderAfter: null,
            draftId: null,
          },
          {
            id: "asked",
            sport: "running",
            quote: "Fewer intervals",
            state: "needs_answer",
            detail: "From next week?",
            condition: "",
            reconsiderAfter: null,
            draftId: null,
          },
        ],
      }}
    />,
  );
  const section = screen.getByRole("heading", { name: "Waiting for you" }).closest("section")!;
  const rows = within(section).getAllByRole("link");
  expect(rows.map((row) => [row.textContent, row.getAttribute("href")])).toEqual([
    ["Strength programmeNeeds your answer", "/plan/strength?view=changes"],
    ["Running programmeNeeds your answer · Changes to review", "/plan/running"],
    ["Cycling programmeNew programme to review", "/plan/drafts/new"],
  ]);
  // Only the state: the question, the change and its title are the programme page's.
  expect(screen.queryByText("Which day has the most time?")).toBeNull();
  expect(screen.queryByText("Swaps the Thursday tempo for hills")).toBeNull();
  expect(screen.queryByRole("button", { name: "Send answer" })).toBeNull();
});

it("lists what the coach is working on, each opening its request", () => {
  render(
    <AiCoachSettings
      {...baseProps}
      dashboard={{
        ...dashboard,
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
          {
            id: "writing",
            sport: "cycling",
            scope: "programme",
            kind: "create_program",
            status: "queued",
            progress: "waiting",
            when: "Today",
            error: null,
          },
          {
            id: "review",
            sport: "running",
            scope: "programme",
            kind: "review_program",
            status: "claimed",
            progress: "working",
            when: "Today",
            error: null,
          },
          {
            id: "tonight",
            sport: "strength",
            scope: "programme",
            kind: "prepare_session",
            status: "queued",
            progress: "waiting",
            when: "Today",
            error: null,
          },
        ],
      }}
    />,
  );
  const section = screen.getByRole("heading", { name: "Working on" }).closest("section")!;
  const rows = within(section).getAllByRole("link");
  expect(rows.map((row) => [row.textContent, row.getAttribute("href")])).toEqual([
    ["New swimming programmeNeeds your answer", "/plan/requests/question"],
    // A new programme is being written, as Plan's card says it, however long it waits.
    ["New cycling programmeBeing written", "/plan/requests/writing"],
    ["Running programmeBeing reviewed", "/plan/requests/review"],
    // Nothing picks it up before the night: it does not claim to be under way.
    ["Next strength sessionNot started yet", "/plan/requests/tonight"],
  ]);
});

it("lists what the coach knows as facts, one a line", () => {
  render(
    <AiCoachSettings
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
  expect(screen.getByText("What the coach remembers").closest("details")!.textContent).toContain(
    "2",
  );
  expect(screen.queryByText(/read separately/)).toBeNull();
});

it("keeps a note being typed when the page is drawn again for the switch", () => {
  const props = {
    enabled: true,
    status: null,
    notes: [],
    overview: "",
    attempts: [],
  };
  const { container, rerender } = render(<AiCoachSettings {...props} noteId="first" />);
  fireEvent.change(note(), { target: { value: "Knee is sore after lunges." } });
  // Saving the switch refreshes the page, which comes back with a new id for the next note.
  rerender(<AiCoachSettings {...props} enabled={false} noteId="second" />);
  expect(note().value).toBe("Knee is sore after lunges.");
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
  expect(
    screen
      .getByRole("link", { name: /New running programme.*Could not finish/ })
      .getAttribute("href"),
  ).toBe("/plan/requests/failed");
  // What the worker wrote is for whoever runs the coach, not the athlete.
  expect(screen.queryByText(/audit worker/)).toBeNull();
  expect(screen.queryByText(/A run needs attention/)).toBeNull();
});

it("keeps the coach's recent attempts as a closed fold under what it is working on", () => {
  render(
    <AiCoachSettings
      {...baseProps}
      dashboard={null}
      attempts={[
        {
          id: "nightly",
          when: "Mon 19 Oct, 04:10",
          trigger: "Overnight",
          status: "Could not finish",
          gymName: "Anytime Fitness",
          error: "Routine timed out.",
        },
      ]}
    />,
  );
  const section = screen.getByRole("heading", { name: "Working on" }).closest("section")!;
  const activity = within(section).getByText("Coach activity").closest("details")!;
  expect(activity.open).toBe(false);
  expect(activity.textContent).toContain("Overnight · Could not finish");
  expect(activity.textContent).toContain("Anytime Fitness");
  // What the routine wrote stays folded under Details.
  expect(within(activity).getByText("Details").closest("details")!.open).toBe(false);
});
