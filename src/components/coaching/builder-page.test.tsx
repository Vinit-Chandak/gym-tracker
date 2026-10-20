import { beforeEach, expect, it, vi } from "vitest";

import { ProgrammeBuilderPage } from "./builder-page";

const mocks = vi.hoisted(() => ({
  initial: null as null | { sport: string; standalone: boolean; status: string },
}));
vi.mock("@/server/auth", () => ({
  requireProfiledUser: async () => ({ id: "athlete" }),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async () => ({ initial: mocks.initial, library: [], warmups: [], routines: [] }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
}));
vi.mock("./program-builder", () => ({ ProgramBuilder: () => null }));

const draftId = "00000000-0000-4000-8000-000000000001";
beforeEach(() => {
  mocks.initial = { sport: "strength", standalone: false, status: "editing" };
});

it("opens a current lifting programme draft in its builder", async () => {
  await expect(ProgrammeBuilderPage({ draftId })).resolves.toBeTruthy();
});

it.each([
  { sport: "running", standalone: false, status: "editing" },
  { sport: "cycling", standalone: false, status: "ready" },
  { sport: "swimming", standalone: false, status: "editing" },
  { sport: "strength", standalone: true, status: "ready" },
  { sport: "strength", standalone: false, status: "activated" },
])("rejects a draft the lifting programme editor cannot edit: %j", async (draft) => {
  mocks.initial = draft;
  await expect(ProgrammeBuilderPage({ draftId })).rejects.toThrow("not-found");
});
