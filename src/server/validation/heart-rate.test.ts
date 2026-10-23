import { expect, it } from "vitest";
import { heartRateInputSchema } from "./heart-rate";

const values = {
  zoneMethod: "max",
  maxHeartRate: "190",
  restingHeartRate: "55",
  maxHeartRateAuto: "on",
};
it.each(["0xbe", "1.9e2", "190.5", "99", "231", "NaN"])(
  "rejects an invalid maximum: %s",
  (maxHeartRate) => {
    expect(heartRateInputSchema.safeParse({ ...values, maxHeartRate }).success).toBe(false);
  },
);
it("allows an omitted maximum and resting rate, and parses the automatic setting", () => {
  expect(
    heartRateInputSchema.parse({
      ...values,
      maxHeartRate: "",
      restingHeartRate: "",
      maxHeartRateAuto: "",
    }),
  ).toMatchObject({ maxHeartRate: null, restingHeartRate: null, maxHeartRateAuto: false });
});
