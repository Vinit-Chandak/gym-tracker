// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ProgramBuilder } from "./program-builder";
import { saveProgramDraftAction } from "@/server/actions/coaching-workflow";

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

it("leaves programme length validation to the server without creating endurance rows", async () => {
  vi.mocked(saveProgramDraftAction).mockResolvedValue({
    ok: false,
    error: "Choose 1 to 52 weeks.",
  });
  renderBuilder();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Number of weeks" }), {
    target: { value: "100000" },
  });
  expect(screen.queryByRole("checkbox", { name: "Include a run" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Preview programme" }));
  await screen.findByText("Choose 1 to 52 weeks.");
  expect(saveProgramDraftAction).toHaveBeenLastCalledWith(
    expect.objectContaining({ sport: "strength", runs: [], weeks: 100000 }),
    undefined,
    undefined,
  );
});

it.each(["change", "remove"])(
  "does not %s another lifting day's weekday when editing a rest day",
  (operation) => {
    renderBuilder();
    fireEvent.change(screen.getByRole("spinbutton", { name: "Number of weeks" }), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Usual weekday" }), {
      target: { value: "1" },
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
      (screen.getAllByRole("combobox", { name: "Usual weekday" })[0] as HTMLSelectElement).value,
    ).toBe("1");
  },
);

it("saves a dedicated lifting programme without embedding another sport", async () => {
  vi.mocked(saveProgramDraftAction).mockResolvedValue({ ok: false, error: "Review the days." });
  renderBuilder();
  fireEvent.change(screen.getByRole("spinbutton", { name: "Number of weeks" }), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByRole("combobox", { name: "Usual weekday" }), {
    target: { value: "1" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add a day" }));
  fireEvent.change(screen.getAllByRole("combobox", { name: "Usual weekday" })[1]!, {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Number of weeks" }), {
    target: { value: "2" },
  });
  fireEvent.change(screen.getAllByRole("combobox", { name: "Usual weekday" })[1]!, {
    target: { value: "2" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Remove day" })[1]!);
  fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
  await waitFor(() =>
    expect(saveProgramDraftAction).toHaveBeenLastCalledWith(
      expect.objectContaining({
        sport: "strength",
        runs: [],
        days: [expect.objectContaining({ includesRun: false })],
      }),
      undefined,
      undefined,
    ),
  );
});
