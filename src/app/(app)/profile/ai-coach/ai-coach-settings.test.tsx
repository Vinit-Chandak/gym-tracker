// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
