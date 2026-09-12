// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { Proposals } from "./proposals";

const { actions } = vi.hoisted(() => ({
  actions: { apply: vi.fn(), reject: vi.fn() },
}));
vi.mock("@/server/actions/coach", () => ({
  applyProposalAction: (id: string) => actions.apply(id),
  rejectProposalAction: (id: string) => actions.reject(id),
}));

afterEach(() => {
  cleanup();
  actions.apply.mockReset();
  actions.reject.mockReset();
});

const proposal = {
  id: "proposal-1",
  summary: "Trim Upper A bench to three sets",
  rationale: "The day has run long every week.",
  lines: ["Bench press: 4 sets → 3 sets"],
  createdAt: "Sat 12 Sept, 11:02",
  fromCoach: true,
};

it("says which of the two buttons is working", async () => {
  let release: (value: { ok: true }) => void = () => {};
  actions.reject.mockReturnValue(new Promise((resolve) => (release = resolve)));
  render(<Proposals proposals={[proposal]} />);
  fireEvent.click(screen.getByRole("button", { name: "No thanks" }));
  // The very first pending render has to name the button the athlete pressed: a label that
  // corrects itself a tick later still shows "Applying…" on a dismissal.
  expect(screen.getByRole("button", { name: "Dismissing…" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();
  release({ ok: true });
  await waitFor(() => expect(actions.reject).toHaveBeenCalledWith("proposal-1"));
});

it("reports a refusal without leaving the buttons stuck", async () => {
  actions.apply.mockResolvedValue({ ok: false, error: "Finish the open session first." });
  render(<Proposals proposals={[proposal]} />);
  fireEvent.click(screen.getByRole("button", { name: "Apply" }));
  await waitFor(() =>
    expect(screen.getByRole("alert").textContent).toBe("Finish the open session first."),
  );
  expect(screen.getByRole("button", { name: "Apply" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "No thanks" })).toBeTruthy();
});
