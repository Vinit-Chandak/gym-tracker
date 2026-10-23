// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HeartRateForm } from "./heart-rate-form";
import { saveHeartRateAction } from "@/server/actions/heart-rate";
import { formValues, parseForm } from "@/server/validation/form";
import { heartRateInputSchema } from "@/server/validation/heart-rate";

vi.mock("@/server/actions/heart-rate", () => ({ saveHeartRateAction: vi.fn(async () => ({})) }));
afterEach(cleanup);
const values = {
  maxHeartRate: 190,
  restingHeartRate: 55,
  zoneMethod: "max" as const,
  maxHeartRateAuto: true,
  floors: [95, 114, 133, 152, 171],
};

it("keeps custom zone drafts across method changes and action resets", () => {
  const { container } = render(<HeartRateForm values={values} inUse={190} estimate={190} />);
  fireEvent.click(screen.getByRole("radio", { name: "My own" }));
  fireEvent.change(screen.getByLabelText("Zone 1"), { target: { value: "105" } });
  fireEvent.change(screen.getByLabelText("Zone 3"), { target: { value: "140" } });
  fireEvent.click(screen.getByRole("radio", { name: "Of maximum" }));
  fireEvent.click(screen.getByRole("radio", { name: "My own" }));
  container.querySelector("form")!.reset();
  const sent = new FormData(container.querySelector("form")!);
  expect(sent.get("zone1")).toBe("105");
  expect(sent.get("zone3")).toBe("140");
});

it("does not call an unsaved switch change saved", async () => {
  render(<HeartRateForm values={values} inUse={190} estimate={190} />);
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Heart rate zones saved");
  fireEvent.click(screen.getByRole("switch", { name: "Raise it from my runs" }));
  expect(screen.queryByText("Heart rate zones saved")).toBeNull();
});

it("keeps an invalid corrected zone marked until its number can be saved", async () => {
  vi.mocked(saveHeartRateAction).mockImplementationOnce(async (_state, data) => ({
    fieldErrors: { zone3: "Enter where zone 3 starts." },
    values: formValues(data),
  }));
  render(<HeartRateForm values={values} inUse={186} estimate={186} />);
  fireEvent.click(screen.getByRole("radio", { name: "My own" }));
  const zone = screen.getByLabelText("Zone 3");
  fireEvent.change(zone, { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Enter where zone 3 starts.");
  fireEvent.change(zone, { target: { value: "20" } });
  expect(zone.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(zone, { target: { value: "135" } });
  expect(zone.getAttribute("aria-invalid")).not.toBe("true");
});

it("clears a corrected number while another number still needs fixing", async () => {
  vi.mocked(saveHeartRateAction).mockImplementationOnce(async (_state, data) => {
    const parsed = parseForm(heartRateInputSchema, data);
    return parsed.success ? {} : parsed.state;
  });
  render(<HeartRateForm values={values} inUse={186} estimate={186} />);
  const maximum = screen.getByRole("textbox", { name: "Maximum heart rate" });
  const resting = screen.getByLabelText("Resting heart rate");
  fireEvent.change(maximum, { target: { value: "abc" } });
  fireEvent.change(resting, { target: { value: "abc" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Enter your maximum heart rate as a number.");
  fireEvent.change(maximum, { target: { value: "190" } });
  expect(maximum.getAttribute("aria-invalid")).not.toBe("true");
  expect(resting.getAttribute("aria-invalid")).toBe("true");
});

it("validates the kept custom draft when switching methods after a refused save", async () => {
  vi.mocked(saveHeartRateAction).mockImplementationOnce(async (_state, data) => ({
    fieldErrors: { zone1: "Enter where zone 1 starts." },
    values: formValues(data),
  }));
  render(<HeartRateForm values={values} inUse={186} estimate={186} />);
  fireEvent.click(screen.getByRole("radio", { name: "My own" }));
  fireEvent.change(screen.getByLabelText("Zone 1"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Enter where zone 1 starts.");
  fireEvent.click(screen.getByRole("radio", { name: "Of maximum" }));
  fireEvent.click(screen.getByRole("radio", { name: "My own" }));
  expect(screen.getByLabelText("Zone 1").getAttribute("aria-invalid")).toBe("true");
  for (const zone of [2, 3, 4, 5])
    expect(screen.getByLabelText(`Zone ${zone}`).getAttribute("aria-invalid")).not.toBe("true");
});
