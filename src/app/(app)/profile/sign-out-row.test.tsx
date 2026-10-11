// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { newDraft, readDrafts, saveDraft } from "@/lib/activity-drafts";

const mocks = vi.hoisted(() => ({ signOutAction: vi.fn(async () => {}) }));
vi.mock("@/server/actions/auth", () => ({ signOutAction: mocks.signOutAction }));

import { SignOutRow } from "./sign-out-row";

/**
 * AT-LIFE-06: signing out says what it will take with it, then clears this account's unsaved
 * activities and nobody else's. They used to stay on the device for the next person to read.
 */

const ALICE = "11111111-1111-4111-8111-111111111111";
const BOB = "22222222-2222-4222-8222-222222222222";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

function unsaved(userId: string) {
  saveDraft(localStorage, {
    ...newDraft({ userId, sport: "running", values: { distanceValue: "5" } }),
    dirtyFields: ["distanceValue"],
  });
}

it("asks first when unsaved activities would go, then clears only this account's", async () => {
  unsaved(ALICE);
  unsaved(BOB);
  render(
    <ul>
      <SignOutRow userId={ALICE} />
    </ul>,
  );

  fireEvent.click(screen.getByRole("button", { name: /Sign out/ }));
  expect(await screen.findByText(/An activity you have not saved/)).toBeTruthy();
  expect(mocks.signOutAction).not.toHaveBeenCalled();
  expect(readDrafts(localStorage, ALICE).drafts).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: /Sign out anyway/ }));
  await waitFor(() => expect(mocks.signOutAction).toHaveBeenCalled());
  expect(readDrafts(localStorage, ALICE).drafts).toEqual([]);
  expect(readDrafts(localStorage, BOB).drafts).toHaveLength(1);
});

it("signs out at once when nothing unsaved is kept", async () => {
  render(
    <ul>
      <SignOutRow userId={ALICE} />
    </ul>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(mocks.signOutAction).toHaveBeenCalled());
});
