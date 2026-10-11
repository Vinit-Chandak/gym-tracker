// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { listItem } from "@/components/exercise-picker.test-data";

import { ExerciseLibrary } from "./exercise-library";

// Rows prefetch on touch, through the router (app-link.tsx).
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn() }) }));

afterEach(cleanup);

it("tags each row with where its history is kept: per machine, per setup, or nothing", () => {
  render(
    <ExerciseLibrary
      exercises={[
        listItem("1", "Chest press machine"),
        listItem("2", "Incline push-up", {
          modality: "bodyweight",
          loadPortability: "context_dependent",
        }),
        listItem("3", "Barbell bench press", { modality: "barbell", loadPortability: "global" }),
      ]}
    />,
  );
  const row = (name: string) => screen.getByText(name).closest("a")!.textContent;
  expect(row("Chest press machine")).toContain("Per machine");
  // A push-up off a bench is kept per setup: its height is the load, and it is no machine.
  expect(row("Incline push-up")).toContain("Per setup");
  expect(row("Incline push-up")).not.toContain("Per machine");
  expect(row("Barbell bench press")).not.toMatch(/Per (machine|setup)/);
});
