// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { newDraft, readDrafts, saveDraft } from "@/lib/activity-drafts";

const mocks = vi.hoisted(() => ({
  signOutAction: vi.fn<() => Promise<{ error?: string }>>(async () => ({})),
  replace: vi.fn(),
}));
vi.mock("@/server/actions/auth", () => ({ signOutAction: mocks.signOutAction }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  unstable_rethrow: () => {},
}));

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
  expect(await screen.findByText("Deletes 1 unsaved activity from this device.")).toBeTruthy();
  expect(mocks.signOutAction).not.toHaveBeenCalled();
  expect(readDrafts(localStorage, ALICE).drafts).toHaveLength(1);

  fireEvent.click(screen.getByRole("button", { name: /Sign out anyway/ }));
  await waitFor(() => expect(mocks.signOutAction).toHaveBeenCalled());
  expect(readDrafts(localStorage, ALICE).drafts).toEqual([]);
  expect(readDrafts(localStorage, BOB).drafts).toHaveLength(1);
  expect(mocks.replace).toHaveBeenCalledWith("/login");
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

it.each(["provider", "network"])(
  "keeps drafts and offers retry after a %s sign-out failure",
  async (failure) => {
    unsaved(ALICE);
    if (failure === "provider") {
      mocks.signOutAction.mockResolvedValueOnce({ error: "Could not sign out. Please retry." });
    } else {
      mocks.signOutAction.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    }
    render(
      <ul>
        <SignOutRow userId={ALICE} />
      </ul>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Sign out/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sign out anyway/ }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Could not sign out/),
    );
    expect(readDrafts(localStorage, ALICE).drafts).toHaveLength(1);
    expect(mocks.replace).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /Sign out anyway/ }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/login"));
    expect(readDrafts(localStorage, ALICE).drafts).toEqual([]);
  },
);
