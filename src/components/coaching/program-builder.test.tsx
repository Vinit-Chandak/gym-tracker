// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { ProgramBuilder } from "./program-builder";
import {
  saveProgramDraftAction,
  reviewProgramDraftAction,
} from "@/server/actions/coaching-workflow";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), unstable_rethrow: vi.fn() }));
vi.mock("@/server/actions/coaching-workflow", () => ({
  saveProgramDraftAction: vi.fn(),
  reviewProgramDraftAction: vi.fn(),
}));

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(saveProgramDraftAction).mockResolvedValue({ ok: false, error: "Review the days." });
});

const library: ComponentProps<typeof ProgramBuilder>["library"] = ["Bench press", "Squat"].map(
  (name) => ({
    slug: name.toLowerCase().replace(" ", "-"),
    name,
    defaultPrescriptionType: "reps",
    defaultRepMin: 8,
    defaultRepMax: 12,
    defaultDurationMinSeconds: null,
    defaultDurationMaxSeconds: null,
    defaultDistanceMinMeters: null,
    defaultDistanceMaxMeters: null,
    defaultRir: null,
    defaultRestSeconds: 60,
  }),
);

function blueprint(count = 4, repeats: ProgramBlueprint["repeats"] = "rolling"): ProgramBlueprint {
  return {
    blueprintVersion: 1,
    sport: "strength",
    slug: "test-plan",
    name: "My programme",
    weeks: 8,
    notes: "Build gradually",
    repeats,
    days: Array.from({ length: count }, (_, index) => ({
      dayIndex: index + 1,
      dayOfWeek: (index % 7) + 1,
      name: `Session ${index + 1}`,
      focus: "",
      timeNote: "",
      effortNote: "",
      notes: "",
      warmupSlug: "",
      includesLifting: true,
      includesRun: false,
      exercises: [
        {
          exerciseSlug: index % 2 ? "squat" : "bench-press",
          sets: index + 1,
          reps: [8, 12],
          rir: null,
          rest: [60, 90],
          lineageId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          targetLoadNote: "Start light",
          progressionNotes: "Add load after all sets reach 12 reps",
          progressionRule: { kind: "double_progression", loadIncrement: 2.5 },
        },
      ],
    })),
    runs: [],
  };
}

function renderBuilder(
  plan?: ProgramBlueprint,
  extra: Partial<ComponentProps<typeof ProgramBuilder>> = {},
) {
  render(
    <ProgramBuilder
      initial={plan ? { id: "draft-id", revision: 2, blueprint: plan } : null}
      base="/plan"
      warmups={[]}
      library={library}
      {...extra}
    />,
  );
}

it("keeps server-rendered inputs disabled until their change handlers are ready", () => {
  const container = document.createElement("div");
  container.innerHTML = renderToString(
    <ProgramBuilder initial={null} base="/plan" warmups={[]} library={library} />,
  );
  expect(container.querySelector("input")!.matches(":disabled")).toBe(true);
  expect(
    Array.from(container.querySelectorAll("button")).every((button) => button.matches(":disabled")),
  ).toBe(true);
  renderBuilder();
  expect(screen.getByLabelText("Programme name").matches(":disabled")).toBe(false);
});

