// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AiCoachSettings } from "./ai-coach-settings";

vi.mock("@/server/actions/coach", () => ({
  saveCoachNotesAction: vi.fn(),
  setAiCoachEnabledAction: vi.fn(),
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
  expect(screen.getByText(/Waiting for coach/)).toBeTruthy();
  expect(screen.getByText(/Queued for your programme review — needs a new slot/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send note" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /save memory|add memory|remove item/i })).toBeNull();
});
