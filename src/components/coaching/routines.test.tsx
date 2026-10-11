// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { SavedRoutineDay } from "@/domain/saved-routine";

import { RoutineLibrary } from "./routines";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/manual-training", () => ({
  startRoutineAction: vi.fn(),
  saveWorkoutRoutineAction: vi.fn(),
}));

afterEach(cleanup);

/** The page's header is its one level-1 heading; each routine is a heading under it. */
it("leaves the page's title to its header and heads each routine under it", () => {
  render(
    <RoutineLibrary
      routines={[
        {
          id: "r1",
          name: "Upper A",
          // Only what the list reads of a routine's day.
          day: {
            exercises: [{ exerciseSlug: "bench-press", sets: 3, reps: [8, 10] }],
          } as unknown as SavedRoutineDay,
        },
      ]}
      gyms={[{ id: "g1", name: "Home gym" }]}
      library={[{ slug: "bench-press", name: "Bench press" }]}
    />,
  );
  expect(screen.queryAllByRole("heading", { level: 1 })).toHaveLength(0);
  expect(screen.getByRole("heading", { level: 2, name: "Upper A" })).toBeTruthy();
});

it("starts at the default gym, and speaks of a programme only while one is under way", () => {
  const routine = {
    id: "r1",
    name: "Upper A",
    day: { exercises: [] } as unknown as SavedRoutineDay,
  };
  // It read "Choose a location" to athletes with a default gym.
  render(
    <RoutineLibrary
      routines={[routine]}
      gyms={[
        { id: "g1", name: "Garage gym", isDefault: false },
        { id: "g2", name: "Planet Fitness Brooklyn", isDefault: true },
      ]}
      library={[]}
    />,
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("g2");
  expect(screen.queryByRole("option", { name: "Choose a location" })).toBeNull();
  expect(screen.getByRole("button", { name: "Start this routine" })).toHaveProperty(
    "disabled",
    false,
  );
  expect(screen.getByText(/without changing your active programme/)).toBeTruthy();
  cleanup();

  // No default to start at: the choice is asked. A finished programme has nothing to change.
  render(
    <RoutineLibrary
      routines={[routine]}
      gyms={[
        { id: "g1", name: "Home" },
        { id: "g2", name: "Cult Fit Koramangala" },
      ]}
      library={[]}
      programme="none"
    />,
  );
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("");
  expect(screen.getByRole("option", { name: "Choose a location" })).toBeTruthy();
  expect(screen.queryByText(/programme\./)).toBeNull();
  expect(screen.getByText(/^Start a repeatable workout\. Completed workouts/)).toBeTruthy();
});
