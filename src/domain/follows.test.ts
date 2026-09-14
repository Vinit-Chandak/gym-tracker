import { describe, expect, it } from "vitest";

import { followButtonState, type FollowRelation } from "./follows";

const relation = (overrides: Partial<FollowRelation>): FollowRelation => ({
  outgoing: null,
  incoming: null,
  followApproval: true,
  ...overrides,
});

describe("follow button state", () => {
  it.each([
    [relation({ followApproval: false }), "follow"],
    [relation({ followApproval: true }), "request"],
    [relation({ outgoing: "pending" }), "requested"],
    [relation({ outgoing: "accepted" }), "following"],
    [relation({ incoming: "accepted" }), "follow_back"],
    [relation({ incoming: "accepted", followApproval: false }), "follow_back"],
    // Their pending request of you changes nothing about your side.
    [relation({ incoming: "pending", followApproval: false }), "follow"],
    // Following wins over their following you.
    [relation({ incoming: "accepted", outgoing: "accepted" }), "following"],
    [relation({ incoming: "accepted", outgoing: "pending" }), "requested"],
  ] as const)("%o → %s", (input, expected) => {
    expect(followButtonState(input)).toBe(expected);
  });
});
