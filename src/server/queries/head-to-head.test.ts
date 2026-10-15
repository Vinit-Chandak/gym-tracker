import { expect, it } from "vitest";

import { hiddenTrainingLine } from "./head-to-head";

const them = { username: "sam", displayName: "Sam Lee" };

it("says why a person's training is hidden, as the follow button stands", () => {
  expect(hiddenTrainingLine({ them, relation: { outgoing: null } })).toBe(
    "Follow @sam to see their training.",
  );
  // Under a button that already says Requested.
  expect(hiddenTrainingLine({ them, relation: { outgoing: "pending" } })).toBe(
    "Waiting for @sam to accept your request.",
  );
  expect(hiddenTrainingLine({ them, relation: { outgoing: "accepted" } })).toBe(
    "Sam Lee keeps their training private.",
  );
});
