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
