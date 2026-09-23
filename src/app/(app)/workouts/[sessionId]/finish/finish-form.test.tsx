// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { FinishForm } from "./finish-form";

afterEach(cleanup);

const props = {
  action: async () => ({}),
  initialBodyWeight: "",
  unit: "kg" as const,
  userId: "user",
  sessionId: "session",
};

it("greys out the last reading rather than a made-up weight, and never submits it", () => {
  const { container } = render(<FinishForm {...props} lastBodyWeight="64.9" />);
  const field = screen.getByRole("textbox", { name: "Body weight (kg)" }) as HTMLInputElement;
  expect(field.placeholder).toBe("64.9");
  expect(field.value).toBe("");
  // Left blank, the day gets no reading: a placeholder is not a value.
  expect(new FormData(container.querySelector("form")!).get("bodyWeight")).toBe("");
});

it("suggests no weight to an account that has never recorded one", () => {
  render(<FinishForm {...props} lastBodyWeight="" />);
  const field = screen.getByRole("textbox", { name: "Body weight (kg)" });
  expect(field.hasAttribute("placeholder")).toBe(false);
});
