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
  fireEvent.change(await screen.findByLabelText("Duration"), {
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
  // Typed as bare minutes, kept as the minutes it posts, and shown again as the clock writes it.
  expect((screen.getByLabelText("Duration") as HTMLInputElement).value).toBe("42:00");
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
  const input = await screen.findByLabelText("Duration");
  expect((input as HTMLInputElement).value).toBe("");
  fireEvent.change(input, { target: { value: "17" } });
  fireEvent.click(screen.getByRole("radio", { name: "3" }));
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await screen.findByText("Try again");
  first.unmount();
  render(<ActivityEditor {...props} action={async () => ({})} />);
  expect(((await screen.findByLabelText("Duration")) as HTMLInputElement).value).toBe("17:00");
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

it("keeps drafts separate when navigating to another sport on the same page", async () => {
  const action = vi.fn().mockResolvedValue({ formError: "Try again" });
  const editor = render(<ActivityEditor {...props} action={action} />);
  fireEvent.change(await screen.findByLabelText("Duration"), {
    target: { value: "42" },
  });
  await waitFor(() => expect(readDrafts(localStorage, props.userId).drafts).toHaveLength(1));
  editor.rerender(
    <ActivityEditor {...props} sport="running" submissionKey="running-key" action={action} />,
  );
  expect((screen.getByLabelText("Duration") as HTMLInputElement).value).toBe("");
  fireEvent.change(screen.getByLabelText("Duration"), {
    target: { value: "23" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await screen.findByText("Try again");
  expect(action.mock.calls[0]![1].get("submissionKey")).toBe("running-key");
  const drafts = readDrafts(localStorage, props.userId).drafts;
  expect(drafts.find((draft) => draft.sport === "cycling")?.values.minutes).toBe("42");
  expect(drafts.find((draft) => draft.sport === "running")?.values.minutes).toBe("23");
});

it("changes scheduled identity while retaining a draft through same-session refreshes", async () => {
  const action = vi.fn().mockResolvedValue({ formError: "Try again" });
  const occurrence = { id: "morning", revisionId: "original-revision" };
  const editor = render(<ActivityEditor {...props} occurrence={occurrence} action={action} />);
  fireEvent.change(await screen.findByLabelText("Duration"), {
    target: { value: "42" },
  });
  editor.rerender(
    <ActivityEditor
      {...props}
      occurrence={{ ...occurrence, revisionId: "new-revision" }}
      action={action}
    />,
  );
  expect((screen.getByLabelText("Duration") as HTMLInputElement).value).toBe("42");
  editor.rerender(
    <ActivityEditor
      {...props}
      occurrence={{ id: "evening", revisionId: "evening-revision" }}
      action={action}
    />,
  );
  expect((screen.getByLabelText("Duration") as HTMLInputElement).value).toBe("");
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await screen.findByText("Try again");
  expect(action.mock.calls[0]![1].get("occurrenceId")).toBe("evening");
  expect(action.mock.calls[0]![1].get("revisionId")).toBe("evening-revision");
});

/**
 * A draft abandoned on one day and reopened on another: the time it was begun at is not what
 * the athlete is logging, so an untouched start opens on now. It used to come back silently,
 * folded away, and file Thursday's run under Monday.
 */
it("reopens an abandoned log on now rather than on the day it was begun", async () => {
  saveDraft(localStorage, {
    ...newDraft({
      userId: props.userId,
      sport: "cycling",
      values: { ...props.initial, startedAt: "2026-09-19T07:10", minutes: "22" },
    }),
    dirtyFields: ["minutes"],
  });
  const action = vi.fn().mockResolvedValue({ formError: "Try again" });
  render(<ActivityEditor {...props} action={action} />);
  expect(await screen.findByText("Restored your unsaved activity from this device.")).toBeTruthy();
  expect((screen.getByLabelText("When") as HTMLInputElement).value).toBe("2026-09-22T06:00");
  fireEvent.click(screen.getByRole("radio", { name: "3" }));
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await screen.findByText("Try again");
  expect(action.mock.calls[0]![1].get("startedAt")).toBe("2026-09-22T06:00");
  expect(action.mock.calls[0]![1].get("minutes")).toBe("22");
});

it("keeps a start the athlete set, says so, and opens the details it is in", async () => {
  saveDraft(localStorage, {
    ...newDraft({
      userId: props.userId,
      sport: "cycling",
      values: { ...props.initial, startedAt: "2026-09-19T07:10", minutes: "22" },
    }),
    dirtyFields: ["startedAt", "minutes"],
  });
  const { container } = render(<ActivityEditor {...props} action={vi.fn()} />);
  expect(await screen.findByText(/It still says it started Sat 19 Sept 2026, 07:10/)).toBeTruthy();
  expect((screen.getByLabelText("When") as HTMLInputElement).value).toBe("2026-09-19T07:10");
  expect(container.querySelector("details")?.open).toBe(true);
});

it("keeps nothing once a change has been undone", async () => {
  render(<ActivityEditor {...props} action={vi.fn()} />);
  const duration = await screen.findByLabelText("Duration");
  fireEvent.change(duration, { target: { value: "42" } });
  await waitFor(() => expect(readDrafts(localStorage, props.userId).drafts).toHaveLength(1));
  fireEvent.change(duration, { target: { value: "" } });
  await waitFor(() => expect(readDrafts(localStorage, props.userId).drafts).toHaveLength(0));
  expect(screen.queryByText(/kept on this device/)).toBeNull();
});

it("shows a time held to the tenth as its page does, and keeps the tenth unless it is changed", async () => {
  const action = vi.fn().mockResolvedValue({ formError: "Try again" });
  const { container } = render(
    <ActivityEditor
      {...props}
      sport="running"
      activityId="run-1"
      expectedRevision={1}
      initial={{ ...props.initial, hours: "0", minutes: "32", seconds: "16.6", distanceUnit: "mi" }}
      action={action}
    />,
  );
  const duration = (await screen.findByLabelText("Duration")) as HTMLInputElement;
  // The run's page says 32:17; so does the form, rather than "32:16.6".
  expect(duration.value).toBe("32:17");
  const posted = () => new FormData(container.querySelector("form")!);
  // Correcting anything else leaves the time as it was stored.
  expect([posted().get("minutes"), posted().get("seconds")]).toEqual(["32", "16.6"]);
  fireEvent.change(duration, { target: { value: "32:20" } });
  expect([posted().get("minutes"), posted().get("seconds")]).toEqual(["32", "20"]);
});
