// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { PersonCard } from "./person-card";

vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);

const person = { username: "vinit", displayName: "Vinit" };
const counts = { followers: 3, following: 5 };

it("opens your own page from the avatar and the name on your Profile card", () => {
  const { container } = render(
    <PersonCard person={person} counts={counts} countsLinkToFriends href="/u/vinit" />,
  );
  // One link a keyboard or a screen reader meets, named for who it is...
  expect(screen.getByRole("link", { name: /Vinit\s*@vinit/ }).getAttribute("href")).toBe(
    "/u/vinit",
  );
  // ...and the avatar, the same destination for a thumb, kept out of their way.
  const avatar = container.querySelector('a[aria-hidden="true"]');
  expect(avatar?.getAttribute("href")).toBe("/u/vinit");
  expect(avatar?.getAttribute("tabindex")).toBe("-1");
  // The counts stay links of their own, and no link sits inside another.
  expect(screen.getByRole("link", { name: "3 followers" }).getAttribute("href")).toBe(
    "/profile/friends/people?people=followers",
  );
  expect(container.querySelector("a a")).toBeNull();
});

it("links nothing on the person's own page, which is where it would lead", () => {
  render(<PersonCard person={person} counts={counts} />);
  expect(screen.queryAllByRole("link")).toHaveLength(0);
  expect(screen.getByText("@vinit")).toBeTruthy();
});
