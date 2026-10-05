// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { ExercisePicker } from "./exercise-picker";
import { listItem } from "./exercise-picker.test-data";

afterEach(cleanup);

const EXERCISES = [
  listItem("bench", "Machine chest press"),
  listItem("curl", "Cable curl", {
    modality: "cable",
    movementPattern: "pull",
    primaryMuscles: ["biceps"],
  }),
  listItem("row", "Seated cable row", {
    modality: "cable",
    movementPattern: "pull",
    primaryMuscles: ["upper_back"],
  }),
  listItem("pushup", "Push-up", { modality: "bodyweight", requiresEquipment: false }),
];

function Several({ note }: { note?: (id: string) => string | null }) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <ExercisePicker
      mode="multiple"
      exercises={EXERCISES}
      selected={selected}
      onToggle={(id) =>
        setSelected((current) =>
          current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
        )
      }
      note={note ? (exercise) => note(exercise.id) : undefined}
    />
  );
}

it("chooses one exercise as a radio and names it under the search when the list is long", () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <ExercisePicker name="exerciseId" exercises={EXERCISES} value="" onChange={onChange} long />,
  );
  const radio = screen.getByRole("radio", { name: /Cable curl/ });
  expect(radio.getAttribute("name")).toBe("exerciseId");
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  fireEvent.click(radio);
  expect(onChange).toHaveBeenCalledWith("curl");
  rerender(
    <ExercisePicker
      name="exerciseId"
      exercises={EXERCISES}
      value="curl"
      onChange={onChange}
      long
    />,
  );
  expect(screen.getByText("Selected:").textContent).toContain("Cable curl");
});

it("chooses several as checkboxes that submit nothing themselves, each showing its place", () => {
  render(<Several />);
  const curl = screen.getByRole("checkbox", { name: /Cable curl/ });
  expect(curl.hasAttribute("name")).toBe(false);
  expect(screen.queryAllByRole("radio")).toHaveLength(0);
  fireEvent.click(screen.getByRole("checkbox", { name: /Seated cable row/ }));
  fireEvent.click(curl);
  expect((curl as HTMLInputElement).checked).toBe(true);
  const row = screen.getByRole("checkbox", { name: /Seated cable row/ }).closest("label")!;
  expect(row.querySelector(".picker-tick")?.textContent).toBe("1");
  expect(curl.closest("label")!.querySelector(".picker-tick")?.textContent).toBe("2");
});

it("keeps the selection through searches, and closes the keyboard when a result is chosen", () => {
  render(<Several />);
  const search = screen.getByRole("searchbox", { name: "Search exercises" });
  search.focus();
  fireEvent.change(search, { target: { value: "curl" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Cable curl/ }));
  expect(document.activeElement).not.toBe(search);
  fireEvent.change(search, { target: { value: "push" } });
  expect(screen.queryByRole("checkbox", { name: /Cable curl/ })).toBeNull();
  fireEvent.click(screen.getByRole("checkbox", { name: /Push-up/ }));
  fireEvent.change(search, { target: { value: "" } });
  expect((screen.getByRole("checkbox", { name: /Cable curl/ }) as HTMLInputElement).checked).toBe(
    true,
  );
  expect((screen.getByRole("checkbox", { name: /Push-up/ }) as HTMLInputElement).checked).toBe(
    true,
  );
});

it("says what is news about a row, such as being in the workout already", () => {
  render(<Several note={(id) => (id === "pushup" ? "In this workout" : null)} />);
  const row = screen.getByRole("checkbox", { name: /Push-up/ }).closest("label")!;
  expect(within(row).getByText("In this workout")).toBeTruthy();
  expect(screen.getAllByText("In this workout")).toHaveLength(1);
});
