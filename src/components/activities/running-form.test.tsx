// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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

it("only asks for a treadmill incline on a treadmill, keeping it when toggled back", () => {
  const { container } = render(<RunningForm {...props} />);
  const posted = () => new FormData(container.querySelector("form")!);
  expect(screen.queryByRole("textbox", { name: "Incline %" })).toBeNull();
  expect(posted().has("treadmillInclinePercent")).toBe(false);
  fireEvent.click(screen.getByRole("radio", { name: "Treadmill" }));
  fireEvent.change(screen.getByLabelText("Incline %"), { target: { value: "2.5" } });
  expect(posted().get("treadmillInclinePercent")).toBe("2.5");
  fireEvent.click(screen.getByRole("radio", { name: "Outdoor" }));
  expect(posted().has("treadmillInclinePercent")).toBe(false);
  fireEvent.click(screen.getByRole("radio", { name: "Treadmill" }));
  expect(posted().get("treadmillInclinePercent")).toBe("2.5");
});

/**
 * A run logged on a phone's number pad, which has neither a colon nor a point: the time is
 * typed in digits and the colons place themselves, and the distance is its whole and what
 * follows the point, the point drawn between them.
 */
it("takes a run's distance and time in digits alone, and says the pace they make", () => {
  const { container } = render(<RunningForm {...props} />);
  const posted = () => new FormData(container.querySelector("form")!);
  const whole = screen.getAllByLabelText("Distance")[0] as HTMLInputElement;
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
  const whole = screen.getAllByLabelText("Distance")[0] as HTMLInputElement;
  fireEvent.change(screen.getByLabelText("Distance, after the point"), { target: { value: "5" } });
  expect(whole.value).toBe("0");
  fireEvent.change(whole, { target: { value: "08" } });
  expect(whole.value).toBe("8");
});

