import { expect, it } from "vitest";

import { periodRange } from "./period";

it("starts on the viewer's calendar and runs to the latest date anywhere now", () => {
  // 21:00 on Sat 10 Oct in Los Angeles is already Sun 11 Oct in Kolkata, where a friend has
  // just finished a workout dated the 11th. The viewer's seven days still include it.
  const now = new Date("2026-10-11T04:00:00Z");
  const range = periodRange("7d", "America/Los_Angeles", now);
  expect(range.from).toBe("2026-10-04");
  expect(range.to).toBe("2026-10-11");
  // A friend in Kiritimati can be two dates ahead of one in Pago Pago.
  expect(periodRange("30d", "Pacific/Pago_Pago", new Date("2026-10-11T10:30:00Z"))).toMatchObject({
    from: "2026-09-11",
    to: "2026-10-12",
  });
  // A year still starts 364 days back, however far ahead the end runs.
  expect(periodRange("1y", "Pacific/Pago_Pago", new Date("2026-10-11T10:30:00Z")).from).toBe(
    "2025-10-11",
  );
});

it("ends on the viewer's own today where nobody is ahead of it", () => {
  const now = new Date("2026-10-11T04:00:00Z");
  expect(periodRange("7d", "Pacific/Kiritimati", now)).toMatchObject({
    from: "2026-10-05",
    to: "2026-10-11",
  });
});
