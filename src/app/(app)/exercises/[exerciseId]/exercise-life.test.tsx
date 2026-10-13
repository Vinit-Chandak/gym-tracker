// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ExerciseLife, type LatestPerformance } from "./exercise-life";

// Rows in long lists prefetch on touch, through the router (app-link.tsx).
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn() }) }));

afterEach(cleanup);

const assistedPullUp = {
  id: "assisted-pull-up",
  name: "Assisted pull-up (machine)",
  modality: "machine",
  defaultPrescriptionType: "reps",
  loadPortability: "equipment_specific",
} as const;

/** One session on the machine, a working set per [weight, reps]. */
const performance = (id: string, performedAt: string, sets: [number, number][]) =>
  ({
    id,
    sessionId: `session-${id}`,
    performedAt,
    gymName: "Gym",
    machineName: "Assisted pull-up machine",
    sets: sets.map(([weight, reps], index) => ({
      setIndex: index + 1,
      setType: "working",
      weight,
      unit: "kg",
      reps,
      rir: 2,
      durationSeconds: null,
      distanceMeters: null,
    })),
  }) satisfies LatestPerformance;

const props = (assisted: boolean) => ({
  exercise: assistedPullUp,
  // The graph is Progress's own, tested with it (exercise-graph.test.tsx).
  graph: null,
  life: {
    months: [
      { month: "2026-01", topKg: 40 },
      { month: "2026-09", topKg: 15 },
    ],
    sessions: 12,
    assisted,
  },
  machineName: "Assisted pull-up machine",
  bests: [],
  unit: "kg" as const,
  length: "m" as const,
  timeZone: "UTC",
  today: "2026-10-11",
  performances: [
    performance("september", "2026-09-10T08:00:00Z", [
      [20, 8],
      [15, 8],
      [15, 6],
    ]),
  ],
});

it("shows an assisted machine's least help as its best, and leads each session with it", () => {
  render(<ExerciseLife {...props(true)} />);
  const stat = screen.getByText("Least assistance").closest("div")!;
  expect(stat.textContent).toBe("Least assistance15 kg");
  // The session's lightest help, and of it the most reps, not the 20 kg it started with; read
  // as the help it is, as the workout reads it.
  expect(screen.getByText("15 kg assistance × 8")).toBeTruthy();
  expect(screen.queryByText("Top weight")).toBeNull();
});

it("shows any other machine's heaviest", () => {
  render(<ExerciseLife {...props(false)} />);
  expect(screen.getByText("Top weight").closest("div")!.textContent).toBe("Top weight40 kg");
  expect(screen.getByText("20 kg × 8")).toBeTruthy();
});

