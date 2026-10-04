// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Route } from "next";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { guidanceOf, NO_GUIDANCE, type ExerciseGuidance } from "@/lib/guidance";

import { ExerciseGuide } from "./exercise-guide";

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);

const LIBRARY = "/exercises/bench" as Route;

const GUIDE: NonNullable<ExerciseGuidance["guide"]> = {
  status: "published",
  setup: "Lie on the bench with your eyes under the bar.",
  steps: ["Unrack the bar.", "Lower it to your chest.", "Press it back up."],
  cues: ["Feet down.", "Wrists straight."],
  mistakes: ["Bouncing the bar.", "Flaring the elbows."],
};

const guidance = (patch: Partial<ExerciseGuidance> = {}): ExerciseGuidance => ({
  ...NO_GUIDANCE,
  guide: GUIDE,
  logNote: "Log the bar and plates together.",
  demonstrations: [
    {
      title: "How to bench press",
      channel: "Coach Channel",
      url: "https://www.youtube.com/watch?v=abcdefghijk",
      status: "approved",
    },
  ],
  ...patch,
});

/** The captions down the guide, in order, as a reader meets them. */
const terms = () => screen.queryAllByRole("term").map((term) => term.textContent);

it("shows the guide's setup, steps, cues and mistakes, then how to log and the programme cue", () => {
  render(
    <ExerciseGuide
      guidance={guidance()}
      programmeCue="Pause on the chest."
      libraryHref={LIBRARY}
    />,
  );
  expect(terms()).toEqual([
    "Setup",
    "Steps",
    "Cues",
    "Common mistakes",
    "How to log",
    "Programme cue",
  ]);
  // Steps are numbered, in order; cues and mistakes are short lines.
  const steps = screen.getAllByRole("list")[0]!;
  expect(steps.tagName).toBe("OL");
  expect(
    within(steps)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(GUIDE.steps);
  expect(screen.getByText("Pause on the chest.")).toBeTruthy();
  expect(screen.queryByText("Draft for review")).toBeNull();
  expect(screen.queryByText("Guide not available yet.")).toBeNull();
});

it("opens the demonstration on YouTube and goes on to the library", () => {
  render(<ExerciseGuide guidance={guidance()} libraryHref={LIBRARY} />);
  const watch = screen.getByRole("link", { name: /Watch demonstration/ });
  expect(watch.getAttribute("href")).toBe("https://www.youtube.com/watch?v=abcdefghijk");
  expect(watch.getAttribute("target")).toBe("_blank");
  expect(watch.getAttribute("rel")).toContain("noopener");
  expect(watch.textContent).toContain("Coach Channel, on YouTube");
  expect(
    screen.getByRole("link", { name: "Open in the exercise library" }).getAttribute("href"),
  ).toBe("/exercises/bench");
});

it("says plainly when there is no guide, and keeps what is written about the exercise", () => {
  render(
    <ExerciseGuide
      guidance={guidance({
        guide: null,
        demonstrations: [],
        notes: "Set the bench to 15–30°.",
        logNote: "Load is per dumbbell.",
        formUrl: "https://www.acefitness.org/example",
      })}
      programmeCue="Slow on the way down."
    />,
  );
  expect(screen.getByText("Guide not available yet.")).toBeTruthy();
  expect(terms()).toEqual(["Notes", "How to log", "Programme cue"]);
  expect(screen.getByText("Set the bench to 15–30°.")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Read a form guide" }).getAttribute("href")).toBe(
    "https://www.acefitness.org/example",
  );
  expect(screen.queryByRole("link", { name: /Watch demonstration/ })).toBeNull();
});

it("never leaves the tab blank: an exercise with nothing written still says so", () => {
  render(<ExerciseGuide guidance={NO_GUIDANCE} />);
  expect(screen.getByText("Guide not available yet.")).toBeTruthy();
  expect(screen.queryByRole("term")).toBeNull();
});

it("keeps a custom exercise's own notes as its guide", () => {
  render(
    <ExerciseGuide guidance={guidance({ guide: null, ownNotes: true, notes: "Elbows in." })} />,
  );
  expect(terms()).toEqual(["Your notes", "How to log"]);
  expect(screen.queryByText("Guide not available yet.")).toBeNull();
});

it("marks a draft guide or a candidate video as awaiting review", () => {
  const { unmount } = render(
    <ExerciseGuide guidance={guidance({ guide: { ...GUIDE, status: "draft" } })} />,
  );
  expect(screen.getByText("Draft for review")).toBeTruthy();
  unmount();
  render(
    <ExerciseGuide
      guidance={guidance({
        demonstrations: [
          {
            title: "t",
            channel: "c",
            url: "https://www.youtube.com/watch?v=abcdefghijk",
            status: "candidate",
          },
        ],
      })}
    />,
  );
  expect(screen.getByText("Draft for review")).toBeTruthy();
});

it("lists where the guide was checked, in the library", () => {
  render(
    <ExerciseGuide
      guidance={guidance()}
      sources={[
        { title: "Bench press", publisher: "NASM", url: "https://www.nasm.org/bench" },
        { title: "Chest press", publisher: "ACE", url: "https://www.acefitness.org/chest" },
      ]}
    />,
  );
  expect(screen.getByText(/Checked against/).textContent).toBe("Checked against NASM and ACE.");
  expect(screen.getByRole("link", { name: "NASM" }).getAttribute("href")).toBe(
    "https://www.nasm.org/bench",
  );
});

it("builds what the screens show from the stored guide, as drafts allow", () => {
  const stored = { ...GUIDE, status: "draft" };
  const media = [{ title: "t", channel: "c", url: "u", status: "candidate" }];
  const shared = guidanceOf(
    { userId: null, formNotes: " ", formUrl: null, logNote: "Load is per dumbbell." },
    stored,
    media,
  );
  expect(shared.guide?.status).toBe("draft");
  expect(shared.notes).toBeNull();
  expect(shared.logNote).toBe("Load is per dumbbell.");
  expect(shared.demonstrations).toEqual([
    { title: "t", channel: "c", url: "u", status: "candidate" },
  ]);
  // A custom exercise is the athlete's: their notes, no shared guide or videos.
  const own = guidanceOf(
    { userId: "me", formNotes: "Elbows in.", formUrl: null, logNote: null },
    stored,
    media,
  );
  expect(own).toMatchObject({
    guide: null,
    notes: "Elbows in.",
    ownNotes: true,
    demonstrations: [],
  });
});
