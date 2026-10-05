// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { ScaleField } from "./scale-field";

afterEach(cleanup);

it("draws a descending scale from 5 down, its ends with it, and stores the number tapped", () => {
  const { container } = render(
    <form>
      <ScaleField label="Quality" name="sleepQuality" ends={["poor", "great"]} descending />
    </form>,
  );
  const radios = screen.getAllByRole("radio") as HTMLInputElement[];
  expect(radios.map((radio) => radio.value)).toEqual(["5", "4", "3", "2", "1"]);
  expect(container.querySelector(".scale-ends")?.textContent).toBe("5 greatpoor 1");
  radios[0]!.click();
  expect(new FormData(container.querySelector("form")!).get("sleepQuality")).toBe("5");
});

it("draws an ascending scale from 1 up", () => {
  const { container } = render(
    <ScaleField label="Soreness" name="soreness" ends={["none", "severe"]} />,
  );
  expect((screen.getAllByRole("radio") as HTMLInputElement[]).map((radio) => radio.value)).toEqual([
    "1",
    "2",
    "3",
    "4",
    "5",
  ]);
  expect(container.querySelector(".scale-ends")?.textContent).toBe("1 nonesevere 5");
});