it("says what its figures and its latest sessions are read on, and lists other machines apart", () => {
  const lat = { ...assistedPullUp, name: "Lat pulldown" };
  render(
    <ExerciseLife
      {...props(false)}
      exercise={lat}
      machineName="Lat pulldown"
      performances={[
        // 42.5 kg twice: the row leads with the better of the two.
        performance("17-sept", "2026-09-17T08:00:00Z", [
          [40, 13],
          [42.5, 10],
          [42.5, 11],
        ]),
      ]}
      elsewhere={[
        { ...performance("7-oct", "2026-10-07T08:00:00Z", [[17.5, 12]]), machineName: null },
      ]}
    />,
  );
  // The figures are every session's on the machine chosen over the graph, and say so.
  expect(screen.getByRole("heading", { name: "All time on Lat pulldown" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Latest on Lat pulldown" })).toBeTruthy();
  expect(screen.getByText("42.5 kg × 11")).toBeTruthy();
  // Another machine's session is in view, never as this machine's.
  expect(screen.getByRole("heading", { name: "Latest on other machines" })).toBeTruthy();
  // The machine is kept whole, its dot with it, if the line wraps.
  expect(screen.getByText("· Unrecorded machine").previousSibling?.textContent).toBe(" ");
  expect(screen.getByText("· Unrecorded machine").parentElement?.textContent).toBe(
    "Wed\u00a07\u00a0Oct ·\u00a0Unrecorded machine",
  );
});

it("leads the machine's name with its kind's glyph, never beside the kind's name", () => {
  render(<ExerciseLife {...props(false)} machineName="Lat pulldown" />);
  // "Machine Lat pulldown" read as one name; the glyph says the kind, as a workout's rows do.
  const fact = screen.getByRole("img", { name: "Machine" }).parentElement!;
  expect(fact.textContent).toBe("Lat pulldown");
  expect(screen.queryByText("Machine")).toBeNull();
});

it("leads an accessory with its own glyph, not the movement's", () => {
  const backExtension = {
    ...assistedPullUp,
    name: "Back extension",
    modality: "bodyweight",
    loadPortability: "context_dependent",
  } as const;
  const { rerender } = render(
    <ExerciseLife
      {...props(false)}
      exercise={backExtension}
      machineName="Back extension bench"
      machineType={{ typeSlug: "back_extension_bench", typeCategory: "accessory" }}
    />,
  );
  // The bench was led by the pull-up bar's glyph, read as "Bodyweight".
  const fact = screen.getByRole("img", { name: "Accessory" }).parentElement!;
  expect(fact.textContent).toBe("Back extension bench");
  expect(screen.queryByRole("img", { name: "Bodyweight" })).toBeNull();
  // With no machine named, the movement's own kind stands, in words.
  rerender(<ExerciseLife {...props(false)} exercise={backExtension} machineName={null} />);
  expect(screen.getByText("Bodyweight")).toBeTruthy();
  expect(screen.queryByRole("img", { name: "Accessory" })).toBeNull();
});

it("leads an ab wheel with the ab wheel, said once when it is named after it", () => {
  const rollout = {
    ...assistedPullUp,
    name: "Kneeling rollout",
    modality: "bodyweight",
    loadPortability: "context_dependent",
  } as const;
  const { container, rerender } = render(
    <ExerciseLife
      {...props(false)}
      exercise={rollout}
      machineName="Ab roller"
      machineType={{ typeSlug: "ab_wheel", typeCategory: "accessory" }}
    />,
  );
  const fact = screen.getByRole("img", { name: "Ab wheel" }).parentElement!;
  expect(fact.textContent).toBe("Ab roller");
  // Named after its kind, it is said once, and the glyph is left unnamed beside the word.
  rerender(
    <ExerciseLife
      {...props(false)}
      exercise={rollout}
      machineName="Ab wheel"
      machineType={{ typeSlug: "ab_wheel", typeCategory: "accessory" }}
    />,
  );
  expect(screen.queryByRole("img", { name: "Ab wheel" })).toBeNull();
  expect(screen.getByText("Ab wheel")).toBeTruthy();
  // The wheel, front on: its tread and the handle out each side (the bench has two legs).
  expect(container.querySelector("svg rect")?.getAttribute("height")).toBe("16");
});

it("leads a cardio machine and the Smith machine with their own glyphs, never the stack", () => {
  const rowing = {
    ...assistedPullUp,
    name: "Rowing machine",
    modality: "cardio",
    loadPortability: "context_dependent",
  } as const;
  const { container, rerender } = render(
    <ExerciseLife
      {...props(false)}
      exercise={rowing}
      machineName="Concept2 rower"
      machineType={{ typeSlug: "rowing_machine", typeCategory: "cardio" }}
    />,
  );
  // A rowing machine was led by the weight stack, read as "Machine".
  const fact = screen.getByRole("img", { name: "Rowing machine" }).parentElement!;
  expect(fact.textContent).toBe("Concept2 rower");
  expect(screen.queryByRole("img", { name: "Machine" })).toBeNull();
  // The rower, side on: its flywheel at the front (the stack has no circle).
  expect(container.querySelector("svg circle")).not.toBeNull();
  const press = {
    ...assistedPullUp,
    name: "Smith machine bench press",
    modality: "smith_machine",
  } as const;
  rerender(
    <ExerciseLife
      {...props(false)}
      exercise={press}
      machineName="Smith machine"
      machineType={{ typeSlug: "smith_machine", typeCategory: "machine" }}
    />,
  );
  // Named after its kind, it is said once.
  expect(screen.getByText("Smith machine")).toBeTruthy();
  expect(screen.queryByRole("img", { name: "Machine" })).toBeNull();
});

it("draws cardio with no machine named as the machine it is done on, and on none in words", () => {
  const rowing = {
    ...assistedPullUp,
    name: "Rowing machine",
    modality: "cardio",
    loadPortability: "context_dependent",
    cardioMachine: "rowing_machine",
  } as const;
  const { container, rerender } = render(
    <ExerciseLife {...props(false)} exercise={rowing} machineName={null} />,
  );
  // Its page led with the weight stack and said "Machine", where the library draws the rower.
  const fact = () => container.querySelector(".meta-line .meta-fact")!;
  expect(fact().textContent).toBe("Rowing machine");
  expect(fact().querySelector("svg circle")).not.toBeNull();
  expect(screen.queryByText("Machine")).toBeNull();
  rerender(
    <ExerciseLife
      {...props(false)}
      exercise={{ ...rowing, cardioMachine: null }}
      machineName={null}
    />,
  );
  expect(fact().textContent).toBe("Cardio");
  expect(fact().querySelector("svg")).toBeNull();
});

it("names a machine called after its kind once", () => {
  const smithBench = { ...assistedPullUp, modality: "smith_machine" } as const;
  render(<ExerciseLife {...props(false)} exercise={smithBench} machineName="Smith machine" />);
  expect(screen.getAllByText("Smith machine")).toHaveLength(1);
});

it("reads a free-weight lift's records as all time, across gyms", () => {
  render(
    <ExerciseLife
      {...props(false)}
      exercise={{ ...assistedPullUp, modality: "barbell", loadPortability: "global" }}
      machineName={null}
    />,
  );
  expect(screen.getByRole("heading", { name: "All time, across gyms" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Latest" })).toBeTruthy();
});

it("names the year of a session in another year, and not of one this year", () => {
  render(
    <ExerciseLife
      {...props(false)}
      performances={[
        performance("this-year", "2026-09-10T08:00:00Z", [[20, 8]]),
        performance("last-year", "2025-10-13T08:00:00Z", [[17.5, 8]]),
      ]}
    />,
  );
  expect(screen.getByText("Thu 10 Sept")).toBeTruthy();
  // 13 October is a Tuesday this year: last year's Monday says which year it was.
  expect(screen.getByText("Mon 13 Oct 2025")).toBeTruthy();
});

it("says a bodyweight set as the body, not as nothing lifted", () => {
  render(
    <ExerciseLife
      {...props(false)}
      exercise={{ ...assistedPullUp, modality: "bodyweight", loadPortability: "global" }}
      machineName={null}
      performances={[
        performance("dips", "2026-09-10T08:00:00Z", [
          [0, 14],
          [0, 12],
        ]),
      ]}
    />,
  );
  expect(screen.getByText("Bodyweight × 14")).toBeTruthy();
  expect(screen.queryByText(/0 kg/)).toBeNull();
});

it("reads a carry in the athlete's length: its sets, its best and its longest", () => {
  const carry = {
    ...assistedPullUp,
    name: "Farmer's carry",
    modality: "dumbbell",
    defaultPrescriptionType: "distance",
    loadPortability: "global",
  } as const;
  const carried = {
    ...performance("carry", "2026-09-10T08:00:00Z", [[32, 0]]),
    sets: [40, 45.7].map((metres, index) => ({
      setIndex: index + 1,
      setType: "working" as const,
      weight: 32,
      unit: "kg" as const,
      reps: null,
      rir: null,
      durationSeconds: null,
      distanceMeters: metres,
    })),
  };
  const { container } = render(
    <ExerciseLife
      {...props(false)}
      exercise={carry}
      machineName={null}
      length="yd"
      bests={[{ metric: "longest_carry", value: 45.7, occurredOn: "2026-09-10", work: null }]}
      performances={[carried]}
    />,
  );
  const text = container.textContent!.replaceAll("\u00a0", " ");
  // 45.7 m was typed as 50 yd, and reads back as it was typed (ADR 0055); 40 m is 44 yd.
  expect(text).toContain("32 kg × 44 yd, 32 kg × 50 yd");
  expect(text).toContain("Longest carry50 yd");
  expect(text).not.toMatch(/\d m\b/);
});
