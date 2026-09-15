// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import type { FollowRelation } from "@/domain/follows";

import { FollowButton } from "./follow-button";

const actions = vi.hoisted(() => ({
  followAction: vi.fn(),
  unfollowAction: vi.fn(),
  cancelRequestAction: vi.fn(),
}));
vi.mock("@/server/actions/follows", () => actions);

beforeEach(() => {
  vi.resetAllMocks();
  // jsdom has no <dialog> implementation; the sheet only needs these to exist.
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

const relation = (overrides: Partial<FollowRelation> = {}): FollowRelation => ({
  outgoing: null,
  incoming: null,
  followApproval: true,
  ...overrides,
});

const button = (name: string | RegExp) => screen.getByRole("button", { name });

it.each([
  [relation({ followApproval: false }), "Follow"],
  [relation(), "Request"],
  [relation({ outgoing: "pending" }), "Requested"],
  [relation({ outgoing: "accepted" }), "Following"],
  [relation({ incoming: "accepted" }), "Follow back"],
])("shows the state that applies: %o → %s", (input, label) => {
  render(<FollowButton personId="p1" username="phani03" relation={input} />);
  expect(button(label)).toBeTruthy();
});

it("follows in one tap and shows what the database decided", async () => {
  actions.followAction.mockResolvedValue("pending");
  render(<FollowButton personId="p1" username="phani03" relation={relation()} />);
  fireEvent.click(button("Request"));
  await waitFor(() => expect(button("Requested")).toBeTruthy());
  expect(actions.followAction).toHaveBeenCalledWith("p1");

  cleanup();
  actions.followAction.mockResolvedValue("accepted");
  render(
    <FollowButton personId="p2" username="carol" relation={relation({ followApproval: false })} />,
  );
  fireEvent.click(button("Follow"));
  await waitFor(() => expect(button("Following")).toBeTruthy());
});

it("asks before unfollowing, and goes back to what a fresh tap would do", async () => {
  actions.unfollowAction.mockResolvedValue(undefined);
  render(
    <FollowButton
      personId="p1"
      username="phani03"
      relation={relation({ outgoing: "accepted", incoming: "accepted" })}
    />,
  );
  fireEvent.click(button("Following"));
  expect(actions.unfollowAction).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Unfollow @phani03?" })).toBeTruthy();
  fireEvent.click(button("Unfollow"));
  await waitFor(() => expect(button("Follow back")).toBeTruthy());
  expect(actions.unfollowAction).toHaveBeenCalledWith("p1");
});

it("keeps the request when the sheet is dismissed, and withdraws it when confirmed", async () => {
  actions.cancelRequestAction.mockResolvedValue(undefined);
  render(
    <FollowButton personId="p1" username="phani03" relation={relation({ outgoing: "pending" })} />,
  );
  fireEvent.click(button("Requested"));
  fireEvent.click(button("Keep"));
  expect(actions.cancelRequestAction).not.toHaveBeenCalled();
  expect(button("Requested")).toBeTruthy();
  fireEvent.click(button("Requested"));
  fireEvent.click(button("Cancel request"));
  await waitFor(() => expect(button("Request")).toBeTruthy());
  expect(actions.cancelRequestAction).toHaveBeenCalledWith("p1");
});
