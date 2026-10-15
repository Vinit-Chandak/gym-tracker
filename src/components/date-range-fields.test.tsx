// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { DateRangeFields } from "./date-range-fields";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/progress/history",
}));
afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

it("keeps the screen's other filters and starts the new dates on their first page", () => {
  window.history.replaceState(null, "", "/progress/history?kind=run&page=4&from=2026-01-01");
  render(<DateRangeFields from="2026-01-01" to="2026-10-11" />);
  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-06-01" } });
  fireEvent.click(screen.getByRole("button", { name: "Apply dates" }));
  expect(push).toHaveBeenCalledWith("/progress/history?kind=run&from=2026-06-01&to=2026-10-11");
});
