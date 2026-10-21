// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { formValues, type FormState } from "@/server/validation/form";

import { CheckInForm } from "./check-in-form";

vi.mock("@/lib/offline-submit", () => ({
  keepsFormOnDisconnect: (action: unknown) => action,
}));

afterEach(cleanup);

/**
 * A 1–5 scale can be let go, so it holds its choice in state; React's reset after a refused
 * save used to show and send the answer it opened on instead (PRODUCT.md, principle 8).
 */
it("keeps every reading chosen when the check-in is refused", async () => {
  const { container } = render(
    <CheckInForm
      mode="start"
      initial={{ sleepHours: "", sleepQuality: "", fatigue: "", soreness: "" }}
      action={async (_state: FormState, form: FormData) => ({
        formError: "Connection lost. We could not confirm the save.",
        values: formValues(form),
      })}
    />,
  );
  const fatigue = screen.getByRole("radiogroup", { name: "General fatigue" });
  fireEvent.click(within(fatigue).getByRole("radio", { name: "4" }));
  fireEvent.submit(container.querySelector("form")!);
  expect((await screen.findByRole("alert")).textContent).toContain("Connection lost");

  expect(within(fatigue).getByRole<HTMLInputElement>("radio", { name: "4" }).checked).toBe(true);
  expect(new FormData(container.querySelector("form")!).get("fatigue")).toBe("4");
});
