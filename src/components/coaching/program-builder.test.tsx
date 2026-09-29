// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ProgramBuilder } from "./program-builder";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  unstable_rethrow: vi.fn(),
}));
vi.mock("@/server/actions/coaching-workflow", () => ({
  saveProgramDraftAction: vi.fn(),
  reviewProgramDraftAction: vi.fn(),
}));
vi.mock("@/server/actions/manual-training", () => ({ saveRoutineAction: vi.fn() }));

afterEach(cleanup);

function renderBuilder() {
  render(
    <ProgramBuilder
      initial={null}
      base="/profile/programme"
      warmups={[]}
      library={["Bench press", "Squat"].map((name) => ({
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
      }))}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Add a day" }));
}

it("clears the exercise selection when a search would hide it", () => {
  renderBuilder();
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

it("caps preview rows for an out-of-range programme length before server validation", () => {
  renderBuilder();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Number of weeks" }), {
    target: { value: "100000" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Include a run" }));
  expect(
    screen.getAllByRole("group").filter((group) => /^Week /.test(group.textContent ?? "")),
  ).toHaveLength(52);
});

it.each(["change", "remove"])(
  "does not %s another day's run when editing a rest day",
  (operation) => {
    renderBuilder();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Number of weeks" }), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Usual weekday" }), {
      target: { value: "1" },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Include a run" }));
    fireEvent.change(screen.getByRole("spinbutton", { name: "Minutes minimum" }), {
      target: { value: "37" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add a day" }));
    fireEvent.change(screen.getAllByRole("combobox", { name: "Usual weekday" })[1]!, {
      target: { value: "1" },
    });
    if (operation === "change") {
      fireEvent.change(screen.getAllByRole("combobox", { name: "Usual weekday" })[1]!, {
        target: { value: "2" },
      });
    } else {
      fireEvent.click(screen.getAllByRole("button", { name: "Remove day" })[1]!);
    }
    expect(
      (screen.getByRole("spinbutton", { name: "Minutes minimum" }) as HTMLInputElement).value,
    ).toBe("37");
  },
);

it("keeps shared weekday targets unique when adding, moving and removing a second running day", () => {
  renderBuilder();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Number of weeks" }), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Usual weekday" }), {
    target: { value: "1" },
  });
  fireEvent.click(screen.getByRole("checkbox", { name: "Include a run" }));
  fireEvent.change(screen.getByRole("spinbutton", { name: "Minutes minimum" }), {
    target: { value: "37" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add a day" }));
  fireEvent.change(screen.getAllByRole("combobox", { name: "Usual weekday" })[1]!, {
    target: { value: "1" },
  });
  fireEvent.click(screen.getAllByRole("checkbox", { name: "Include a run" })[1]!);
  const minutes = () => screen.getAllByRole("spinbutton", { name: "Minutes minimum" });
  expect(minutes().map((input) => (input as HTMLInputElement).value)).toEqual(["37", "37"]);
  // A length edit must not create duplicated week/weekday rows either.
  fireEvent.change(screen.getByRole("spinbutton", { name: "Number of weeks" }), {
    target: { value: "2" },
  });
  expect(minutes()).toHaveLength(4);
  fireEvent.change(screen.getAllByRole("combobox", { name: "Usual weekday" })[1]!, {
    target: { value: "2" },
  });
  expect(minutes().map((input) => (input as HTMLInputElement).value)).toEqual(["37", "", "37", ""]);
  fireEvent.click(screen.getAllByRole("button", { name: "Remove day" })[1]!);
  expect(minutes().map((input) => (input as HTMLInputElement).value)).toEqual(["37", ""]);
});
