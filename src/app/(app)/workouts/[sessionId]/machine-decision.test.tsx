// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { ExerciseDecision } from "@/server/repositories/availability";

import { LoggerActionsProvider, type LoggerActions } from "./logger-actions";
import { MachineDecision, MachineGoneSheet, withArticle } from "./machine-decision";
import type { ExerciseVM, SessionVM } from "./view-model";

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

const SESSION = {
  id: "session",
  gym: { id: "gym", name: "Anytime Fitness", kind: "gym" },
} as SessionVM;
const exerciseRef = {
  id: "leg-press",
  slug: "leg-press-45",
  modality: "machine",
  loadPortability: "equipment_specific",
  requiresEquipment: true,
} as const;

function decision(patch: Partial<ExerciseDecision>): ExerciseDecision {
  return {
    resolution: {
      status: "unknown",
      exercise: exerciseRef,
      missingEquipmentTypeIds: ["hack"],
    },
    resolvedExerciseName: "Hack squat",
    fallbackOptions: [],
    missingTypes: [{ id: "hack", name: "Hack squat" }],
    ask: null,
    machines: [],
    ...patch,
  } as ExerciseDecision;
}

function exercise(d: ExerciseDecision, equipment: ExerciseVM["equipment"] = null): ExerciseVM {
  return {
    id: "slot",
    exercise: { id: "leg-press", name: "45° leg press" },
    equipment,
    decision: d,
  } as ExerciseVM;
}

function actions(patch: Partial<LoggerActions> = {}): LoggerActions {
  return {
    logSet: vi.fn(),
    deleteSet: vi.fn(),
    setCompleted: vi.fn(),
    skip: vi.fn(),
    applyFallback: vi.fn(),
    readHistory: vi.fn(),
    confirmHere: vi.fn(async () => ({ ok: true as const })),
    notHere: vi.fn(async () => ({ ok: true as const })),
    chooseVariant: vi.fn(async () => ({ ok: true as const })),
    archiveMachine: vi.fn(async () => ({ ok: true as const })),
    ...patch,
  } as LoggerActions;
}

/** The block as the logger holds it: "Not sure" lives with the logger, so its Save can wait. */
function Held(props: Omit<ComponentProps<typeof MachineDecision>, "unsure" | "onUnsure">) {
  const [unsure, setUnsure] = useState(false);
  return <MachineDecision {...props} unsure={unsure} onUnsure={setUnsure} />;
}

function show(d: ExerciseDecision, given = actions()) {
  const onFallback = vi.fn();
  const onMessage = vi.fn();
  const onAnnounce = vi.fn();
  const onMoved = vi.fn();
  render(
    <LoggerActionsProvider value={given}>
      <Held
        exercise={exercise(d)}
        session={SESSION}
        blocked={false}
        busy={false}
        onFallback={onFallback}
        onMessage={onMessage}
        onAnnounce={onAnnounce}
        onMoved={onMoved}
      />
    </LoggerActionsProvider>,
  );
  return { actions: given, onFallback, onMessage, onAnnounce, onMoved };
}

const BASIC = decision({
  resolution: {
    status: "direct",
    exercise: exerciseRef,
    equipmentInstance: null,
    basis: "assumed",
    primaryTypeId: "lp45",
    assumedTypeIds: ["lp45"],
  } as unknown as ExerciseDecision["resolution"],
  missingTypes: [],
  ask: {
    kind: "confirm_basic",
    typeId: "lp45",
    slug: "leg_press_45",
    name: "45° leg press",
    art: "/equipment-art/leg_press_45.svg?v=1",
    family: {
      name: "Leg press",
      variants: [
        {
          typeId: "lph",
          slug: "leg_press_horizontal",
          name: "Horizontal leg press",
          art: null,
          identification: "You sit upright and push the footplate straight ahead.",
        },
      ],
    },
  },
});

it("settles a gym basic with one tap, registering it on Yes, it's here", async () => {
  const movedTo = { exerciseId: "lp45-exercise", equipmentInstanceId: "m-new" };
  const {
    actions: given,
    onAnnounce,
    onMoved,
  } = show(BASIC, actions({ confirmHere: vi.fn(async () => ({ ok: true as const, movedTo })) }));
  // The question labels its answers, as one group.
  const answers = screen.getByRole("group", { name: "Is there a 45° leg press here?" });
  fireEvent.click(within(answers).getByRole("button", { name: "Yes, it’s here" }));
  await waitFor(() => expect(given.confirmHere).toHaveBeenCalledWith("slot", "lp45"));
  expect(onAnnounce).toHaveBeenCalledWith("45° leg press registered here.");
  // Where the machine went, so the logger carries a set typed before the answer with it.
  expect(onMoved).toHaveBeenCalledWith(movedTo);
  expect(screen.queryByRole("button", { name: "Not sure" })).toBeNull();
});

