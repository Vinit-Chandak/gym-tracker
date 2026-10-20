import { expect, it } from "vitest";

import { hiddenTrainingLine } from "./head-to-head";

const them = { username: "sam", displayName: "Sam Lee" };

it("says why a person's training is hidden, as the follow button stands", () => {
  // Beside a button that says Follow or Request, as Sam chooses: no verb to clash with it.
  expect(hiddenTrainingLine({ them, relation: { outgoing: null } })).toBe(
    "Only followers see their training.",
  );
  // Under a button that already says Requested.
  expect(hiddenTrainingLine({ them, relation: { outgoing: "pending" } })).toBe(
    "Their training shows once they accept.",
  );
  expect(hiddenTrainingLine({ them, relation: { outgoing: "accepted" } })).toBe(
    "Sam Lee keeps their training private.",
  );
});
