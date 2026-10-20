// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { RequestChange } from "./request-change";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/server/actions/coach", () => ({ saveCoachNotesAction: save }));
vi.mock("@/lib/offline-submit", () => ({
  keepsFormOnDisconnect: (action: unknown) => action,
}));

afterEach(() => {
  cleanup();
  save.mockReset();
});

const NOTE = "11111111-1111-4111-8111-111111111111";

function ask(text: string) {
  fireEvent.change(screen.getByLabelText("What should change?"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Send to the coach" }));
}

/** ADR 0058: a programme's page asks the coach for a change to that programme alone. */
it("sends the change for this programme, then starts the next as a note of its own", async () => {
  save.mockResolvedValue({});
  const { container } = render(<RequestChange sport="running" noteId={NOTE} />);
  ask("Move Thursday's session to Friday.");
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  const sent = save.mock.calls[0]![1] as FormData;
  expect([sent.get("noteId"), sent.get("sport"), sent.get("userNotes")]).toEqual([
    NOTE,
    "running",
    "Move Thursday's session to Friday.",
  ]);
  expect(await screen.findByText("Sent. The coach reads it at its next run.")).toBeTruthy();
  const next = container.querySelector<HTMLInputElement>('input[name="noteId"]')!.value;
  expect(next).not.toBe(NOTE);
  expect(next).toMatch(/^[0-9a-f-]{36}$/);
});

it("keeps a send that failed as the same note, with what was written", async () => {
  save.mockResolvedValue({
    formError: "Could not save your notes. Please retry.",
    values: { noteId: NOTE, sport: "running", userNotes: "Fewer intervals." },
  });
  const { container } = render(<RequestChange sport="running" noteId={NOTE} />);
  ask("Fewer intervals.");
  expect(await screen.findByText("Could not save your notes. Please retry.")).toBeTruthy();
  expect(container.querySelector<HTMLInputElement>('input[name="noteId"]')!.value).toBe(NOTE);
  expect((screen.getByLabelText("What should change?") as HTMLTextAreaElement).value).toBe(
    "Fewer intervals.",
  );
});
