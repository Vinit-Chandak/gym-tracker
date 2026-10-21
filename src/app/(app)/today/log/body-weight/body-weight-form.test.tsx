// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { logBodyWeightAction } from "@/server/actions/body-weight";

import { BodyWeightForm } from "./body-weight-form";

const router = vi.hoisted(() => ({ back: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, unstable_rethrow: () => {} }));
vi.mock("@/server/actions/body-weight", () => ({ logBodyWeightAction: vi.fn(async () => ({})) }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState(null, "");
});

const TODAY = "2026-10-20";
const weight = () => screen.getByRole<HTMLInputElement>("textbox", { name: "Body weight (kg)" });
const date = () => screen.getByLabelText<HTMLInputElement>("Date");

describe("logging body weight", () => {
  it("asks for the day, today unless another, never a later one, and the weight in the unit", () => {
    const { container } = render(<BodyWeightForm today={TODAY} unit="lb" last={null} />);
    expect(date().value).toBe(TODAY);
    expect(date().max).toBe(TODAY);
    expect(date().required).toBe(true);
    const field = screen.getByRole<HTMLInputElement>("textbox", { name: "Body weight (lb)" });
    expect(field.required).toBe(true);
    // The unit it is typed in goes with it, so the server never reads it in another.
    expect(new FormData(container.querySelector("form")!).get("unit")).toBe("lb");
    expect(screen.getByRole("button", { name: "Save" })).toBeTruthy();
  });

  it("says what the scale said last, or what saving would replace on that day", () => {
    render(
      <BodyWeightForm
        today={TODAY}
        unit="kg"
        last={{ measuredOn: "2026-10-17", weightKg: 75.24 }}
      />,
    );
    // The default matcher reads a no-break space as a space.
    expect(screen.getByText("Last 75.2 kg · Sat 17 Oct")).toBeTruthy();
    fireEvent.change(date(), { target: { value: "2026-10-17" } });
    expect(screen.getByText("Replaces 75.2 kg")).toBeTruthy();
    // One a day, which is the ⓘ's to say.
    fireEvent.click(screen.getByRole("button", { name: "About body weight (kg)" }));
    expect(screen.getByRole("note").textContent).toBe(
      "One reading a day: a second that day replaces the first.",
    );
  });

  it("lands on the trend once saved from Log", async () => {
    window.history.replaceState({ overloadPreviousPage: "/today/log" }, "");
    render(<BodyWeightForm today={TODAY} unit="kg" last={null} />);
    fireEvent.change(weight(), { target: { value: "74.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/progress?view=body"));
    expect(router.back).not.toHaveBeenCalled();
    const sent = vi.mocked(logBodyWeightAction).mock.calls[0]![1];
    expect(Object.fromEntries(sent)).toEqual({
      measuredOn: TODAY,
      unit: "kg",
      bodyWeight: "74.5",
    });
  });

  it("goes back to the page it was opened from, which now shows it", async () => {
    window.history.replaceState({ overloadPreviousPage: "/food/targets" }, "");
    render(<BodyWeightForm today={TODAY} unit="kg" last={null} />);
    fireEvent.change(weight(), { target: { value: "74.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(router.back).toHaveBeenCalledOnce());
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("stays, with what was typed, when the save is refused", async () => {
    vi.mocked(logBodyWeightAction).mockResolvedValueOnce({
      fieldErrors: { measuredOn: "Enter today or an earlier date." },
      values: { measuredOn: "2026-10-21", unit: "kg", bodyWeight: "74.5" },
    });
    render(<BodyWeightForm today={TODAY} unit="kg" last={null} />);
    fireEvent.change(weight(), { target: { value: "74.5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter today or an earlier date.")).toBeTruthy();
    expect(weight().value).toBe("74.5");
    expect(router.replace).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });
});