it("offers the family's other variants behind A different one", async () => {
  const { actions: given } = show(BASIC);
  fireEvent.click(screen.getByRole("button", { name: "A different one" }));
  const sheet = within(screen.getByRole("dialog", { name: "Which leg press is it?" }));
  // Each variant says how to tell it apart, in words as well as its picture.
  const variant = sheet.getByRole("button", { name: /Horizontal leg press/ });
  expect(variant.textContent).toContain("You sit upright and push the footplate straight ahead.");
  fireEvent.click(variant);
  await waitFor(() => expect(given.chooseVariant).toHaveBeenCalledWith("slot", "lp45", "lph"));
});

const UNKNOWN = decision({
  ask: {
    kind: "unknown",
    typeId: "hack",
    slug: "hack_squat",
    name: "Hack squat",
    art: null,
    family: null,
  },
  fallbackOptions: [
    {
      fallbackId: "f",
      exerciseId: "goblet",
      exerciseName: "Goblet squat",
      equipmentInstanceId: null,
      equipmentInstanceName: null,
      available: true,
    },
  ],
});

it("asks about any other machine: Available registers it, Not sure changes nothing", async () => {
  const { actions: given, onFallback } = show(UNKNOWN);
  expect(screen.getByText("Is a hack squat available here?")).toBeTruthy();
  // The options that were always here stay under the question.
  fireEvent.click(screen.getByRole("button", { name: "Use Goblet squat" }));
  expect(onFallback).toHaveBeenCalledWith("goblet", null, "Goblet squat");
  expect(screen.getByRole("link", { name: "Add a fallback" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Register with details" })).toBeTruthy();
  screen.getByRole("button", { name: "Not sure" }).focus();
  fireEvent.click(screen.getByRole("button", { name: "Not sure" }));
  expect(screen.getByText("Not sure about a hack squat")).toBeTruthy();
  // The button pressed is gone: the new heading takes the focus.
  await waitFor(() =>
    expect(document.activeElement?.textContent).toBe("Not sure about a hack squat"),
  );
  expect(given.confirmHere).not.toHaveBeenCalled();
  expect(given.notHere).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Answer after all" }));
  fireEvent.click(screen.getByRole("button", { name: "Available" }));
  await waitFor(() => expect(given.confirmHere).toHaveBeenCalledWith("slot", "hack"));
});

it("asks whether a registered machine has gone when Not here meets one", async () => {
  const given = actions({
    notHere: vi.fn(async () => ({
      ok: false as const,
      error: null,
      machines: [{ id: "m1", name: "Garage hack squat" }],
    })),
  });
  show(UNKNOWN, given);
  fireEvent.click(screen.getByRole("button", { name: "Not here" }));
  expect(
    await screen.findByText(/Garage hack squat is registered here. Has it gone\?/),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "Out of use today" }).getAttribute("href")).toBe(
    "/workouts/session/exercises/slot/substitute?remember=0",
  );
  fireEvent.click(screen.getByRole("button", { name: "Archive Garage hack squat" }));
  await waitFor(() => expect(given.archiveMachine).toHaveBeenCalledWith("slot", "m1"));
});

it("offers Not here beside Use for a registered machine", () => {
  show(
    decision({
      resolution: {
        status: "direct",
        exercise: exerciseRef,
        equipmentInstance: {
          id: "m2",
          name: "Leg press 2",
          equipmentTypeId: "lp45",
          isActive: true,
        },
        basis: "confirmed",
      } as unknown as ExerciseDecision["resolution"],
      missingTypes: [],
    }),
  );
  expect(screen.getByRole("button", { name: "Use Leg press 2" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Not here" }));
  expect(screen.getByText(/Leg press 2 is registered here. Has it gone\?/)).toBeTruthy();
});

it("lets an exercise on a machine say it is gone, or only out of use today", async () => {
  const given = actions();
  render(
    <LoggerActionsProvider value={given}>
      <MachineGoneSheet
        open
        exercise={exercise(decision({}), {
          id: "m3",
          name: "Cable station",
        } as ExerciseVM["equipment"])}
        session={SESSION}
        onClose={() => {}}
        onMessage={() => {}}
      />
    </LoggerActionsProvider>,
  );
  const sheet = within(screen.getByRole("dialog", { name: "Cable station not here?" }));
  fireEvent.click(sheet.getByRole("button", { name: "It’s gone: archive it" }));
  await waitFor(() => expect(given.archiveMachine).toHaveBeenCalledWith("slot", "m3"));
  expect(sheet.getByRole("link", { name: "Out of use today" })).toBeTruthy();
});

it("says a name the way a sentence does", () => {
  expect(withArticle("Hack squat")).toBe("a hack squat");
  expect(withArticle("Ab crunch machine")).toBe("an ab crunch machine");
  expect(withArticle("45° leg press")).toBe("a 45° leg press");
  expect(withArticle("EZ curl bar")).toBe("an EZ curl bar");
});

it("says what Not here recorded", async () => {
  const { actions: given, onAnnounce } = show(UNKNOWN);
  fireEvent.click(screen.getByRole("button", { name: "Not here" }));
  await waitFor(() => expect(given.notHere).toHaveBeenCalledWith("slot", "hack"));
  expect(onAnnounce).toHaveBeenCalledWith("Recorded: no hack squat here.");
});
