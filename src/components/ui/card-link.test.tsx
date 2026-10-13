// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { CardLink } from "./card-link";

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);

/**
 * Year audit, October 2026: at 200% text "See what you logged" wrapped under a bold first line and
 * its chevron stood at the card's far edge, a thumb's width from the words. The chevron is held to
 * the last word, so the label ends "logged ›" wherever it wraps.
 */
it("holds its chevron to the label's last word", () => {
  render(<CardLink href="/training/activities/a1">See what you logged</CardLink>);
  const link = screen.getByRole("link", { name: "See what you logged" });
  expect(link.getAttribute("href")).toBe("/training/activities/a1");
  expect(link.className).toBe("activity-card-link");
  const end = link.querySelector(".activity-card-link-end")!;
  expect(link.firstChild?.textContent).toBe("See what you ");
  expect(end.textContent).toBe("logged");
  expect(end.lastElementChild?.tagName.toLowerCase()).toBe("svg");
  expect(end.lastElementChild?.getAttribute("class")).toContain("glyph-18");
});

it("holds a one-word label whole with its chevron", () => {
  render(<CardLink href="/gyms/g1/programme">Open</CardLink>);
  const link = screen.getByRole("link", { name: "Open" });
  expect(link.querySelector(".activity-card-link-end")?.textContent).toBe("Open");
  expect(link.childNodes).toHaveLength(1);
});
