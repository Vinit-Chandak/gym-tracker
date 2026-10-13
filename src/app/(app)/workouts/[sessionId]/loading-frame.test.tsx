// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { WorkoutLoadingFrame } from "./loading-frame";

const route = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(route.search),
}));
afterEach(cleanup);

/**
 * Year audit, October 2026: a workout opened with no origin is History's, so the tab bar lit
 * Progress over the open workout's loading screen until its layer came. What loads with no
 * origin is the open workout, whose layer has no tabs; a finished one a tab opens keeps them.
 */
it("hides the tabs while the open workout loads, and keeps them for a record a tab opens", () => {
  route.search = "";
  const { container } = render(
    <WorkoutLoadingFrame>
      <p>Loading</p>
    </WorkoutLoadingFrame>,
  );
  expect(container.querySelector(".session-page")?.textContent).toBe("Loading");
  cleanup();
  route.search = "from=history&exercise=abc";
  const opened = render(
    <WorkoutLoadingFrame>
      <p>Loading</p>
    </WorkoutLoadingFrame>,
  );
  expect(opened.container.querySelector(".session-page")).toBeNull();
  expect(opened.container.textContent).toBe("Loading");
  cleanup();
  // The summary Finish lands on names Today, and is still the session's layer.
  route.search = "from=today&finished=1";
  const summary = render(
    <WorkoutLoadingFrame>
      <p>Loading</p>
    </WorkoutLoadingFrame>,
  );
  expect(summary.container.querySelector(".session-page")?.textContent).toBe("Loading");
});
