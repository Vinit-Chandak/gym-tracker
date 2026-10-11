import { afterEach, expect, it } from "vitest";

import {
  deviceTimeZone,
  listedTimeZones,
  preferredTimeZone,
  sameTimeZone,
  supportedTimeZones,
} from "./time-zones";

const zone = process.env.TZ;
afterEach(() => {
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
});

it("names a renamed place by its current name, and leaves every other zone as it is", () => {
  expect(preferredTimeZone("Asia/Calcutta")).toBe("Asia/Kolkata");
  expect(preferredTimeZone("Africa/Asmera")).toBe("Africa/Asmara");
  expect(preferredTimeZone("America/Godthab")).toBe("America/Nuuk");
  expect(preferredTimeZone("Asia/Kolkata")).toBe("Asia/Kolkata");
  expect(preferredTimeZone("Europe/London")).toBe("Europe/London");
  expect(preferredTimeZone("UTC")).toBe("UTC");
});

it("knows one zone under its two names", () => {
  expect(sameTimeZone("Asia/Calcutta", "Asia/Kolkata")).toBe(true);
  expect(sameTimeZone("Asia/Kolkata", "Asia/Kolkata")).toBe(true);
  expect(sameTimeZone("Asia/Kolkata", "Asia/Colombo")).toBe(false);
  expect(sameTimeZone("Asia/Kolkata", "")).toBe(false);
});

it("says where the device is by its place's current name", () => {
  // ICU reports India as Asia/Calcutta, as Chrome does.
  process.env.TZ = "Asia/Kolkata";
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Asia/Calcutta");
  expect(deviceTimeZone()).toBe("Asia/Kolkata");
});

it("lists each place once, by its current name, and the chosen zone as it was saved", () => {
  const platform = supportedTimeZones();
  // This platform still lists the old names.
  expect(platform).toContain("Asia/Calcutta");

  const listed = listedTimeZones(platform, "Europe/London");
  expect(listed).toContain("Asia/Kolkata");
  expect(listed).toContain("Africa/Asmara");
  expect(listed).toContain("America/Nuuk");
  for (const old of ["Asia/Calcutta", "Africa/Asmera", "America/Godthab", "Europe/Kiev"])
    expect(listed, old).not.toContain(old);
  expect(new Set(listed).size).toBe(listed.length);

  // A zone saved under its old name stands in the list as itself, once.
  const saved = listedTimeZones(platform, "Asia/Calcutta");
  expect(saved).toContain("Asia/Calcutta");
  expect(saved).not.toContain("Asia/Kolkata");
});
