// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { GymRows } from "./gym-rows";

afterEach(cleanup);

it("says a gym's kind only where its name does not already", () => {
  render(
    <GymRows
      gyms={[
        { id: "a", name: "Anytime Fitness", kind: "gym" },
        { id: "b", name: "Samsung Gym", kind: "gym" },
        { id: "c", name: "Home", kind: "home" },
      ]}
      chosenId="a"
      onChoose={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: /Anytime Fitness/ }).textContent).toContain("Gym");
  expect(screen.getByRole("button", { name: /Samsung Gym/ }).textContent).toBe("Samsung Gym");
  expect(screen.getByRole("button", { name: "Home" }).textContent).toBe("Home");
});
