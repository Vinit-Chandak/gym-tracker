// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { ProgrammeTabs } from "./programme-tabs";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
afterEach(cleanup);

it("keeps the selected tab in sync when navigation changes the server view", () => {
  const { rerender } = render(<ProgrammeTabs view="cycle" waiting={2} />);
  expect(screen.getByRole("tab", { name: "Cycle" }).getAttribute("aria-selected")).toBe("true");
  rerender(<ProgrammeTabs view="changes" waiting={2} />);
  expect(screen.getByRole("tab", { name: "Changes (2)" }).getAttribute("aria-selected")).toBe(
    "true",
  );
  expect(screen.getByRole("tab", { name: "Cycle" }).getAttribute("aria-selected")).toBe("false");
});
