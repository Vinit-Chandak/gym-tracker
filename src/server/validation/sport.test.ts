import { describe, expect, it } from "vitest";
import { parseSport } from "./sport";

describe("the sport search parameter", () => {
  it("accepts both vocabularies for the same sport", () => {
    expect(parseSport("run")).toBe("run");
    expect(parseSport("running")).toBe("run");
    expect(parseSport("cycle")).toBe("cycle");
    expect(parseSport("cycling")).toBe("cycle");
    expect(parseSport("swim")).toBe("swim");
    expect(parseSport("swimming")).toBe("swim");
    expect(parseSport("workout")).toBe("workout");
    expect(parseSport("strength")).toBe("workout");
  });

  it("falls back to lifting for anything else, and never guesses", () => {
    expect(parseSport(undefined)).toBe("workout");
    expect(parseSport(["run", "cycle"])).toBe("workout");
    expect(parseSport("rowing")).toBe("workout");
  });
});
