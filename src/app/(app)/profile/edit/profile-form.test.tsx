// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProfileForm } from "./profile-form";
import { saveProfileAction } from "@/server/actions/profile";
import { formValues, parseForm } from "@/server/validation/form";
import { profileInputSchema } from "@/server/validation/profile";

vi.mock("@/server/actions/profile", () => ({ saveProfileAction: vi.fn(async () => ({})) }));
vi.mock("@/server/actions/people", () => ({ checkUsernameAction: vi.fn(async () => "available") }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const values = {
  displayName: "Sam",
  username: "sam",
  preferredUnit: "kg" as const,
  heightCm: 178,
  dateOfBirth: "1994-03-21",
  sex: null,
  trainingGoal: "get_stronger" as const,
};

it("lets an athlete finish typing before the first validation attempt", () => {
  render(<ProfileForm values={values} />);
  const height = screen.getByLabelText("Height (cm)");
  fireEvent.change(height, { target: { value: "1" } });
  expect(height.getAttribute("aria-invalid")).not.toBe("true");
});

it("keeps all answers on failure and clears a field error only when corrected", async () => {
  vi.mocked(saveProfileAction).mockImplementationOnce(async (_state, data) => {
    const parsed = parseForm(profileInputSchema, data);
    return parsed.success ? {} : parsed.state;
  });
  render(<ProfileForm values={values} />);
  const height = screen.getByLabelText("Height (cm)") as HTMLInputElement;
  fireEvent.change(height, { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await waitFor(() => expect(height.getAttribute("aria-invalid")).toBe("true"));
  expect(height.value).toBe("30");
  fireEvent.change(height, { target: { value: "31" } });
  expect(height.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(height, { target: { value: "180" } });
  expect(height.getAttribute("aria-invalid")).not.toBe("true");
  expect((screen.getByLabelText("Name") as HTMLInputElement).value).toBe("Sam");
});

it("hides the saved notice as soon as a new edit has not been saved", async () => {
  render(<ProfileForm values={values} />);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Profile saved");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sam Taylor" } });
  expect(screen.queryByText("Profile saved")).toBeNull();
});

it("keeps a server-only username refusal while another field is corrected", async () => {
  vi.mocked(saveProfileAction).mockImplementationOnce(async (_state, data) => ({
    fieldErrors: { username: "That username is taken." },
    values: formValues(data),
  }));
  render(<ProfileForm values={values} />);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("That username is taken.");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Sam Taylor" } });
  expect(screen.getByText("That username is taken.")).toBeTruthy();
});

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
