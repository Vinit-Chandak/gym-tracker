// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileForm } from "./profile-form";

vi.mock("@/server/actions/profile", () => ({ saveProfileAction: vi.fn(async () => ({})) }));
afterEach(cleanup);

it("does not let an action reset the selected unit while leaving converted values on screen", () => {
  const { container } = render(
    <ProfileForm
      values={{
        displayName: "QA",
        timeZone: "UTC",
        preferredUnit: "kg",
        bodyWeightKg: 75,
        heightCm: 178,
        dateOfBirth: "1995-05-14",
        sex: "male",
        trainingGoal: "get_stronger",
      }}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "lb (pounds)" }));
  container.querySelector("form")!.reset();
  expect((screen.getByRole("radio", { name: "lb (pounds)" }) as HTMLInputElement).checked).toBe(
    true,
  );
  expect(new FormData(container.querySelector("form")!).get("preferredUnit")).toBe("lb");
  expect(screen.getByRole("textbox", { name: "Body weight (lb)" })).toBeTruthy();
});
