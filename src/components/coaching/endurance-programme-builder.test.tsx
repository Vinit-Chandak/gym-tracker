// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { EnduranceProgrammeBuilder } from "./endurance-programme-builder";
import { endurancePrescriptionSchema } from "@/domain/activity-prescription";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { DEFAULT_SPORT_UNITS } from "@/lib/distance-units";
import { saveProgramDraftAction } from "@/server/actions/coaching-workflow";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/server/actions/coaching-workflow", () => ({
  saveProgramDraftAction: vi.fn(),
  reviewProgramDraftAction: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function blueprint(offsets = [0, 7, 14], progressive = false): ProgramBlueprint {
  return {
    blueprintVersion: 1,
    sport: "running",
    slug: "run-plan",
    name: "Running plan",
    weeks: 4,
    notes: "",
    days: [],
    runs: [],
    enduranceSessions: offsets.map((dayOffset, index) => ({
      lineageId: crypto.randomUUID(),
      name: "Easy run",
      weekIndex: Math.floor(dayOffset / 7) + 1,
      dayOffset,
      scheduledLocalTime: null,
      prescription: endurancePrescriptionSchema.parse({
        prescriptionVersion: 1,
        sport: "running",
        sessionTargets: {
          durationMs: [
            1800000 + (progressive ? index * 60000 : 0),
            1800000 + (progressive ? index * 60000 : 0),
          ],
        },
      }),
    })),
  };
}
function setup(plan = blueprint(), continuing = false) {
  vi.mocked(saveProgramDraftAction).mockResolvedValue({
    ok: false,
    error: "Saved payload received",
  });
  render(
    <EnduranceProgrammeBuilder
      sport="running"
      initial={{ id: "draft", revision: 1, blueprint: plan }}
      anchorDate="2026-10-01"
      today="2026-10-08"
      templates={[]}
      units={DEFAULT_SPORT_UNITS}
      continuing={continuing}
    />,
  );
}
async function saved() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Save draft" })).toHaveProperty("disabled", false),
  );
  const calls = vi.mocked(saveProgramDraftAction).mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveProgramDraftAction).toHaveBeenCalledTimes(calls + 1));
  return vi.mocked(saveProgramDraftAction).mock.calls.at(-1)![0] as ProgramBlueprint;
}

it("keeps server-rendered inputs disabled until their change handlers are ready", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(
    <EnduranceProgrammeBuilder
      sport="running"
      initial={null}
      anchorDate="2026-10-01"
      today="2026-10-01"
      templates={[]}
      units={DEFAULT_SPORT_UNITS}
    />,
  );
  expect(container.querySelector("input")!.matches(":disabled")).toBe(true);
  expect(
    Array.from(container.querySelectorAll("button")).every((button) => button.matches(":disabled")),
  ).toBe(true);
  setup();
  expect(screen.getByLabelText("Programme name").matches(":disabled")).toBe(false);
});

