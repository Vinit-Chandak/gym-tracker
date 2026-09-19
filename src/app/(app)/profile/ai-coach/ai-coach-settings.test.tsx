// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AiCoachSettings } from "./ai-coach-settings";

vi.mock("@/server/actions/coach", () => ({
  saveCoachNotesAction: vi.fn(),
  setAiCoachEnabledAction: vi.fn(),
}));
vi.mock("@/server/actions/coaching-workflow", () => ({
  answerProgramRequestAction: vi.fn(),
  withdrawProgramRequestAction: vi.fn(),
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
      overviewUpdatedAt={null}
      attempts={[]}
    />,
  );
  expect(screen.getByText("preference: Prefers dumbbells.")).toBeTruthy();
  expect(screen.getAllByRole("textbox")).toHaveLength(1);
  expect(
    (screen.getByRole("textbox", { name: "Notes for the coach" }) as HTMLTextAreaElement).value,
  ).toBe("");
  expect(screen.getByText("Prefer dumbbells.")).toBeTruthy();
  // A note that has not been read yet says what it is waiting for, not merely that it waits.
  expect(screen.getByText(/Waiting for the next daily coach run/)).toBeTruthy();
  expect(screen.getByText(/Queued for your programme review — needs a new slot/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send note" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /save memory|add memory|remove item/i })).toBeNull();
});

it("asks the coach's question where it can be answered, and points at the rest", () => {
  render(
    <AiCoachSettings
      workflow
      enabled
      status={null}
      noteId={crypto.randomUUID()}
      notes={[]}
      overview=""
      overviewUpdatedAt={null}
      attempts={[]}
      questions={[
        {
          id: "11111111-1111-4111-8111-111111111111",
          summary: "More direct core work",
          quote: "and more direct core work please",
          state: "needs_answer",
          detail: "Which day has the most time to spare?",
          condition: "",
          reconsiderAfter: null,
          when: "19 September",
          draftId: null,
        },
      ]}
      openRequests={3}
    />,
  );
  expect(screen.getByText("More direct core work")).toBeTruthy();
  expect(screen.getByText("Which day has the most time to spare?")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send answer" })).toBeTruthy();
  // The answer waits for the scheduled run rather than starting one.
  expect(screen.getByText(/Saved for the next daily coach run/)).toBeTruthy();
  expect(screen.getByRole("link", { name: /What you asked for/ })).toBeTruthy();
});
