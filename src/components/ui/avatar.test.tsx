// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { avatarHue } from "@/domain/avatar";

import { Avatar } from "./avatar";

afterEach(cleanup);

it("draws the initial on a circle whose hue is the username's, out of the accessibility tree", () => {
  const { container } = render(<Avatar username="phani03" displayName="Phani" size="header" />);
  const circle = container.firstElementChild as HTMLElement;
  expect(circle.textContent).toBe("P");
  expect(circle.getAttribute("aria-hidden")).toBe("true");
  expect(circle.style.getPropertyValue("--avatar-hue")).toBe(String(avatarHue("phani03")));
  expect(circle.className).toContain("size-16");
});
