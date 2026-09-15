import { describe, expect, it } from "vitest";

import { avatarHue, avatarInitial } from "./avatar";

describe("avatar", () => {
  it("gives a username the same hue every time, in range", () => {
    const hue = avatarHue("vinit");
    expect(hue).toBe(avatarHue("vinit"));
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
    expect(avatarHue("phani03")).not.toBe(hue);
  });

  it("uses the display name's first letter, or the username's", () => {
    expect(avatarInitial("Vinit Chandak", "vinit")).toBe("V");
    expect(avatarInitial("  phani", "someone")).toBe("P");
    expect(avatarInitial(null, "phani03")).toBe("P");
    expect(avatarInitial("", "0ab")).toBe("0");
  });
});
