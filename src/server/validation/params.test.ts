import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

import { requireUsername, requireUuid } from "./params";

it("accepts a UUID and treats anything else as a missing page", () => {
  const id = "3f4a9c1e-0d8b-4c3a-9b2e-6f1d2a3b4c5d";
  expect(requireUuid(id)).toBe(id);
  expect(() => requireUuid("not-an-id")).toThrow("NEXT_NOT_FOUND");
});

it("makes a username segment canonical and refuses what could never be one", () => {
  expect(requireUsername("Vinit")).toBe("vinit");
  expect(requireUsername("%40phani03")).toBe("phani03");
  expect(() => requireUsername("coach")).toThrow("NEXT_NOT_FOUND");
  expect(() => requireUsername("ab")).toThrow("NEXT_NOT_FOUND");
  expect(() => requireUsername("%E0%A4%A")).toThrow("NEXT_NOT_FOUND");
});
