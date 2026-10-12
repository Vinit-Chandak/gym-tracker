// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ProgrammeTools } from "./programme-tools";

const archived = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/coaching-workflow", () => ({
  copyProgramAction: vi.fn(),
  archiveProgramAction: archived,
}));
afterEach(cleanup);

/**
 * ADR 0054: archiving closes the programme's sessions. One it still owes, or one skipped, can
 * only be logged on its own afterwards, and nothing reopens it, so the question says so before
 * it is answered (review of 12 October).
 */
it("asks before archiving, and says which sessions it closes", () => {
  render(<ProgrammeTools id="programme" />);
  fireEvent.click(screen.getByRole("button", { name: "Archive programme" }));
  expect(archived).not.toHaveBeenCalled();
  expect(
    screen.getByText(
      "Archive this programme and stop scheduling its future sessions? Your completed workouts remain in history. Its sessions still owed or skipped can then only be logged on their own. You can duplicate the archived programme later.",
    ),
  ).toBeTruthy();
  expect(screen.getByRole("button", { name: "Archive this programme" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Keep it" })).toBeTruthy();
});
