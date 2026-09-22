// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ActivityEditor } from "./activity-editor";
import { newDraft, readDrafts, saveDraft } from "@/lib/activity-drafts";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => mocks, unstable_rethrow: () => {} }));
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});
const props = {
  userId: "athlete-a",
  sport: "cycling" as const,
  initial: { startedAt: "2026-09-22T06:00", minutes: "", effort: "", distanceUnit: "mi" },
  submissionKey: "11111111-1111-4111-8111-111111111111",
  submitLabel: "Save activity",
};

it("restores raw inputs and the retry key after unmount, then clears only on acknowledged save", async () => {
  const action = vi.fn().mockResolvedValue({ savedActivityId: "saved-id" });
  const first = render(<ActivityEditor {...props} action={action} />);
  fireEvent.change(await screen.findByLabelText("Minutes", { exact: true }), {
    target: { value: "42" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "3" }));
  await waitFor(() =>
    expect(readDrafts(localStorage, props.userId).drafts[0]?.values.minutes).toBe("42"),
  );
  const stored = readDrafts(localStorage, props.userId).drafts[0]!;
  first.unmount();
  render(<ActivityEditor {...props} submissionKey="new-server-key" action={action} />);
  expect(await screen.findByText(/Restored your unsaved/)).toBeTruthy();
  expect((screen.getByLabelText("Minutes", { exact: true }) as HTMLInputElement).value).toBe("42");
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/training/activities/saved-id"));
  expect(action.mock.calls[0]![1].get("submissionKey")).toBe(stored.submissionKey);
  expect(readDrafts(localStorage, props.userId).drafts).toHaveLength(0);
});

it("keeps a failed save through reload without exposing another account's draft", async () => {
  const other = {
    ...newDraft({ userId: "athlete-b", sport: "cycling", values: { minutes: "99" } }),
    dirtyFields: ["minutes"],
  };
  saveDraft(localStorage, other);
  const first = render(
    <ActivityEditor {...props} action={async () => ({ formError: "Try again" })} />,
  );
  const input = await screen.findByLabelText("Minutes", { exact: true });
  expect((input as HTMLInputElement).value).toBe("");
  fireEvent.change(input, { target: { value: "17" } });
  fireEvent.click(screen.getByRole("radio", { name: "3" }));
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await screen.findByText("Try again");
  first.unmount();
  render(<ActivityEditor {...props} action={async () => ({})} />);
  expect(
    ((await screen.findByLabelText("Minutes", { exact: true })) as HTMLInputElement).value,
  ).toBe("17");
  expect(readDrafts(localStorage, "athlete-b").drafts).toHaveLength(1);
});

it("restores the opening revision, so reloading a stale edit cannot silently overwrite newer work", async () => {
  const draft = {
    ...newDraft({
      userId: props.userId,
      sport: "cycling",
      activityId: "ride",
      expectedRevision: 1,
      values: { ...props.initial, minutes: "22" },
    }),
    dirtyFields: ["minutes"],
  };
  saveDraft(localStorage, draft);
  const action = vi.fn().mockResolvedValue({ formError: "Changed elsewhere" });
  render(<ActivityEditor {...props} activityId="ride" expectedRevision={2} action={action} />);
  fireEvent.click(await screen.findByRole("radio", { name: "3" }));
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await screen.findByText("Changed elsewhere");
  expect(action.mock.calls[0]![1].get("expectedRevision")).toBe("1");
});
