import { beforeEach, expect, it, vi } from "vitest";
import { endurancePrescriptionSchema } from "@/domain/activity-prescription";
import { saveTemplateAction } from "./activity-templates";

const mocks = vi.hoisted(() => ({
  getTemplate: vi.fn(),
  reviseTemplate: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _user: string, work: (tx: unknown) => unknown) => work({}),
}));
vi.mock("@/server/auth", () => ({ requireUser: async () => ({ id: "athlete" }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/server/repositories/activity-templates", () => ({
  getTemplate: mocks.getTemplate,
  reviseTemplate: mocks.reviseTemplate,
  createTemplate: vi.fn(),
  archiveTemplate: vi.fn(),
  TemplateNotFoundError: class extends Error {},
}));

beforeEach(() => vi.resetAllMocks());
const original = endurancePrescriptionSchema.parse({
  prescriptionVersion: 1,
  sport: "running",
  instructions: "Keep the warm-up easy.",
  nodes: [
    {
      kind: "step",
      id: "warmup",
      action: "walk",
      phase: "warmup",
      target: { kind: "duration", ms: [300000, 600000] },
    },
  ],
});
const form = (sport = "running") => {
  const data = new FormData();
  data.set("sport", sport);
  data.set("name", "Renamed session");
  return data;
};

it("saves a correction without discarding coach-written steps or their instructions", async () => {
  mocks.getTemplate.mockResolvedValue({ sport: "running", prescription: original });
  await saveTemplateAction("template", {}, form());
  expect(mocks.reviseTemplate).toHaveBeenCalledWith(
    {},
    "athlete",
    "template",
    expect.objectContaining({
      name: "Renamed session",
      prescription: expect.objectContaining({
        nodes: original.nodes,
        instructions: original.instructions,
      }),
    }),
  );
  expect(mocks.redirect).toHaveBeenCalledWith("/training/templates");
});

it("refuses changing the sport of an existing template", async () => {
  mocks.getTemplate.mockResolvedValue({ sport: "running", prescription: original });
  const result = await saveTemplateAction("template", {}, form("swimming"));
  expect(result.formError).toMatch(/sport cannot change/);
  expect(mocks.reviseTemplate).not.toHaveBeenCalled();
  expect(mocks.redirect).not.toHaveBeenCalled();
});
