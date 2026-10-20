import { expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireProfiledUser: vi.fn() }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not-found");
  },
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/server/auth", () => auth);
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/components/coaching/builder-page", () => ({ ProgrammeBuilderPage: () => null }));

import { ProgrammeBuilderPage } from "@/components/coaching/builder-page";

import EditProgrammePage from "./page";

const DRAFT = "11111111-1111-4111-8111-111111111111";
const open = (sport: string, search: { draft?: string; mode?: string } = {}) =>
  EditProgrammePage({ params: Promise.resolve({ sport }), searchParams: Promise.resolve(search) });

/**
 * Every programme's builder is under its programme's page, strength's too (owner, 20 October
 * 2026): `?draft=` reopens a draft and `?mode=` starts a new one the way New programme asked,
 * as `/profile/programme/manual`, which redirects here, did.
 */
it("serves the strength programme's builder, with its draft or the way to build", async () => {
  for (const search of [{ draft: DRAFT }, { mode: "progressive" }, { mode: "repeating" }, {}]) {
    const page = await open("strength", search);
    expect(page.type).toBe(ProgrammeBuilderPage);
    expect(page.props).toEqual({ draftId: search.draft, mode: search.mode });
  }
  // The builder checks the account and the draft itself (builder-page.test.tsx).
  expect(auth.requireProfiledUser).not.toHaveBeenCalled();
});

it("has no builder for a sport with no programmes", async () => {
  await expect(open("rowing")).rejects.toThrow("not-found");
});
