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

/**
 * ADR 0054: archiving closes the programme's sessions. One it still owes, or one skipped, can
 * only be logged on its own afterwards, and nothing reopens it, so the question says so before
 * it is answered (review of 12 October).
 */
it("asks before retiring, and says which sessions it closes", () => {
  render(<ProgrammeTools id="programme" />);
  fireEvent.click(screen.getByText("More options"));
  fireEvent.click(screen.getByRole("button", { name: "Retire programme: strength" }));
  expect(archived).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      /Retire your strength programme.*completed workouts remain in history.*unfinished or skipped sessions can then only be logged on their own.*Archived programmes/,
    ),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Retire this programme" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Keep it" })).toBeTruthy();
});

it("offers duplication without retirement for an archived programme", () => {
  render(<ProgrammeTools id="programme" sport="swimming" active={false} />);
  fireEvent.click(screen.getByText("More options"));
  expect(screen.getByRole("button", { name: "Duplicate programme" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: /Retire/ })).toBeNull();
});

it("keeps replacement separate from editing and preserves its sport", () => {
  render(<ProgrammeTools id="programme" sport="cycling" />);
  expect(screen.getByRole("button", { name: "Edit programme" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Replace programme" }).closest("details")?.open).toBe(
    false,
  );
  fireEvent.click(screen.getByText("More options"));
  expect(screen.getByRole("link", { name: "Replace programme" }).getAttribute("href")).toBe(
    "/training/programmes/new?sport=cycling",
  );
});
