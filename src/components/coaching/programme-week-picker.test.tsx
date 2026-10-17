// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ProgrammeWeekPicker } from "./programme-week-picker";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
afterEach(() => {
  cleanup();
  replace.mockClear();
});

it("opens a chosen week of the same sport and supports browser navigation", () => {
  const { rerender } = render(
    <ProgrammeWeekPicker sport="running" week={2} weeks={8} currentWeek={2} />,
  );
  fireEvent.change(screen.getByRole("combobox", { name: "Programme week" }), {
    target: { value: "5" },
  });
  expect(replace).toHaveBeenCalledWith("/training/programmes/running?week=5", { scroll: false });
  rerender(<ProgrammeWeekPicker sport="running" week={5} weeks={8} currentWeek={2} />);
  expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("5");
});

it("prevents browsing outside the programme", () => {
  render(<ProgrammeWeekPicker sport="swimming" week={1} weeks={1} currentWeek={1} />);
  expect(
    (screen.getByRole("button", { name: "Previous week" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect((screen.getByRole("button", { name: "Next week" }) as HTMLButtonElement).disabled).toBe(
    true,
  );
});
