import { describe, expect, it } from "vitest";
import { COACH_CONTRACT_VERSION, contractSkew } from "./coaching-workflow";

describe("contract skew", () => {
  it("passes the version the checkout was written for", () => {
    expect(contractSkew(COACH_CONTRACT_VERSION)).toBeNull();
  });

  it("names both versions and says which side is behind", () => {
    const stale = contractSkew(COACH_CONTRACT_VERSION + 1);
    expect(stale).toContain(`${COACH_CONTRACT_VERSION + 1}`);
    expect(stale).toContain(`${COACH_CONTRACT_VERSION}`);
    expect(stale).toMatch(/stale clone/);

    // The other direction is a deployment still in flight, not a stale routine.
    expect(contractSkew(COACH_CONTRACT_VERSION - 1)).toMatch(/ahead of the deployed app/);
  });

  it("tells the coach to stop rather than guess at the renamed field", () => {
    expect(contractSkew(COACH_CONTRACT_VERSION + 1)).toMatch(/do not guess at field names/);
  });

  it("names the command that recovers a stale clone, and refuses to force it", () => {
    // A routine reusing a cached workspace reads this line and nothing else, so telling it to
    // "re-run on the default branch" left the one thing it had to do unsaid.
    const stale = contractSkew(COACH_CONTRACT_VERSION + 1);
    expect(stale).toContain("git merge --ff-only origin/main");
    expect(stale).toMatch(/rather than forcing it/);
  });
});
