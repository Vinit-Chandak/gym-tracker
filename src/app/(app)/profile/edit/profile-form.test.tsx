// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileForm } from "./profile-form";

vi.mock("@/server/actions/profile", () => ({ saveProfileAction: vi.fn(async () => ({})) }));
afterEach(cleanup);

it("does not let an action reset the answers chosen while leaving the typed ones on screen", () => {
  const { container } = render(
    <ProfileForm
      values={{
        displayName: "QA",
        username: "qa",
        preferredUnit: "lb",
        heightCm: 178,
        dateOfBirth: "1995-05-14",
        sex: "male",
        trainingGoal: "get_stronger",
      }}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Prefer not to say" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Training goal" }), {
    target: { value: "endurance" },
  });
  container.querySelector("form")!.reset();
  const sent = new FormData(container.querySelector("form")!);
  expect(sent.get("sex")).toBe("");
  expect(sent.get("trainingGoal")).toBe("endurance");
  // The height goes in the measure it was shown in, and says which.
  expect(sent.get("heightUnit")).toBe("ftin");
  expect(screen.getByRole("textbox", { name: "Feet" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
});
