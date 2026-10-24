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

it("keeps button-only duration, distance and unit changes through reload", async () => {
  const action = vi.fn();
  const units = { distanceUnit: "mi", poolUnit: "yd" } as const;
  const first = render(<ActivityEditor {...props} units={units} action={action} />);
  fireEvent.click(await screen.findByRole("button", { name: "A minute more" }));
  fireEvent.click(screen.getByRole("button", { name: "More, 0.1 mi" }).querySelector("svg")!);
  fireEvent.click(screen.getByRole("button", { name: "Distance in mi. Change to km" }));
  await waitFor(() =>
    expect(readDrafts(localStorage, props.userId).drafts[0]?.values).toMatchObject({
      minutes: "1",
      distanceValue: "0.1",
      distanceUnit: "km",
    }),
  );
  first.unmount();
  render(<ActivityEditor {...props} units={units} action={action} />);
  expect(await screen.findByText(/^Draft restored/)).toBeTruthy();
  expect(screen.getByLabelText("Duration")).toHaveProperty("value", "1:00");
  expect(screen.getByLabelText("Distance")).toHaveProperty("value", "0.1");
  expect(screen.getByRole("button", { name: "Distance in km. Change to mi" })).toBeTruthy();
  expect(screen.getByLabelText("Elevation gain ft")).toBeTruthy();
});

it("keeps lap additions even when no field was typed", async () => {
  const action = vi.fn();
  const first = render(<ActivityEditor {...props} sport="running" action={action} />);
  fireEvent.click(await screen.findByText("Laps and intervals"));
  fireEvent.click(screen.getByRole("button", { name: "+ Rep" }));
  fireEvent.click(screen.getByRole("button", { name: "+ Recovery" }));
  await waitFor(() => {
    const value = readDrafts(localStorage, props.userId).drafts[0]?.values.laps;
    expect(value && JSON.parse(value)).toHaveLength(2);
  });
  first.unmount();
  render(<ActivityEditor {...props} sport="running" action={action} />);
  expect(await screen.findByText(/^Draft restored/)).toBeTruthy();
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});

it("recovers a backdated draft even after its actual training date was corrected", async () => {
  const initial = {
    ...props.initial,
    startedAt: "",
    entryDate: "2026-10-15",
    entryTime: "",
    latestDate: "2026-10-16",
  };
  const action = vi.fn().mockResolvedValue({ formError: "Try again" });
  const first = render(<ActivityEditor {...props} initial={initial} action={action} />);
  fireEvent.change(await screen.findByLabelText("Training date"), {
    target: { value: "2026-10-14" },
  });
  fireEvent.change(screen.getByLabelText(/^Start time/), { target: { value: "07:30" } });
  fireEvent.change(screen.getByLabelText("Duration"), { target: { value: "3000" } });
  await waitFor(() =>
    expect(readDrafts(localStorage, props.userId).drafts[0]?.values.entryContextDate).toBe(
      "2026-10-15",
    ),
  );
  first.unmount();
  render(<ActivityEditor {...props} initial={initial} action={action} />);
  expect(await screen.findByText(/^Draft restored/)).toBeTruthy();
  expect(screen.getByLabelText("Training date")).toHaveProperty("value", "2026-10-14");
  expect(screen.getByLabelText(/^Start time/)).toHaveProperty("value", "07:30");
  expect(screen.getByLabelText("Duration")).toHaveProperty("value", "30:00");
});

