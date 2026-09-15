import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isValidUsername,
  normaliseUsername,
  RESERVED_USERNAMES,
  usernameFromEmail,
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
