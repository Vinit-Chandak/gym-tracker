// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { listItem } from "@/components/exercise-picker.test-data";
import { Glyph } from "@/components/ui/glyphs";
import { holdHyphens, joinFacts } from "@/lib/facts";

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
  // A name is held at its hyphens, so a row never ends "push-" (holdHyphens).
  const row = (name: string) => screen.getByText(holdHyphens(name)).closest("a")!.textContent;
  expect(row("Chest press machine")).toContain("Per machine");
  // A push-up off a bench is kept per setup: its height is the load, and it is no machine.
  expect(row("Incline push-up")).toContain("Per setup");
  expect(row("Incline push-up")).not.toContain("Per machine");
  expect(row("Barbell bench press")).not.toMatch(/Per (machine|setup)/);
});

it("leads each row's second line with the equipment's glyph, the equipment still said", () => {
  const { container } = render(
    <ExerciseLibrary
      exercises={[
        listItem("1", "Archer push-up", {
          modality: "bodyweight",
          loadPortability: "global",
          primaryMuscles: ["chest"],
        }),
        listItem("2", "Barbell floor press", {
          modality: "barbell",
          loadPortability: "global",
          primaryMuscles: ["chest", "triceps"],
        }),
      ]}
    />,
  );
  const row = (name: string) => screen.getByText(holdHyphens(name)).closest("a")!;
  // The library said "Bodyweight · Chest" in words alone, where every other exercise row leads
  // with the glyph; the words stay, since the search finds them and a barbell and a dumbbell
  // share a glyph. The glyph is the words' picture, so it is not read twice.
  for (const [name, line, glyph] of [
    ["Archer push-up", joinFacts(["Bodyweight", "Chest"]), "bodyweight"],
    ["Barbell floor press", joinFacts(["Barbell", "Chest, Triceps"]), "dumbbell"],
  ] as const) {
    const fact = row(name).querySelector(".meta-fact")!;
    expect(fact.textContent).toBe(line);
    const svg = fact.firstElementChild!;
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    // Drawn as that glyph is drawn alone.
    const { container: alone } = render(<Glyph name={glyph} />);
    expect(svg.innerHTML).toBe(alone.querySelector("svg")!.innerHTML);
  }
  // A list to choose from: its names at the gutter, in no box (DESIGN.md, One Left Edge).
  expect(container.querySelector(".box-rows")).toBeNull();
  expect(row("Archer push-up").className).toContain("nav-row");
});
