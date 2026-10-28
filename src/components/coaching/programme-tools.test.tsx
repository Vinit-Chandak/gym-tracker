// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ProgrammeTools } from "./programme-tools";
import type { ReactNode } from "react";

const archived = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/coaching-workflow", () => ({
  copyProgramAction: vi.fn(),
  archiveProgramAction: archived,
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
afterEach(cleanup);
// jsdom has no modal dialogs: a sheet opens as an open <dialog>.
HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
  this.removeAttribute("open");
};

/**
 * ADR 0054: archiving closes the programme's sessions. One it still owes, or one skipped, can
 * only be logged on its own afterwards, and nothing reopens it, so the question says so before
 * it is answered (review of 12 October).
 */
it("asks before ending, and says which sessions it closes", () => {
  render(<ProgrammeTools id="programme" />);
  fireEvent.click(screen.getByRole("button", { name: "More options" }));
  fireEvent.click(screen.getByRole("button", { name: "End strength programme", hidden: true }));
  expect(archived).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      /End your strength programme\?.*from today on are removed.*not done can then only be logged as unplanned.*Everything you logged stays\./,
    ),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "End programme", hidden: true })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Keep it", hidden: true })).toBeTruthy();
});

it("offers duplication without ending for a past programme, as itself rather than in a sheet", () => {
  render(<ProgrammeTools id="programme" sport="swimming" active={false} />);
  expect(screen.queryByText("More options")).toBeNull();
  expect(screen.getByRole("button", { name: "Duplicate programme" }).closest("dialog")).toBeNull();
  expect(screen.queryByRole("button", { name: /End/, hidden: true })).toBeNull();
});

it("keeps replacement separate from editing, beside it one width, and preserves its sport", () => {
  render(<ProgrammeTools id="programme" sport="cycling" details={<p>Race on 1 January.</p>} />);
  const edit = screen.getByRole("button", { name: "Edit programme" });
  const more = screen.getByRole("button", { name: "More options" });
  // Peers on one row, one width each (DESIGN.md, The Equal Actions Rule).
  expect(edit.parentElement).toBe(more.parentElement);
  expect(edit.parentElement!.className).toContain("action-row");
  // Replacing, its notes and the rest wait in the sheet More options opens.
  const replace = screen.getByRole("link", { name: "Replace programme", hidden: true });
  expect(replace.closest("dialog")).not.toBeNull();
  fireEvent.click(more);
  expect(replace.getAttribute("href")).toBe("/plan/new?sport=cycling");
  expect(screen.getByText("Race on 1 January.")).toBeTruthy();
});
