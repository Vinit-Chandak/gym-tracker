import { describe, expect, it } from "vitest";
import { COACH_CONTRACT_VERSION, contractSkew, describeRefusal } from "./coaching-workflow";

describe("a refusal as the worker reads it", () => {
  it("lists every guardrail finding, which arrive as plain sentences", () => {
    // The body a guardrail refusal sends: `error` repeats the first of `issues`. Read as
    // `{ path, message }` pairs, each of these printed as ": " and only `error` got through.
    const text = describeRefusal({
      error: "high-bar-squat: the load change exceeds the automatic limit and needs review.",
      issues: [
        "high-bar-squat: the load change exceeds the automatic limit and needs review.",
        "high-bar-squat: the change is not supported by repeated comparable performance.",
        "high-bar-squat: the combined changes from the logged load over 14 days need review.",
      ],
    });
    expect(text).toBe(
      [
        "high-bar-squat: the load change exceeds the automatic limit and needs review.",
        "3 issues:",
        "  1. high-bar-squat: the load change exceeds the automatic limit and needs review.",
        "  2. high-bar-squat: the change is not supported by repeated comparable performance.",
        "  3. high-bar-squat: the combined changes from the logged load over 14 days need review.",
      ].join("\n"),
    );
    expect(text).not.toContain(": ;");
  });

  it("names where each plan validation and schema issue is, whichever way the path is written", () => {
    expect(
      describeRefusal({
        error: "The plan is not usable.",
        issues: [{ path: "exercises.0.slotId", message: "Not a slot of the day being planned." }],
      }),
    ).toBe(
      "The plan is not usable.\n1 issue:\n  1. exercises.0.slotId: Not a slot of the day being planned.",
    );
    expect(
      describeRefusal({
        error: "Invalid coaching request.",
        issues: [
          {
            code: "invalid_type",
            path: ["plan", "exercises", 0, "sets"],
            message: "Expected array",
          },
          { code: "custom", path: [], message: "Something about the whole result" },
        ],
      }),
    ).toBe(
      "Invalid coaching request.\n2 issues:\n  1. plan.exercises.0.sets: Expected array\n  2. Something about the whole result",
    );
  });

  it("keeps a single refusal on one line and never drops what it cannot read", () => {
    expect(describeRefusal({ error: "This is not the current attempt." })).toBe(
      "This is not the current attempt.",
    );
    expect(describeRefusal({ error: "Nothing to plan for this athlete.", reason: "no_gym" })).toBe(
      "Nothing to plan for this athlete. · no_gym",
    );
    expect(describeRefusal({ issues: [{ unexpected: true }] })).toBe(
      '1 issue:\n  1. {"unexpected":true}',
    );
    expect(describeRefusal("Bad gateway")).toBe("Bad gateway");
    expect(describeRefusal({ status: "unknown" })).toBe('{"status":"unknown"}');
  });
});

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
