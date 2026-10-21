// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { formValues, type FormState } from "@/server/validation/form";

import { CyclingForm } from "./cycling-form";
import { RunningForm } from "./running-form";
import { ScheduleForm } from "./schedule-form";
import { SwimmingForm } from "./swimming-form";

/**
 * A refused save keeps everything (PRODUCT.md, principle 8). React resets a form once its
 * action settles; an uncontrolled select then goes back to the option it mounted with, and a
 * controlled choice shows its default while its state holds the athlete's. These submit a real
 * refusal and read every choice afterwards, as the athlete would see it and as the next save
 * would send it.
 */

vi.mock("@/lib/offline-submit", () => ({
  keepsFormOnDisconnect: (action: unknown) => action,
}));

afterEach(cleanup);

/** What a refused save answers: a field's sentence and what was typed. */
const refuse =
  (field: string, message: string) =>
  async (_state: FormState, form: FormData): Promise<FormState> => ({
    fieldErrors: { [field]: message },
    values: formValues(form),
  });

const props = {
  initial: { startedAt: "2026-10-20T07:00" },
  submissionKey: "refused-save",
  submitLabel: "Save",
};

const sent = (container: HTMLElement) => new FormData(container.querySelector("form")!);

it("keeps a run's kind, where and effort after a refusal", async () => {
  const { container } = render(
    <RunningForm {...props} action={refuse("distance", "Enter how far you ran.")} />,
  );
  const kind = screen.getByLabelText("Kind of run") as HTMLSelectElement;
  fireEvent.change(kind, { target: { value: "intervals" } });
  fireEvent.click(screen.getByRole("radio", { name: "Treadmill" }));
  fireEvent.click(screen.getByRole("radio", { name: "4" }));
  fireEvent.submit(container.querySelector("form")!);
  expect((await screen.findByRole("alert")).textContent).toBe("Enter how far you ran.");

  expect(kind.value).toBe("intervals");
  expect(sent(container).get("runType")).toBe("intervals");
  expect(sent(container).get("environment")).toBe("treadmill");
  expect(sent(container).get("effort")).toBe("4");
});

it("keeps a swim's stroke, where and how it was measured after a refusal", async () => {
  const { container } = render(
    <SwimmingForm
      {...props}
      initial={{ ...props.initial, environment: "pool", poolLengthUnit: "m" }}
      action={refuse("lengths", "Enter how many lengths you swam.")}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Count lengths" }));
  const stroke = screen.getByLabelText("Stroke") as HTMLSelectElement;
  fireEvent.change(stroke, { target: { value: "breaststroke" } });
  fireEvent.submit(container.querySelector("form")!);
  expect((await screen.findByRole("alert")).textContent).toBe("Enter how many lengths you swam.");

  expect(stroke.value).toBe("breaststroke");
  expect(screen.getByRole<HTMLInputElement>("radio", { name: "Count lengths" }).checked).toBe(true);
  expect(sent(container).get("stroke")).toBe("breaststroke");
  expect(sent(container).get("distanceMethod")).toBe("lengths");
  expect(sent(container).get("environment")).toBe("pool");
});

it("keeps a ride's where and assistance after a refusal", async () => {
  const { container } = render(
    <CyclingForm
      {...props}
      action={refuse("duration", "Enter the duration as more than zero and under seven days.")}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Assisted" }));
  fireEvent.click(screen.getByRole("radio", { name: "Indoor" }));
  fireEvent.submit(container.querySelector("form")!);
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Enter the duration as more than zero and under seven days.",
  );

  expect(screen.getByRole<HTMLInputElement>("radio", { name: "Indoor" }).checked).toBe(true);
  expect(sent(container).get("environment")).toBe("indoor");
  expect(sent(container).get("assistance")).toBe("assisted");
});

it("keeps a scheduled session's sport and template after a refusal", async () => {
  const { container } = render(
    <ScheduleForm
      action={refuse("scheduledOn", "Choose today or a later day.")}
      sport="running"
      sports={["running", "cycling"]}
      today="2026-10-21"
      templates={[
        {
          sport: "cycling",
          id: "template-1",
          revisionId: "revision-1",
          name: "Hill ride",
          summary: "90 min",
        },
      ]}
    />,
  );
  fireEvent.click(screen.getByRole("radio", { name: "Cycling" }));
  const template = screen.getByLabelText("Template") as HTMLSelectElement;
  fireEvent.change(template, { target: { value: "template-1" } });
  fireEvent.submit(container.querySelector("form")!);
  expect((await screen.findByRole("alert")).textContent).toBe("Choose today or a later day.");

  expect(template.value).toBe("template-1");
  expect(screen.getByRole<HTMLInputElement>("radio", { name: "Cycling" }).checked).toBe(true);
  expect(sent(container).get("templateId")).toBe("template-1");
  expect(sent(container).get("templateRevisionId")).toBe("revision-1");
  expect(sent(container).get("sport")).toBe("cycling");
});
