// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LoggingPreview } from "./logging-preview";

vi.mock("@/app/(app)/workouts/[sessionId]/exercise-logger", () => ({
  ExerciseLogger: () => <h1>Preview logger</h1>,
}));
vi.mock("@/components/shell/rest-timer", () => ({ startRestTimer: vi.fn() }));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

it("clears only this preview's draft, preserving the athlete's real unsaved workout", () => {
  const real = "overload:draft:v1:athlete:real-session:bench";
  const preview = "overload:draft:v1:preview:00000000-0000-4000-8000-00000000c0de:bench";
  localStorage.setItem(real, "unsaved real sets");
  localStorage.setItem(preview, "old fixture sets");
  render(<LoggingPreview scenario="first" fail={false} rest={false} />);
  expect(screen.getByRole("heading", { name: "Preview logger" })).toBeTruthy();
  expect(localStorage.getItem(real)).toBe("unsaved real sets");
  expect(localStorage.getItem(preview)).toBeNull();
});
