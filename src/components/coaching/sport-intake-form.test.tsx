// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import { saveCoachIntakeAction } from "@/server/actions/coaching-workflow";
import { SportIntakeForm } from "./sport-intake-form";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  unstable_rethrow: () => {},
}));
vi.mock("@/server/actions/coaching-workflow", () => ({
  saveCoachIntakeAction: vi.fn(),
  createCoachProgramAction: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("keeps typed sport-specific answers when a save loses its connection", async () => {
  vi.mocked(saveCoachIntakeAction).mockRejectedValue(new TypeError("Failed to fetch"));
  render(
    <SportIntakeForm
      sport="running"
      scope="programme"
      initial={null}
      prefill={coachIntakeSchema.parse({ programmeSport: "running" })}
    />,
  );
  fireEvent.change(screen.getByLabelText("What are you training for?"), {
    target: { value: "An autumn 10k" },
  });
  fireEvent.change(screen.getByLabelText("Sessions a week"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Minutes per session"), { target: { value: "40" } });
  fireEvent.click(screen.getByRole("button", { name: "Save answers" }));
  await screen.findByText(/Connection lost/);
  expect(screen.getByLabelText("What are you training for?")).toHaveProperty(
    "value",
    "An autumn 10k",
  );
  expect(screen.getByLabelText("Sessions a week")).toHaveProperty("value", "3");
  expect(screen.queryByLabelText("Height (cm)")).toBeNull();
  await waitFor(() =>
    expect(saveCoachIntakeAction).toHaveBeenCalledWith(
      expect.objectContaining({
        programmeSport: "running",
        scope: "programme",
        sessionsPerWeek: 3,
      }),
      null,
    ),
  );
});
