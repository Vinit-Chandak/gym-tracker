import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));
vi.mock("@/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "00000000-0000-4000-8000-000000000001" }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveTemplateAction } from "./activity-templates";

/**
 * A template the prescription refuses is refused out loud. The form only shows errors under
 * the boxes it has and on its own error line, so every refusal must arrive at one of them.
 */

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

beforeEach(() => vi.resetAllMocks());

it("says why a template with no target was not saved, and keeps what was typed", async () => {
  const state = await saveTemplateAction(null, {}, form({ sport: "running", name: "Easy 5k" }));
  expect(state.formError).toBe("Give the session a target, or write out its steps");
  expect(state.values?.name).toBe("Easy 5k");
  expect(mocks.getDb).not.toHaveBeenCalled();
});

it("says effort written out of ten is out of five, under the effort box", async () => {
  const state = await saveTemplateAction(
    null,
    {},
    form({
      sport: "running",
      name: "Tempo",
      durationMinMinutes: "30",
      effortMin: "6",
      effortMax: "7",
    }),
  );
  expect(state.fieldErrors?.effortMin).toMatch(/0 to 5/);
  expect(mocks.getDb).not.toHaveBeenCalled();
});

it("puts a range written high to low under the box it starts in", async () => {
  const state = await saveTemplateAction(
    null,
    {},
    form({ sport: "running", name: "Long", durationMinMinutes: "40", durationMaxMinutes: "30" }),
  );
  expect(state.fieldErrors?.durationMinMinutes).toMatch(/low to high/);
  expect(state.formError).toBeUndefined();
  expect(mocks.getDb).not.toHaveBeenCalled();
});