it("restores raw inputs and the retry key after unmount, then clears only on acknowledged save", async () => {
  const action = vi.fn().mockResolvedValue({ savedActivityId: "saved-id" });
  const first = render(<ActivityEditor {...props} action={action} />);
  fireEvent.change(await screen.findByLabelText("Duration"), {
    target: { value: "4200" },
  });
  fireEvent.click(screen.getByRole("radio", { name: "3" }));
  await waitFor(() =>
    expect(readDrafts(localStorage, props.userId).drafts[0]?.values.minutes).toBe("42"),
  );
  const stored = readDrafts(localStorage, props.userId).drafts[0]!;
  first.unmount();
  render(<ActivityEditor {...props} submissionKey="new-server-key" action={action} />);
  expect(await screen.findByText(/^Draft restored/)).toBeTruthy();
  // Typed in digits, kept as the minutes it posts, and shown again as the clock writes it.
  expect((screen.getByLabelText("Duration") as HTMLInputElement).value).toBe("42:00");
  fireEvent.click(screen.getByRole("button", { name: "Save activity" }));
  await waitFor(() =>
    // The record opens saying it was kept, with Undo for a new one.
    expect(mocks.replace).toHaveBeenCalledWith("/progress/activities/saved-id?saved=new"),
  );
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
  fireEvent.change(input, { target: { value: "1700" } });
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
    target: { value: "4200" },
  });
  await waitFor(() => expect(readDrafts(localStorage, props.userId).drafts).toHaveLength(1));
  editor.rerender(
    <ActivityEditor {...props} sport="running" submissionKey="running-key" action={action} />,
  );
  expect((screen.getByLabelText("Duration") as HTMLInputElement).value).toBe("");
  fireEvent.change(screen.getByLabelText("Duration"), {
    target: { value: "2300" },
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
    target: { value: "4200" },
  });
  editor.rerender(
    <ActivityEditor
      {...props}
      occurrence={{ ...occurrence, revisionId: "new-revision" }}
      action={action}
    />,
  );
  expect((screen.getByLabelText("Duration") as HTMLInputElement).value).toBe("42:00");
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
  expect(await screen.findByText("Draft restored.")).toBeTruthy();
  expect((screen.getByLabelText(/^When/) as HTMLInputElement).value).toBe("2026-09-22T06:00");
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
  expect(
    await screen.findByText(/^Draft restored, started Sat 19 Sept 2026, 07:10\./),
  ).toBeTruthy();
  expect((screen.getByLabelText(/^When/) as HTMLInputElement).value).toBe("2026-09-19T07:10");
  expect(container.querySelector("details")?.open).toBe(true);
});

it("keeps nothing once a change has been undone", async () => {
  render(<ActivityEditor {...props} action={vi.fn()} />);
  const duration = await screen.findByLabelText("Duration");
  fireEvent.change(duration, { target: { value: "42" } });
  await waitFor(() => expect(readDrafts(localStorage, props.userId).drafts).toHaveLength(1));
  fireEvent.change(duration, { target: { value: "" } });
  await waitFor(() => expect(readDrafts(localStorage, props.userId).drafts).toHaveLength(0));
  expect(screen.queryByText(/Draft kept/)).toBeNull();
});

it("says in two words that a draft is kept, and discards it on a tap", async () => {
  render(<ActivityEditor {...props} action={vi.fn()} />);
  fireEvent.change(await screen.findByLabelText("Duration"), { target: { value: "42" } });
  expect(await screen.findByText("Draft kept")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Discard draft" }));
  await waitFor(() => expect(readDrafts(localStorage, props.userId).drafts).toHaveLength(0));
  expect(screen.queryByText("Draft kept")).toBeNull();
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

it("opens a correction in the athlete's own units, and changes nothing that is not changed", async () => {
  // A run entered as 7.2 km and 89 m of climb, corrected by someone who runs in miles.
  const { container } = render(
    <ActivityEditor
      {...props}
      sport="running"
      activityId="run-1"
      expectedRevision={1}
      units={{ distanceUnit: "mi", poolUnit: "yd" }}
      initial={{
        ...props.initial,
        distanceValue: "7.2",
        distanceUnit: "km",
        elevationGainMetres: "89",
        minutes: "40",
      }}
      action={vi.fn()}
    />,
  );
  expect(((await screen.findByLabelText("Distance")) as HTMLInputElement).value).toBe("4.47");
  expect((screen.getByLabelText("Elevation gain ft") as HTMLInputElement).value).toBe("292");
  const posted = new FormData(container.querySelector("form")!);
  expect([posted.get("distanceValue"), posted.get("distanceUnit")]).toEqual(["7.2", "km"]);
  expect(posted.get("elevationGainMetres")).toBe("89");
  // Opening it keeps no draft: nothing was changed.
  expect(readDrafts(localStorage, props.userId).drafts).toHaveLength(0);
});
