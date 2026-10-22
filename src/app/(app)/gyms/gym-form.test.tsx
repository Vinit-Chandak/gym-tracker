// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { GymForm } from "./gym-form";

vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
afterEach(cleanup);

it("keeps the gym type and typed fields after a refused save", async () => {
  const action = vi.fn(async () => ({ formError: "Connection lost. Retry saving." }));
  const { container } = render(<GymForm action={action} submitLabel="Save gym" />);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Garden gym" } });
  fireEvent.click(screen.getByRole("radio", { name: "Home" }));
  fireEvent.change(screen.getByLabelText("Address"), { target: { value: "Upstairs" } });
  fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Keep these notes" } });
  fireEvent.click(screen.getByRole("button", { name: "Save gym" }));
  await screen.findByText("Connection lost. Retry saving.");
  const data = new FormData(container.querySelector("form")!);
  expect(Object.fromEntries(data)).toMatchObject({
    name: "Garden gym",
    kind: "home",
    address: "Upstairs",
    notes: "Keep these notes",
  });
  expect((screen.getByRole("radio", { name: "Home" }) as HTMLInputElement).checked).toBe(true);
});

it("keeps a refused name marked until it can be saved", async () => {
  const action = vi.fn(async () => ({ fieldErrors: { name: "Give the gym a name." } }));
  render(<GymForm action={action} submitLabel="Save gym" />);
  const name = screen.getByLabelText("Name");
  fireEvent.change(name, { target: { value: " " } });
  fireEvent.click(screen.getByRole("button", { name: "Save gym" }));
  await screen.findByText("Give the gym a name.");
  fireEvent.change(name, { target: { value: "  " } });
  expect(name.getAttribute("aria-invalid")).toBe("true");
  fireEvent.change(name, { target: { value: "Garage" } });
  expect(name.getAttribute("aria-invalid")).not.toBe("true");
  expect(screen.queryByText("Give the gym a name.")).toBeNull();
});
