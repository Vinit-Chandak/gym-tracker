// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { PeopleLists } from "./people-lists";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
vi.mock("@/server/actions/follows", () => ({
  removeFollowerAction: vi.fn(),
  unfollowAction: vi.fn(),
}));
afterEach(cleanup);

it("switches the list when navigation changes the people query", () => {
  const { rerender } = render(<PeopleLists following={[]} followers={[]} initial="following" />);
  expect(screen.getByText("You follow nobody yet.")).toBeTruthy();
  rerender(<PeopleLists following={[]} followers={[]} initial="followers" />);
  expect(screen.getByText("Nobody follows you yet.")).toBeTruthy();
  expect(screen.queryByText("You follow nobody yet.")).toBeNull();
});