it("marks invalid programme weeks until they are corrected, keeping the programme name", async () => {
  setup();
  const weeks = screen.getByLabelText("Length in weeks");
  fireEvent.change(weeks, { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Enter a whole number of weeks from 1 to 52.");
  fireEvent.change(weeks, { target: { value: "53" } });
  expect(weeks.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(weeks, { target: { value: "4" } });
  expect(weeks.getAttribute("aria-invalid")).not.toBe("true");
  expect(screen.getByLabelText("Programme name")).toHaveProperty("value", "Running plan");
});

it("opens a new programme and adds a valid editable session", () => {
  render(
    <EnduranceProgrammeBuilder
      sport="running"
      initial={null}
      anchorDate="2026-10-18"
      today="2026-10-18"
      templates={[]}
      units={DEFAULT_SPORT_UNITS}
    />,
  );
  expect(screen.getByRole("spinbutton", { name: "Minutes from" })).toHaveProperty("value", "30");
  expect(screen.getByRole("combobox", { name: "Kind of run" })).toHaveProperty("value", "easy");
  fireEvent.click(screen.getByRole("button", { name: "Add session" }));
  expect(screen.getByRole("textbox", { name: "Session name" })).toHaveProperty(
    "value",
    "Session 2",
  );
});

it("shows one editor and updates identical future weekly repeats once", async () => {
  setup();
  expect(screen.getAllByRole("textbox", { name: "Session name" })).toHaveLength(1);
  expect(screen.getByRole("option", { name: "Easy run · 3 repeats" })).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Session name" }), {
    target: { value: "Steady run" },
  });
  expect((await saved()).enduranceSessions!.map((entry) => entry.name)).toEqual([
    "Steady run",
    "Steady run",
    "Steady run",
  ]);
});
it("can detach an individual repetition without changing the others", async () => {
  setup();
  fireEvent.change(screen.getByRole("combobox", { name: "Apply workout changes to" }), {
    target: { value: "this" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Session name" }), {
    target: { value: "Recovery run" },
  });
  expect((await saved()).enduranceSessions!.map((entry) => entry.name)).toEqual([
    "Recovery run",
    "Easy run",
    "Easy run",
  ]);
});
it("preserves past prescriptions when a continuing programme is edited", async () => {
  setup(blueprint(), true);
  fireEvent.change(screen.getByRole("textbox", { name: "Session name" }), {
    target: { value: "Steady run" },
  });
  expect((await saved()).enduranceSessions!.map((entry) => entry.name)).toEqual([
    "Easy run",
    "Steady run",
    "Steady run",
  ]);
});
it("keeps incremental weeks independent and exposes only the selected week", async () => {
  setup(blueprint([0, 7, 14], true));
  expect(screen.getByRole("combobox", { name: "Week" })).toBeTruthy();
  expect(screen.queryByRole("combobox", { name: "Apply workout changes to" })).toBeNull();
  fireEvent.change(screen.getByRole("combobox", { name: "Week" }), { target: { value: "2" } });
  fireEvent.change(screen.getByRole("textbox", { name: "Session name" }), {
    target: { value: "Week two" },
  });
  const result = await saved();
  expect(result.enduranceSessions!.map((entry) => entry.name)).toEqual([
    "Easy run",
    "Week two",
    "Easy run",
  ]);
  expect(
    result.enduranceSessions!.map((entry) => entry.prescription.sessionTargets.durationMs),
  ).toEqual([
    [1800000, 1800000],
    [1860000, 1860000],
    [1920000, 1920000],
  ]);
});
it("updates the programme week when an individual date moves", async () => {
  setup();
  fireEvent.click(screen.getByText("Date and instructions"));
  fireEvent.change(screen.getByLabelText("Session date"), { target: { value: "2026-10-10" } });
  const result = await saved();
  expect(result.enduranceSessions![0]).toMatchObject({ dayOffset: 9, weekIndex: 2 });
  expect(result.enduranceSessions![1]).toMatchObject({ dayOffset: 7, weekIndex: 2 });
});
it("generates four-day repeats with distinct identities and no duplicate on a second click", async () => {
  setup(blueprint([0]));
  fireEvent.click(screen.getByText("Repeat or remove"));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Repeat every (days)" }), {
    target: { value: "4" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Repeat through programme" }));
  fireEvent.click(screen.getByRole("button", { name: "Repeat through programme" }));
  const result = await saved();
  expect(result.enduranceSessions!.map((entry) => entry.dayOffset)).toEqual([
    0, 4, 8, 12, 16, 20, 24,
  ]);
  expect(new Set(result.enduranceSessions!.map((entry) => entry.lineageId)).size).toBe(7);
});
it("sets a run's kind, its whole-run pace and its steps, saved with the programme", async () => {
  setup(blueprint([0]));
  fireEvent.change(screen.getByRole("combobox", { name: "Kind of run" }), {
    target: { value: "easy" },
  });
  const pace = screen.getByRole("textbox", { name: "Pace per km, m:ss" });
  fireEvent.change(pace, { target: { value: "530" } });
  fireEvent.blur(pace);
  fireEvent.change(screen.getByRole("combobox", { name: "Zone" }), { target: { value: "2" } });
  expect((await saved()).enduranceSessions![0]!.prescription).toMatchObject({
    running: { sessionType: "easy" },
    sessionTargets: { paceSecondsPerKm: [330, 330], heartRateZones: [2, 2] },
  });

  fireEvent.change(screen.getByRole("combobox", { name: "Kind of run" }), {
    target: { value: "intervals" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  fireEvent.click(screen.getByRole("button", { name: "Add repeats" }));
  fireEvent.click(screen.getByRole("button", { name: "Add step" }));
  expect((await saved()).enduranceSessions![0]!.prescription).toMatchObject({
    running: { sessionType: "intervals" },
    nodes: [
      { kind: "step", phase: "warmup" },
      { kind: "repeat", repetitions: 6 },
      { kind: "step", phase: "cooldown" },
    ],
  });
});
it("says why a session cannot be added under the length it is about", () => {
  setup(blueprint([0, 7, 14, 21]));
  fireEvent.click(screen.getByRole("radio", { name: "By week" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Week" }), { target: { value: "4" } });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Length in weeks" }), {
    target: { value: "3" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add session" }));
  const length = screen.getByRole("spinbutton", { name: "Length in weeks" });
  expect(length.getAttribute("aria-invalid")).toBe("true");
  expect(length.closest("details")?.open).toBe(true);
  expect(screen.getByRole("alert").textContent).toContain(
    "Extend the programme length to add an upcoming session.",
  );
});

it("audit: an enormous length stays editable instead of crashing the calendar", async () => {
  setup(blueprint([0]));
  const weeks = screen.getByLabelText("Length in weeks");
  fireEvent.change(weeks, { target: { value: "1000000000" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Enter a whole number of weeks from 1 to 52.");
  expect(saveProgramDraftAction).not.toHaveBeenCalled();
  fireEvent.change(weeks, { target: { value: "4" } });
  expect((await saved()).weeks).toBe(4);
});

it.each(["0", "1.5", "53"])("audit: length %s cannot generate repeats", (value) => {
  setup(blueprint([0]));
  fireEvent.change(screen.getByLabelText("Length in weeks"), { target: { value } });
  fireEvent.click(screen.getByText("Repeat or remove"));
  expect(screen.getByRole("button", { name: "Repeat through programme" })).toHaveProperty(
    "disabled",
    true,
  );
  expect(screen.getByRole("button", { name: "Add session" })).toHaveProperty("disabled", true);
});

it("audit: a refused pace prevents saving the previous target as if it were the new one", async () => {
  setup(blueprint([0]));
  const pace = screen.getByLabelText("Pace per km, m:ss");
  fireEvent.change(pace, { target: { value: "30" } });
  fireEvent.blur(pace);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(pace).toHaveProperty("value", "0:30");
  expect(pace.getAttribute("aria-invalid")).toBe("true");
  expect(saveProgramDraftAction).not.toHaveBeenCalled();
  fireEvent.change(pace, { target: { value: "530" } });
  fireEvent.blur(pace);
  expect(
    (await saved()).enduranceSessions![0]!.prescription.sessionTargets.paceSecondsPerKm,
  ).toEqual([330, 330]);
});

it("removes a whole-run pace and zone, including a refused upper pace", async () => {
  setup(blueprint([0]));
  const pace = screen.getByLabelText("Pace per km, m:ss");
  fireEvent.change(pace, { target: { value: "530" } });
  fireEvent.blur(pace);
  fireEvent.change(screen.getByLabelText("Pace up to, m:ss"), { target: { value: "30" } });
  fireEvent.blur(screen.getByLabelText("Pace up to, m:ss"));
  fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "2" } });
  fireEvent.change(pace, { target: { value: "" } });
  fireEvent.blur(pace);
  fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "" } });
  expect(screen.getByLabelText("Pace up to, m:ss")).toHaveProperty("disabled", true);
  const targets = (await saved()).enduranceSessions![0]!.prescription.sessionTargets;
  expect(targets.paceSecondsPerKm).toBeUndefined();
  expect(targets.heartRateZones).toBeUndefined();
  expect(targets.durationMs).toEqual([1800000, 1800000]);
});

it("keeps the other end of a target when one end is cleared, and identifies the missing field", async () => {
  setup(blueprint([0]));
  const from = screen.getByLabelText("Minutes from");
  const to = screen.getByLabelText("Minutes to");
  fireEvent.change(from, { target: { value: "" } });
  expect(to).toHaveProperty("value", "30");
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Enter a number.");
  expect(from.getAttribute("aria-invalid")).toBe("true");
  expect(to.getAttribute("aria-invalid")).not.toBe("true");
  expect(saveProgramDraftAction).not.toHaveBeenCalled();
  fireEvent.change(from, { target: { value: "20" } });
  expect((await saved()).enduranceSessions![0]!.prescription.sessionTargets.durationMs).toEqual([
    1200000, 1800000,
  ]);
  fireEvent.change(screen.getByLabelText("Kilometres from"), { target: { value: "5" } });
  fireEvent.change(from, { target: { value: "" } });
  fireEvent.change(to, { target: { value: "" } });
  expect((await saved()).enduranceSessions![0]!.prescription.sessionTargets.durationMs).toBeNull();
});

it("marks a reversed range at its upper field and keeps an invalid effort visible", async () => {
  setup(blueprint([0]));
  fireEvent.change(screen.getByLabelText("Minutes from"), { target: { value: "40" } });
  fireEvent.change(screen.getByLabelText("Effort out of 5 from"), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("A duration range must read low to high");
  expect(screen.getByLabelText("Minutes to").getAttribute("aria-invalid")).toBe("true");
  expect(screen.getByLabelText("Effort out of 5 from")).toHaveProperty("value", "6");
  expect(screen.getByLabelText("Effort out of 5 from").getAttribute("aria-invalid")).toBe("true");
  expect(saveProgramDraftAction).not.toHaveBeenCalled();
});

it.each(["2026-10-01", "2026-11-01", ""])(
  "keeps the refused date %s editable instead of freezing or hiding the session",
  async (value) => {
    setup(blueprint(), true);
    fireEvent.click(screen.getByText("Date and instructions"));
    const date = screen.getByLabelText("Session date");
    fireEvent.change(date, { target: { value } });
    expect(date).toHaveProperty("value", value);
    expect(date.getAttribute("aria-invalid")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(saveProgramDraftAction).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Session name")).toHaveProperty("value", "Easy run");
    fireEvent.change(date, { target: { value: "2026-10-10" } });
    expect((await saved()).enduranceSessions![1]).toMatchObject({ dayOffset: 9, weekIndex: 2 });
  },
);

it("shows the actual session date when a changed programme length clears a refused date", async () => {
  setup(blueprint([0]));
  fireEvent.click(screen.getByText("Date and instructions"));
  fireEvent.change(screen.getByLabelText("Session date"), { target: { value: "2026-11-01" } });
  expect(screen.getByLabelText("Session date").getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(screen.getByLabelText("Length in weeks"), { target: { value: "5" } });
  expect(screen.getByLabelText("Session date")).toHaveProperty("value", "2026-10-01");
  expect((await saved()).enduranceSessions![0]).toMatchObject({ dayOffset: 0, weekIndex: 1 });
});
