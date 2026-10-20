// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import AppError from "./(app)/error";
import RootError from "./error";
import NotFound from "./not-found";

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/login",
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("puts the standalone not-found screen and its way out inside a main landmark", () => {
  render(<NotFound />);
  const main = within(screen.getByRole("main"));
  expect(main.getByRole("heading", { level: 1 }).textContent).toBe("Not found");
  expect(main.getByRole("link", { name: "Back to Today" }).getAttribute("href")).toBe("/today");
});

it("keeps the root error accessible outside the shell and preserves retry behavior", () => {
  const reset = vi.fn();
  render(<RootError error={new Error("Unavailable")} reset={reset} />);
  const main = screen.getByRole("main");
  expect(main.classList.contains("standalone-error")).toBe(true);
  fireEvent.click(within(main).getByRole("button", { name: "Try again" }));
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(reset).toHaveBeenCalledOnce();
});

it("leaves app errors within the existing main and its navigation spacing", () => {
  const { container } = render(
    <main className="app-content">
      <AppError error={new Error("Unavailable")} reset={vi.fn()} />
    </main>,
  );
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(container.querySelector(".standalone-error")).toBeNull();
  expect(within(screen.getByRole("main")).getByRole("button", { name: "Try again" })).toBeTruthy();
});
