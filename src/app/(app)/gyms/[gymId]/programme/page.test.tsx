import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

import type { GymAvailability } from "@/server/repositories/availability";

import GymProgrammePage from "./page";

const mocks = vi.hoisted(() => ({ availability: vi.fn() }));

vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "me", email: "sofia@example.test" }),
}));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}),
}));
vi.mock("@/server/repositories/availability", () => ({ gymAvailability: mocks.availability }));
vi.mock("@/server/actions/availability", () => ({
  markEquipmentAbsentAction: vi.fn(),
  removeGymFallbackAction: vi.fn(),
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/shell/page-header", () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

afterEach(() => vi.clearAllMocks());

const GYM = "7e725988-55b1-4f78-b65d-c5d7a99fdd8d";

function row(name: string, resolution: object, extra: object = {}) {
  const exercise = { id: name, name };
  return {
    exercise,
    days: ["Pull"],
    programExerciseIds: [name],
    resolution: { exercise, ...resolution },
    equipment: "confirmed",
    resolvedExerciseName: name,
    missingTypes: [],
    assumedTypes: [],
    gymFallbacks: [],
    ...extra,
  };
}

it("holds each name it gives at its hyphens, so a short compound never parts at a line's end", async () => {
  // Sofia's 360-dp phone read "Neutral-grip lat pulldown (D-" over "handles)" beside Available.
  const available = { basis: "confirmed", primaryTypeId: "t", assumedTypeIds: [] };
  mocks.availability.mockResolvedValue({
    gym: { id: GYM, name: "PureGym Shoreditch" },
    program: { id: "p", name: "Upper / Lower Strength", complete: false },
    summary: { direct: 2, fallback: 1, unknown: 0, unavailable: 0 },
    rows: [
      row("Neutral-grip lat pulldown (D-handles)", {
        status: "direct",
        equipmentInstance: { id: "m1", name: "Lat pulldown" },
        ...available,
      }),
      row("Pull-up", {
        status: "direct",
        equipmentInstance: { id: "m2", name: "Pull-up bar" },
        ...available,
      }),
      row(
        "Seated cable row",
        { status: "fallback", equipmentInstance: null, ...available },
        {
          resolvedExerciseName: "Single-arm dumbbell row",
          gymFallbacks: [
            { id: "f", fallbackExerciseName: "T-bar row", fallbackInstanceName: "T-bar row" },
          ],
        },
      ),
    ],
  } as unknown as GymAvailability);
  const html = renderToStaticMarkup(
    await GymProgrammePage({
      params: Promise.resolve({ gymId: GYM }),
    } as PageProps<"/gyms/[gymId]/programme">),
  );
  // The name, the machine it is done on, the fallback done instead and one kept for the gym.
  expect(html).toContain("Neutral-\u2060grip lat pulldown (D-\u2060handles)");
  expect(html).toContain("On Pull-\u2060up bar");
  expect(html).toContain("Do Single-\u2060arm dumbbell row instead");
  expect(html).toContain("Fallback here: T-\u2060bar row");
});
