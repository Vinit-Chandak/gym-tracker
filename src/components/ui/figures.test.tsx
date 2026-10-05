// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { Figures } from "./figures";

afterEach(cleanup);

it("sets the digits in Jost and leaves the dash and the words as they were", () => {
  const { container } = render(
    <p>
      <Figures>{"70–90 min"}</Figures>
    </p>,
  );
  expect(container.textContent).toBe("70–90 min");
  expect([...container.querySelectorAll(".figures")].map((span) => span.textContent)).toEqual([
    "70",
    "90",
  ]);
});

it("keeps a time and a decimal whole", () => {
  const { container } = render(
    <p>
      <Figures>{"Sun 4 Oct, 19:27 · 62.5 kg"}</Figures>
    </p>,
  );
  expect([...container.querySelectorAll(".figures")].map((span) => span.textContent)).toEqual([
    "4",
    "19:27",
    "62.5",
  ]);
});
