import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isValidUsername,
  normaliseUsername,
  RESERVED_USERNAMES,
  usernameFromEmail,
  numberedUsernames,
  usernameFromName,
  usernameProblem,
} from "./username";

describe("username rules", () => {
  it.each(["vinit", "phani03", "a.b_c", "abc", "a".repeat(20), "0ab"])("accepts %s", (name) => {
    expect(isValidUsername(name)).toBe(true);
    expect(usernameProblem(name)).toBeNull();
  });

  it.each([
    ["ab", "too short"],
    ["a".repeat(21), "too long"],
    [".vinit", "leading dot"],
    ["vinit.", "trailing dot"],
    ["_vinit", "leading underscore"],
    ["vi..nit", "doubled dot"],
    ["Vinit", "uppercase"],
    ["vin it", "space"],
    ["vin-it", "hyphen"],
    ["vinít", "accent"],
    ["coach", "reserved"],
    ["profile", "reserved route"],
  ])("rejects %s (%s)", (name) => {
    expect(isValidUsername(name)).toBe(false);
    expect(usernameProblem(name)).not.toBeNull();
  });

  it("makes what was typed canonical", () => {
    expect(normaliseUsername("  @Vinit ")).toBe("vinit");
  });

  it("derives a starting point from an email", () => {
    expect(usernameFromEmail("Vinit.Chandak@example.com")).toBe("vinit.chandak");
    expect(usernameFromEmail("phani+gym@example.com")).toBe("phanigym");
    expect(usernameFromEmail("..a...b..@example.com")).toBe("a.b");
    // Two characters is one short; padded rather than thrown away.
    expect(usernameFromEmail("jo@example.com")).toBe("jo0");
    // Cut to length, and never left ending on a dot.
    expect(usernameFromEmail("abcdefghijklmnopqrs.tuv@example.com")).toBe("abcdefghijklmnopqrs");
    expect(usernameFromEmail("+++@example.com")).toBe("");
    expect(usernameFromEmail("")).toBe("");
  });

  it("makes one from the name given at sign-up, or none the rules would refuse", () => {
    expect(usernameFromName("Bea Newcomer")).toBe("bea.newcomer");
    expect(usernameFromName("  Zoë   Saint-Clair ")).toBe("zoe.saint.clair");
    expect(usernameFromName("José O’Brien")).toBe("jose.obrien");
    // Cut to twenty, and never left ending on a dot.
    expect(usernameFromName("Alexandria Ocasio Cortez")).toBe("alexandria.ocasio.co");
    expect(usernameFromName("Maximiliana Rosalind Q")).toBe("maximiliana.rosalind");
    // Too short, reserved, or nothing left: the email is used instead.
    expect(usernameFromName("Al")).toBe("");
    expect(usernameFromName("Coach")).toBe("");
    expect(usernameFromName("李小龍")).toBe("");
    expect(usernameFromName("")).toBe("");
  });

  it("numbers a name that is taken, within the length limit", () => {
    expect(numberedUsernames("kit")).toEqual([
      "kit",
      "kit2",
      "kit3",
      "kit4",
      "kit5",
      "kit6",
      "kit7",
      "kit8",
      "kit9",
    ]);
    expect(numberedUsernames("alexandria.ocasio.co")[1]).toBe("alexandria.ocasio.c2");
    expect(numberedUsernames("maximiliana.rosalind")[1]).toBe("maximiliana.rosalin2");
    expect(numberedUsernames("coach")).toEqual([]);
  });

  it("keeps the reserved list and the migration's copy identical", () => {
    const migration = readFileSync(
      new URL("../db/migrations/0019_usernames_and_privacy.sql", import.meta.url),
      "utf8",
    );
    const match = migration.match(/RESERVED_USERNAMES\s+text\[\]\s*:=\s*array\[([^\]]+)\]/i);
    expect(match).not.toBeNull();
    const inSql = match![1]!.split(",").map((word) => word.trim().replace(/^'|'$/g, ""));
    expect(inSql).toEqual([...RESERVED_USERNAMES]);
  });
});
