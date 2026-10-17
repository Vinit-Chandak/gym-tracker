// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ProgrammeTabs } from "./programme-tabs";

const replace = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
afterEach(cleanup);

it("keeps the selected tab in sync when navigation changes the server view", () => {
  const { rerender } = render(<ProgrammeTabs view="cycle" waiting={2} />);
  expect(screen.getByRole("tab", { name: "Plan" }).getAttribute("aria-selected")).toBe("true");
  rerender(<ProgrammeTabs view="changes" waiting={2} />);
  expect(screen.getByRole("tab", { name: "Changes (2)" }).getAttribute("aria-selected")).toBe(
    "true",
  );
  expect(screen.getByRole("tab", { name: "Plan" }).getAttribute("aria-selected")).toBe("false");
});

it("keeps programme navigation under Training", () => {
  render(<ProgrammeTabs view="cycle" waiting={0} />);
  fireEvent.click(screen.getByRole("tab", { name: "Changes" }));
  expect(replace).toHaveBeenCalledWith("/training/programmes/strength?view=changes", {
    scroll: false,
  });
});