it("moves on after a point typed into the whole, from a keyboard that has one", () => {
  const { container } = render(<RunningForm {...props} />);
  const whole = screen.getAllByLabelText("Distance")[0] as HTMLInputElement;
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

/** The owner's session (21 October 2026): reps of about 500 m with standing rests between. */
function typeIntervals() {
  fireEvent.click(screen.getByText("Laps and intervals"));
  const reps = [
    ["0.47", "200"],
    ["0.51", "157"],
    ["0.49", "159"],
  ];
  reps.forEach(([distance, time], index) => {
    fireEvent.click(screen.getByRole("button", { name: "+ Rep" }));
    const rep = within(screen.getAllByRole("listitem").at(-1)!);
    if (index === 0) fireEvent.change(rep.getByLabelText("Unit"), { target: { value: "km" } });
    fireEvent.change(rep.getByLabelText("Distance"), { target: { value: distance } });
    fireEvent.change(rep.getByLabelText("Time"), { target: { value: time } });
    if (index < reps.length - 1) {
      fireEvent.click(screen.getByRole("button", { name: "+ Recovery" }));
      const rest = within(screen.getAllByRole("listitem").at(-1)!);
      if (index === 0) fireEvent.change(rest.getByLabelText("Time"), { target: { value: "130" } });
    }
  });
}

it("takes an interval run's totals and kind from its laps, and leads with the reps' pace", () => {
  const { container } = render(<RunningForm {...props} />);
  const posted = () => new FormData(container.querySelector("form")!);
  typeIntervals();

  // Ask once: the totals are the laps added up, marked as such, and nothing is typed twice.
  const distance = screen.getByRole("group", { name: "Distance" });
  const time = screen.getByRole("group", { name: "Duration" });
  expect(distance.textContent).toBe("DistanceFrom laps1.47km");
  expect(time.textContent).toBe("DurationFrom laps8:56");
  expect([posted().get("distanceValue"), posted().get("hours"), posted().get("seconds")]).toEqual([
    "",
    "",
    "",
  ]);
  expect(posted().get("distanceUnit")).toBe("km");

  // Reps with recoveries are intervals until another kind is chosen, and the chooser says why.
  const kind = screen.getByLabelText("Kind of run") as HTMLSelectElement;
  expect(kind.value).toBe("intervals");
  expect(posted().get("runType")).toBe("intervals");
  expect(screen.getByText("From laps", { selector: "span:not(.row-stepper-hint)" })).toBeTruthy();
  fireEvent.change(kind, { target: { value: "fartlek" } });
  expect(posted().get("runType")).toBe("fartlek");

  // 1.47 km in 5:56 of reps is 4:02 /km; the whole, rests and all, 6:05 /km.
  const paces = screen
    .getAllByRole("status")
    .find((element) => element.textContent?.includes("Rep"));
  expect(paces?.textContent).toBe("Rep pace, 3 reps4:02 /kmOverall, with rests6:05 /km");
});

it("types the watch's totals instead, and offers the laps' figure when one is short of them", async () => {
  const action = vi.fn(async (_state: unknown, form: FormData) => ({
    fieldErrors: { distance: "The laps add up to 1.47 km, more than 1.00 km." },
    values: Object.fromEntries(form) as Record<string, string>,
  }));
  const { container } = render(<RunningForm {...props} action={action} />);
  const posted = () => new FormData(container.querySelector("form")!);
  typeIntervals();
  fireEvent.click(screen.getByRole("button", { name: "Use the watch’s totals instead" }));
  // The steppers start from the laps' figures, so only what differs is typed.
  const whole = screen.getAllByLabelText("Distance")[0] as HTMLInputElement;
  expect([whole.value, (screen.getByLabelText("Duration") as HTMLInputElement).value]).toEqual([
    "1",
    "8:56",
  ]);
  fireEvent.change(screen.getByLabelText("Distance, after the point"), {
    target: { value: "00" },
  });
  // Settle the async action before reading its refusal, including under full-suite load.
  await act(async () => {
    fireEvent.submit(container.querySelector("form")!);
  });

  // A figure and its unit are held together by a no-break space, which \s matches.
  const refused = await screen.findByText(/^The laps add up to 1\.47\skm, more than 1\.00\skm\.$/);
  expect(refused.getAttribute("role")).toBe("alert");
  fireEvent.click(screen.getByRole("button", { name: /^Use 1\.47\skm$/ }));
  expect(posted().get("distanceValue")).toBe("1.47");
  // Once it can be saved, it is no longer said to be short.
  expect(screen.queryByText(/more than 1\.00/)).toBeNull();
  expect(screen.queryByRole("button", { name: /^Use 1\.47/ })).toBeNull();
});

it("leaves a total the laps hold only in part unknown, and says what it needs", async () => {
  const action = vi.fn(async (_state: unknown, form: FormData) => ({
    fieldErrors: { distance: "Enter how far you ran." },
    values: Object.fromEntries(form) as Record<string, string>,
  }));
  const { container } = render(<RunningForm {...props} action={action} />);
  const posted = () => new FormData(container.querySelector("form")!);
  fireEvent.click(screen.getByText("Laps and intervals"));
  fireEvent.click(screen.getByRole("button", { name: "+ Rep" }));
  const rep = within(screen.getAllByRole("listitem")[0]!);
  fireEvent.change(rep.getByLabelText("Unit"), { target: { value: "km" } });
  fireEvent.change(rep.getByLabelText("Distance"), { target: { value: "0.4" } });
  fireEvent.change(rep.getByLabelText("Time"), { target: { value: "130" } });
  // A second rep timed and not measured: the laps hold the time, not the distance.
  fireEvent.click(screen.getByRole("button", { name: "+ Rep" }));
  const timed = within(screen.getAllByRole("listitem")[1]!);
  fireEvent.change(timed.getByLabelText("Distance"), { target: { value: "" } });
  fireEvent.change(timed.getByLabelText("Time"), { target: { value: "100" } });

  // A gap is unknown, never zero: the distance is a dash until that rep has one.
  expect(screen.getByRole("group", { name: "Distance" }).textContent).toBe(
    "DistanceFrom lapsNot every lap has a distance—",
  );
  expect(screen.getByRole("group", { name: "Duration" }).textContent).toBe("DurationFrom laps2:30");
  expect([posted().get("distanceValue"), posted().get("hours")]).toEqual(["", ""]);

  // Saved like that, the server asks for the distance; the form says the ways to give it.
  fireEvent.submit(container.querySelector("form")!);
  expect(
    await screen.findByText("Give every lap its distance, or use the watch’s totals."),
  ).toBeTruthy();
  // The lap without one is marked where it is typed; the measured rep is not.
  expect(timed.getByLabelText("Distance").getAttribute("aria-invalid")).toBe("true");
  expect(rep.getByLabelText("Distance").getAttribute("aria-invalid")).toBeNull();
  fireEvent.change(timed.getByLabelText("Distance"), { target: { value: "0.3" } });
  expect(timed.getByLabelText("Distance").getAttribute("aria-invalid")).toBeNull();
  expect(screen.getByRole("group", { name: "Distance" }).textContent).toBe(
    "DistanceFrom laps0.70km",
  );
});

it("says a refused lap's problem at the lap it was said of, even after another is removed", async () => {
  const action = vi.fn(async (_state: unknown, form: FormData) => ({
    fieldErrors: { "laps.4": "Enter lap 5's time as more than zero and under seven days." },
    values: Object.fromEntries(form) as Record<string, string>,
  }));
  const { container } = render(<RunningForm {...props} action={action} />);
  typeIntervals();
  fireEvent.submit(container.querySelector("form")!);
  const said = await screen.findByText(
    "Enter lap 5's time as more than zero and under seven days.",
  );
  expect(said.closest("li")).toBe(screen.getAllByRole("listitem")[4]);

  // The first lap goes; the sentence stays with the lap it was about, now the fourth.
  fireEvent.click(screen.getByRole("button", { name: "Remove lap 1" }));
  expect(
    screen.getByText("Enter lap 5's time as more than zero and under seven days.").closest("li"),
  ).toBe(screen.getAllByRole("listitem")[3]);
});
