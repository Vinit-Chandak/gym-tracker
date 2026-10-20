// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { RunningForm } from "./running-form";

vi.mock("@/lib/offline-submit", () => ({
  keepsFormOnDisconnect: (action: unknown) => action,
}));

afterEach(cleanup);

const props = {
  action: async () => ({}),
  initial: { startedAt: "2026-10-20T07:00" },
  submissionKey: "run-submission",
  submitLabel: "Save run",
};

/**
 * A run logged on a phone's number pad, which has neither a colon nor a point: the time is
 * typed in digits and the colons place themselves, and the distance is its whole and what
 * follows the point, the point drawn between them.
 */
it("takes a run's distance and time in digits alone, and says the pace they make", () => {
  const { container } = render(<RunningForm {...props} />);
  const posted = () => new FormData(container.querySelector("form")!);
  const whole = screen.getByLabelText("Distance") as HTMLInputElement;
  const after = screen.getByLabelText("Distance, after the point") as HTMLInputElement;
  const time = screen.getByLabelText("Duration") as HTMLInputElement;
  for (const field of [whole, after, time]) expect(field.getAttribute("inputmode")).toBe("numeric");

  fireEvent.change(whole, { target: { value: "5" } });
  fireEvent.change(after, { target: { value: "2" } });
  fireEvent.change(time, { target: { value: "2530" } });
  expect(time.value).toBe("25:30");
  expect(posted().get("distanceValue")).toBe("5.2");
  expect(posted().get("distanceUnit")).toBe("km");
  expect([posted().get("hours"), posted().get("minutes"), posted().get("seconds")]).toEqual([
    "0",
    "25",
    "30",
  ]);
  expect(screen.getByRole("status").textContent).toBe("Pace 4:54 /km");
});

it("drops the zero a whole stood at once a figure is typed after it", () => {
  render(<RunningForm {...props} />);
  const whole = screen.getByLabelText("Distance") as HTMLInputElement;
  fireEvent.change(screen.getByLabelText("Distance, after the point"), { target: { value: "5" } });
  expect(whole.value).toBe("0");
  fireEvent.change(whole, { target: { value: "08" } });
  expect(whole.value).toBe("8");
});

it("moves on after a point typed into the whole, from a keyboard that has one", () => {
  const { container } = render(<RunningForm {...props} />);
  const whole = screen.getByLabelText("Distance") as HTMLInputElement;
  const after = screen.getByLabelText("Distance, after the point") as HTMLInputElement;
  fireEvent.change(whole, { target: { value: "10.55" } });
  expect([whole.value, after.value]).toEqual(["10", "55"]);
  expect(document.activeElement).toBe(after);
  expect(new FormData(container.querySelector("form")!).get("distanceValue")).toBe("10.55");
});

it("steps the distance by a tenth and the time by a minute, in their parts", () => {
  render(<RunningForm {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "More, 0.1 km" }));
  fireEvent.click(screen.getByRole("button", { name: "More, 0.1 km" }));
  expect((screen.getByLabelText("Distance") as HTMLInputElement).value).toBe("0");
  expect((screen.getByLabelText("Distance, after the point") as HTMLInputElement).value).toBe("2");
  const time = screen.getByLabelText("Duration") as HTMLInputElement;
  fireEvent.change(time, { target: { value: "2530" } });
  fireEvent.click(screen.getByRole("button", { name: "A minute more" }));
  expect(time.value).toBe("26:00");
});

it("writes a time left past sixty as the clock does", () => {
  render(<RunningForm {...props} />);
  const time = screen.getByLabelText("Duration") as HTMLInputElement;
  fireEvent.change(time, { target: { value: "75" } });
  expect(time.value).toBe("0:75");
  fireEvent.blur(time);
  expect(time.value).toBe("1:15");
});

it("opens a recorded run in its parts and keeps its time to the tenth until it is changed", () => {
  const { container } = render(
    <RunningForm
      {...props}
      initial={{
        ...props.initial,
        distanceValue: "21.1",
        distanceUnit: "km",
        hours: "1",
        minutes: "52",
        seconds: "7.4",
      }}
    />,
  );
  const posted = () => new FormData(container.querySelector("form")!);
  expect((screen.getByLabelText("Distance") as HTMLInputElement).value).toBe("21");
  expect((screen.getByLabelText("Distance, after the point") as HTMLInputElement).value).toBe("1");
  expect((screen.getByLabelText("Duration") as HTMLInputElement).value).toBe("1:52:07");
  // Nothing typed, so nothing rounded: the record's tenth goes back as it came.
  fireEvent.blur(screen.getByLabelText("Duration"));
  expect(posted().get("seconds")).toBe("7.4");
  expect(posted().get("distanceValue")).toBe("21.1");
});
