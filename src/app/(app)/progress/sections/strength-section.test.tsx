// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { presetRange } from "@/domain/graph-range";
import { exerciseSessions, strengthGraph, type StrengthRow } from "@/domain/progress-graphs";

import type { ProgressData } from "../progress-types";
import { StrengthSection } from "./strength-section";

const route = vi.hoisted(() => ({ search: "" }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/progress",
  useSearchParams: () => new URLSearchParams(route.search),
}));
vi.mock("@/server/actions/graph-range", () => ({ chooseGraphRangeAction: vi.fn() }));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ prefetch: _prefetch, ...props }: ComponentProps<"a"> & { prefetch?: boolean }) => (
    <a {...props} />
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  route.search = "";
  window.history.replaceState(null, "", "/progress");
});

const TODAY = "2026-10-07";
const MONTH = presetRange("1m", TODAY);

const rows: StrengthRow[] = [
  { sessionId: "a", date: "2026-09-14", primaryMuscles: ["quads"], workingSets: 4, volumeKg: 2000 },
  { sessionId: "a", date: "2026-09-14", primaryMuscles: ["chest"], workingSets: 3, volumeKg: 900 },
  { sessionId: "b", date: "2026-09-21", primaryMuscles: ["abs"], workingSets: 3, volumeKg: 0 },
];

const options = [
  { id: "squat", name: "Barbell back squat", machine: "Across gyms", unit: "kg", group: "legs" },
  { id: "bench", name: "Barbell bench press", machine: "Across gyms", unit: "kg", group: "chest" },
  { id: "plank", name: "Plank", machine: "Across gyms", unit: "none", group: "core" },
] as const;

function draw(selected: "squat" | null = null) {
  const sessions = exerciseSessions(
    [
      {
        sessionId: "a",
        date: "2026-09-14",
        weight: 100,
        reps: 5,
        durationSeconds: null,
        distanceMeters: null,
      },
    ],
    "barbell",
    "kg",
  );
  const data: Pick<ProgressData, "strength" | "exercise" | "today"> = {
    today: TODAY,
    strength: { range: MONTH, graph: strengthGraph(rows, MONTH, TODAY), unit: "kg" },
    exercise: {
      range: MONTH,
      options: options.map((option) => ({ ...option })),
      selected: selected
        ? {
            id: "squat",
            name: "Barbell back squat",
            machine: "Across gyms",
            unit: "kg",
            modality: "barbell",
            sessions,
          }
        : null,
    },
  };
  return render(<StrengthSection {...data} />);
}

const exercises = () =>
  within(screen.getByRole("combobox", { name: "Exercise" }))
    .getAllByRole("option")
    .map((option) => option.textContent);

it("opens on every group's volume, with every exercise to choose from", () => {
  draw();
  expect((screen.getByRole("combobox", { name: "Muscle group" }) as HTMLSelectElement).value).toBe(
    "all",
  );
  expect(exercises()).toEqual([
    "All exercises",
    "Barbell back squat",
    "Barbell bench press",
    "Plank",
  ]);
  const readout = within(screen.getByText("Total volume").closest(".graph-readout") as HTMLElement);
  expect(readout.getByText("2,900")).toBeTruthy();
  // Over the two weeks trained, not the month's five.
  expect(readout.getByText("1,450 kg a week · 2 workouts")).toBeTruthy();
});

it("lists a group's own exercises and draws its volume; choosing one costs no request", () => {
  route.search = "group=legs";
  draw();
  expect(exercises()).toEqual(["All exercises", "Barbell back squat"]);
  expect(screen.getByText("2,000")).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Muscle group" }), {
    target: { value: "chest" },
  });
  expect(window.location.search).toBe("?group=chest");
  expect(router.replace).not.toHaveBeenCalled();
});

it("reads an exercise's sets from the server once one is chosen, and lets it go at once", () => {
  draw();
  fireEvent.change(screen.getByRole("combobox", { name: "Exercise" }), {
    target: { value: "Barbell back squat" },
  });
  expect(router.replace).toHaveBeenCalledWith("/progress?series=squat", { scroll: false });
  cleanup();

  route.search = "group=legs&series=squat";
  window.history.replaceState(null, "", "/progress?group=legs&series=squat");
  draw("squat");
  expect(screen.getByText("Best estimated 1RM")).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox", { name: "Exercise" }), { target: { value: "" } });
  expect(window.location.search).toBe("?group=legs");
});

it("says so when a group's sets carried no load, rather than drawing nothing", () => {
  route.search = "group=core";
  draw();
  expect(screen.getByText(/bodyweight and timed sets add no volume/)).toBeTruthy();
});
