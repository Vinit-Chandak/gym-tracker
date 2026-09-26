// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { CyclingForm } from "./cycling-form";
import { RunningForm } from "./running-form";
import { SwimmingForm } from "./swimming-form";

vi.mock("@/lib/offline-submit", () => ({
  keepsFormOnDisconnect: (action: unknown) => action,
}));

afterEach(cleanup);

const initial = { startedAt: "2026-09-26T07:30" };
const props = { initial, submissionKey: "audit-submission", submitLabel: "Save activity" };

it.each([
  { name: "running hours", Form: RunningForm, key: "hours" },
  { name: "cycling seconds", Form: CyclingForm, key: "seconds" },
  { name: "swimming hours", Form: SwimmingForm, key: "hours" },
])("shows rejected $name in the duration group", async ({ Form, key }) => {
  const { container } = render(
    <Form {...props} action={async () => ({ fieldErrors: { [key]: "Enter 0 or more." } })} />,
  );
  fireEvent.submit(container.querySelector("form")!);
  expect((await screen.findByRole("alert")).textContent).toBe("Enter 0 or more.");
});

it.each([
  { name: "running heart rate", Form: RunningForm, key: "averageHeartRate" },
  { name: "cycling cadence", Form: CyclingForm, key: "averageCadenceRpm" },
  { name: "swimming time", Form: SwimmingForm, key: "activeSeconds" },
])("reveals the collapsed details when $name is rejected", async ({ Form, key }) => {
  const { container } = render(
    <Form {...props} action={async () => ({ fieldErrors: { [key]: "Check this reading." } })} />,
  );
  const details = container.querySelector("details")!;
  expect(details.open).toBe(false);
  fireEvent.submit(container.querySelector("form")!);
  expect((await screen.findByRole("alert")).textContent).toBe("Check this reading.");
  expect(details.open).toBe(true);
});