it("keeps invalid programme weeks marked until they can be saved", async () => {
  renderBuilder(blueprint());
  const weeks = screen.getByRole("spinbutton", { name: "Number of weeks", hidden: true });
  fireEvent.change(weeks, { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText("Enter a whole number of weeks from 1 to 52.");
  fireEvent.change(weeks, { target: { value: "53" } });
  expect(weeks.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(weeks, { target: { value: "8" } });
  expect(weeks.getAttribute("aria-invalid")).not.toBe("true");
});
function addDay() {
  fireEvent.click(screen.getByRole("button", { name: "Add a day" }));
}
function selectDay(index: number) {
  fireEvent.change(screen.getByRole("combobox", { name: "Day to edit" }), {
    target: { value: String(index) },
  });
}
function setRepeat(value: string) {
  fireEvent.change(screen.getByRole("combobox", { name: "Repeats" }), { target: { value } });
}
function openDisclosure(summary: string) {
  fireEvent.click(screen.getByText(summary));
}
async function savedPlan() {
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() => expect(saveProgramDraftAction).toHaveBeenCalled());
  return vi.mocked(saveProgramDraftAction).mock.calls.at(-1)![0] as ProgramBlueprint;
}

it("keeps programme saves inside the preview, and offers no routine to save (ADR 0058)", () => {
  renderBuilder(blueprint(), { preview: true });
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  expect(screen.getByText("Preview only — no programme was saved.")).toBeTruthy();
  fireEvent.click(screen.getByText("Day details"));
  expect(screen.queryByRole("button", { name: /routine/i })).toBeNull();
  expect(saveProgramDraftAction).not.toHaveBeenCalled();
});

it("clears the exercise selection when a search would hide it", () => {
  renderBuilder();
  addDay();
  fireEvent.change(screen.getByRole("combobox", { name: "Exercise to add" }), {
    target: { value: "bench-press" },
  });
  expect((screen.getByRole("button", { name: "Add exercise" }) as HTMLButtonElement).disabled).toBe(
    false,
  );
  fireEvent.change(screen.getByRole("searchbox", { name: "Find an exercise" }), {
    target: { value: "Squat" },
  });
  expect(
    (screen.getByRole("combobox", { name: "Exercise to add" }) as HTMLSelectElement).value,
  ).toBe("");
  expect((screen.getByRole("button", { name: "Add exercise" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});

it("shows one day editor and preserves each day's values while switching", async () => {
  renderBuilder(blueprint());
  expect(screen.getAllByRole("textbox", { name: "Day name" })).toHaveLength(1);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Sets" }), { target: { value: "5" } });
  selectDay(1);
  expect((screen.getByRole("spinbutton", { name: "Sets" }) as HTMLInputElement).value).toBe("2");
  selectDay(0);
  expect((screen.getByRole("spinbutton", { name: "Sets" }) as HTMLInputElement).value).toBe("5");
  const saved = await savedPlan();
  expect(saved.days.map((day) => day.exercises[0]!.sets)).toEqual([5, 2, 3, 4]);
  expect(saved.days[0]!.exercises[0]).toMatchObject({
    lineageId: blueprint().days[0]!.exercises[0]!.lineageId,
    progressionRule: { kind: "double_progression", loadIncrement: 2.5 },
  });
});

it.each([4, 7])(
  "edits a %i-day repeating pattern once without expanding all cycles",
  async (count) => {
    renderBuilder(blueprint(count));
    expect(screen.getByRole("option", { name: `Every ${count} days` })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Every week" })).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Day name" }), {
      target: { value: "Upper body" },
    });
    const saved = await savedPlan();
    expect(saved.repeats).toBe("rolling");
    expect(saved.days).toHaveLength(count);
    expect(saved.days[0]!.name).toBe("Upper body");
  },
);

it.each(["change", "remove"])(
  "does not %s another day's weekday when editing a selected rest day",
  async (operation) => {
    renderBuilder();
    setRepeat("weekly");
    addDay();
    addDay();
    if (operation === "change")
      fireEvent.change(screen.getByRole("combobox", { name: "Usual weekday" }), {
        target: { value: "3" },
      });
    else {
      openDisclosure("Day details");
      fireEvent.click(screen.getByRole("button", { name: "Remove day" }));
    }
    selectDay(0);
    expect(
      (screen.getByRole("combobox", { name: "Usual weekday" }) as HTMLSelectElement).value,
    ).toBe("1");
    const saved = await savedPlan();
    expect(saved.sport).toBe("strength");
    expect(saved.runs).toEqual([]);
    expect(saved.days.every((day) => !day.includesRun)).toBe(true);
  },
);

it("keeps selection with the day being reordered and allows undoing removal", async () => {
  renderBuilder(blueprint());
  selectDay(1);
  openDisclosure("Day details");
  fireEvent.click(screen.getByRole("button", { name: "Move day earlier" }));
  expect((screen.getByRole("textbox", { name: "Day name" }) as HTMLInputElement).value).toBe(
    "Session 2",
  );
  openDisclosure("Day details");
  fireEvent.click(screen.getByRole("button", { name: "Remove day" }));
  fireEvent.click(screen.getByRole("button", { name: "Undo remove day" }));
  const saved = await savedPlan();
  expect(saved.days.map((day) => day.name)).toEqual([
    "Session 2",
    "Session 1",
    "Session 3",
    "Session 4",
  ]);
  expect(saved.days.map((day) => day.dayIndex)).toEqual([1, 2, 3, 4]);
});

it("duplicates progressive days independently and derives finite sequence length", async () => {
  renderBuilder(blueprint(7));
  setRepeat("once");
  openDisclosure("Day details");
  fireEvent.click(screen.getByRole("button", { name: "Duplicate day" }));
  expect(screen.getByRole("option", { name: /Week 2, day 1 · Session 1 \(copy\)/ })).toBeTruthy();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Sets" }), { target: { value: "6" } });
  expect(screen.queryByRole("spinbutton", { name: "Number of weeks" })).toBeNull();
  const saved = await savedPlan();
  expect(saved.repeats).toBe("once");
  expect(saved.weeks).toBe(2);
  expect(saved.days).toHaveLength(8);
  expect(saved.days[0]!.exercises[0]!.sets).toBe(1);
  expect(saved.days[7]!.exercises[0]!.sets).toBe(6);
  expect(saved.days[7]!.exercises[0]!.lineageId).toBeUndefined();
  expect(saved.days[0]!.exercises[0]!.lineageId).toBeDefined();
});

it("retains independent targets for an existing non-repeating programme", async () => {
  renderBuilder(blueprint(8, "once"));
  selectDay(7);
  fireEvent.change(screen.getByRole("spinbutton", { name: "Sets" }), { target: { value: "10" } });
  const saved = await savedPlan();
  expect(saved.days[0]!.exercises[0]!.sets).toBe(1);
  expect(saved.days[7]!.exercises[0]!.sets).toBe(10);
  expect(saved.repeats).toBe("once");
});

it("adds saved routines with usable weekdays and fresh exercise identities", async () => {
  const day = blueprint(1).days[0]!;
  renderBuilder(undefined, { routines: [{ id: "routine", name: "Upper body", day }] });
  openDisclosure("Add a saved routine");
  fireEvent.change(screen.getByRole("combobox", { name: "Routine to add" }), {
    target: { value: "routine" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add routine as a day" }));
  const saved = await savedPlan();
  expect(saved.days[0]).toMatchObject({
    dayIndex: 1,
    dayOfWeek: 1,
    name: "Upper body",
    includesRun: false,
  });
  expect(saved.days[0]!.exercises[0]!.lineageId).toBeUndefined();
});

it("preserves legacy cadence unless a repeat pattern is explicitly selected", async () => {
  const historical = blueprint();
  delete historical.repeats;
  renderBuilder(historical);
  const saved = await savedPlan();
  expect(saved.repeats).toBeUndefined();
});

it("leaves programme validation to the server without creating endurance rows", async () => {
  vi.mocked(saveProgramDraftAction).mockResolvedValue({
    ok: false,
    error: "Choose 1 to 52 weeks.",
  });
  renderBuilder();
  addDay();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Number of weeks" }), {
    target: { value: "100000" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Review programme" }));
  await screen.findByText("Enter a whole number of weeks from 1 to 52.");
  expect(saveProgramDraftAction).toHaveBeenLastCalledWith(
    expect.objectContaining({ sport: "strength", runs: [], weeks: 100000 }),
    undefined,
    undefined,
  );
  expect(reviewProgramDraftAction).not.toHaveBeenCalled();
  expect(push).not.toHaveBeenCalled();
});

it("reviews only the acknowledged saved revision", async () => {
  vi.mocked(saveProgramDraftAction).mockResolvedValue({
    ok: true,
    value: { id: "saved-draft", revision: 3 },
  } as Awaited<ReturnType<typeof saveProgramDraftAction>>);
  vi.mocked(reviewProgramDraftAction).mockResolvedValue({
    ok: true,
    value: { id: "saved-draft", revision: 3 },
  } as Awaited<ReturnType<typeof reviewProgramDraftAction>>);
  renderBuilder(blueprint());
  fireEvent.click(screen.getByRole("button", { name: "Review programme" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/plan/drafts/saved-draft"));
  expect(reviewProgramDraftAction).toHaveBeenCalledWith("saved-draft", 3);
});

it("says what a way of repeating does in the ⓘ beside Repeats, not under the field", () => {
  renderBuilder(blueprint());
  setRepeat("weekly");
  const rule = "The same weekdays every week; days between are rest.";
  expect(screen.queryByText(rule)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "About repeats" }));
  expect(screen.getByRole("note").textContent).toBe(rule);
});

it.each([
  ["Sets", "0", "Enter 1 or more."],
  ["Sets", "1.5", "Enter a whole number."],
  ["Reps to", "101", "Enter 100 or less."],
  ["Rest seconds to", "1201", "Enter 1200 or less."],
  ["RIR to", "11", "Enter 10 or less."],
])("marks an invalid %s at that field and reveals its day", async (label, value, error) => {
  renderBuilder(blueprint());
  if (label.startsWith("Rest") || label.startsWith("RIR"))
    openDisclosure("Rest, effort and progression");
  if (label.startsWith("RIR"))
    fireEvent.click(screen.getByRole("checkbox", { name: "Set a reps-in-reserve target" }));
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  selectDay(1);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await screen.findByText(error);
  expect(screen.getByLabelText("Day name")).toHaveProperty("value", "Session 1");
  expect(screen.getByLabelText(label).getAttribute("aria-invalid")).toBe("true");
  if (label.startsWith("Rest") || label.startsWith("RIR"))
    expect(screen.getByLabelText(label).closest("details")?.open).toBe(true);
});
