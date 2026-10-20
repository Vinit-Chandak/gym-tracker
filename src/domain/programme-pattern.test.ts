import { describe, expect, it } from "vitest";

import { endurancePattern } from "./programme-pattern";

const easy = { title: "Easy run", nodes: [{ kind: "step", target: { kind: "duration" } }] };
const long = (km: number) => ({ title: "Long run", nodes: [{ kind: "step", km }] });
const session = (prescription: unknown, withdrawn = false) => ({ prescription, withdrawn });

describe("an endurance programme's pattern", () => {
  it("repeats when every session it asks for comes back unchanged", () => {
    expect(
      endurancePattern([session(easy), session(long(14)), session(easy), session(long(14))]),
    ).toBe("Repeating");
  });

  it("progresses once any session's work changes", () => {
    expect(
      endurancePattern([session(easy), session(long(12)), session(easy), session(long(14))]),
    ).toBe("Progressive");
  });

  it("ignores key order and withdrawn sessions", () => {
    const reordered = { nodes: easy.nodes, title: easy.title };
    expect(endurancePattern([session(easy), session(reordered), session(long(9), true)])).toBe(
      "Repeating",
    );
  });

  it("is progressive with nothing to read", () => {
    expect(endurancePattern([])).toBe("Progressive");
  });
});
