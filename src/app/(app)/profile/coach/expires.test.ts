import { expect, it } from "vitest";

import { expiresLabel } from "./expires";

it("says when a token expires on the account's own clock, not the UTC date", () => {
  // Made at 20:00 on 11 Oct in Los Angeles for 90 days: 03:00 on 10 Jan 2027 in UTC, which is
  // still 9 Jan there, after the clocks have gone back.
  const expiresAt = new Date("2027-01-10T03:00:00Z");
  expect(expiresLabel(expiresAt, "America/Los_Angeles")).toBe("Sat 9 Jan 2027, 19:00");
  // Made at 02:00 in Kolkata, which is the evening before in UTC.
  expect(expiresLabel(new Date("2027-01-08T20:30:00Z"), "Asia/Kolkata")).toBe(
    "Sat 9 Jan 2027, 02:00",
  );
});
