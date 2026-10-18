// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ACTIVITY_SPORTS } from "@/domain/activity";
import { ProgrammeCardActions } from "./programme-card-actions";

const mocks = vi.hoisted(() => ({ archive: vi.fn(), refresh: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks, unstable_rethrow: () => {} }));
vi.mock("@/server/actions/coaching-workflow", () => ({
  copyProgramAction: vi.fn(),
  archiveProgramAction: mocks.archive,
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it.each(ACTIVITY_SPORTS)(
  "retires only the selected %s programme after confirmation",
  async (sport) => {
    mocks.archive.mockResolvedValue({ ok: true, value: { id: `${sport}-plan` } });
    render(<ProgrammeCardActions id={`${sport}-plan`} sport={sport} />);
    expect(screen.getByRole("link", { name: "View programme" })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Edit ${sport} programme` })).toBeTruthy();
    const retire = screen.getByRole("button", { name: `Retire programme: ${sport}` });
    expect(retire.closest("details")).toBeNull();
    fireEvent.click(retire);
    expect(mocks.archive).not.toHaveBeenCalled();
    expect(screen.getByText(new RegExp(`Retire your ${sport} programme`))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retire this programme" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
    expect(mocks.archive).toHaveBeenCalledExactlyOnceWith(`${sport}-plan`);
    expect(screen.queryByRole("button", { name: "Retire this programme" })).toBeNull();
  },
);

it("lets a finished programme be kept without making a change", () => {
  render(<ProgrammeCardActions id="completed-plan" sport="cycling" finished />);
  expect(screen.queryByRole("button", { name: /Edit/ })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Retire programme: cycling" }));
  fireEvent.click(screen.getByRole("button", { name: "Keep it" }));
  expect(mocks.archive).not.toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Retire this programme" })).toBeNull();
});

it("prevents repeated confirmation while saving and retains a failed confirmation for retry", async () => {
  let finish!: (value: { ok: false; error: string }) => void;
  mocks.archive.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<ProgrammeCardActions id="strength-plan" sport="strength" />);
  fireEvent.click(screen.getByRole("button", { name: "Retire programme: strength" }));
  fireEvent.click(screen.getByRole("button", { name: "Retire this programme" }));
  expect(screen.getByRole("button", { name: "Retiring…" })).toHaveProperty("disabled", true);
  expect(screen.getByRole("button", { name: "Keep it" })).toHaveProperty("disabled", true);
  fireEvent.click(screen.getByRole("button", { name: "Retiring…" }));
  expect(mocks.archive).toHaveBeenCalledTimes(1);
  await act(async () => finish({ ok: false, error: "Finish your open workout first." }));
  expect(screen.getByRole("alert").textContent).toBe("Finish your open workout first.");
  expect(mocks.refresh).not.toHaveBeenCalled();
  mocks.archive.mockResolvedValue({ ok: true, value: { id: "strength-plan" } });
  fireEvent.click(screen.getByRole("button", { name: "Retire this programme" }));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalledOnce());
});

it("keeps the programme in place when the connection drops", async () => {
  mocks.archive.mockRejectedValue(new TypeError("Failed to fetch"));
  render(<ProgrammeCardActions id="swim-plan" sport="swimming" />);
  fireEvent.click(screen.getByRole("button", { name: "Retire programme: swimming" }));
  fireEvent.click(screen.getByRole("button", { name: "Retire this programme" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/Connection lost/);
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Retire this programme" })).toBeTruthy();
});
