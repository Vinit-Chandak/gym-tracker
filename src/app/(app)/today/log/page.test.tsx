import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { endurancePrescriptionSchema, PRESCRIPTION_VERSION } from "@/domain/activity-prescription";
import type { ScheduledOccurrence } from "@/server/repositories/occurrences";

import LogPage from "./page";

const mocks = vi.hoisted(() => ({
  sports: vi.fn(),
  between: vi.fn(),
  schedule: vi.fn(),
  plan: vi.fn(),
  gyms: vi.fn(),
  open: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  requireUser: async () => ({ id: "me", email: "liam@example.test" }),
}));
vi.mock("@/server/queries/request-profile", () => ({
  getRequestProfile: async () => ({ timeZone: "UTC" }),
}));
vi.mock("@/server/queries/active-session", () => ({ getActiveSession: mocks.open }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: async (_db: unknown, _id: string, work: (tx: unknown) => Promise<unknown>) => work({}),
}));
vi.mock("@/server/repositories/sport-preferences", () => ({
  enabledSportsFor: mocks.sports,
  readSportUnits: async () => ({ distanceUnit: "km", poolUnit: "m" }),
}));
vi.mock("@/server/repositories/occurrences", () => ({ occurrencesBetween: mocks.between }));
vi.mock("@/server/repositories/schedule", () => ({
  getSchedule: mocks.schedule,
  getTodayPlan: mocks.plan,
}));
vi.mock("@/server/repositories/gyms", () => ({ listGyms: mocks.gyms }));
// Which start a lifting day would get is start-option's to test: here, day 1 was trained this
// cycle, day 3 rests, and the others are still to do.
vi.mock("../start-option", () => ({
  liftingStartOption: (_state: unknown, cycleIndex: number, dayIndex: number) =>
    dayIndex === 3 ? null : { cycleIndex, label: dayIndex === 1 ? "Do again" : "Start" },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
}));
vi.mock("@/components/shell/page-header", () => ({
  PageHeader: ({ title, meta, backHref }: { title: string; meta?: string; backHref?: string }) => (
    <header data-back={backHref ?? ""}>
      <h1>{title}</h1>
      {meta && <p className="meta">{meta}</p>}
    </header>
  ),
}));
vi.mock("@/components/ui/app-link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const occurrence = (
  n: number,
  scheduledOn: string,
  overrides: Partial<ScheduledOccurrence> = {},
): ScheduledOccurrence =>
  ({
    id: id(n),
    sport: "running",
    disposition: "pending",
    scheduledOn,
    scheduledLocalTime: null,
    orderIndex: 0,
    revisionId: id(100 + n),
    prescription: null,
    familyId: "half-marathon",
    originalWeekIndex: 5,
    originalScheduledOn: scheduledOn,
    resolution: { kind: "incomplete" },
    closed: false,
    loggable: true,
    ...overrides,
  }) as ScheduledOccurrence;

// A Tuesday: Saturday's long run was missed, today's run is owed, Thursday's can be done early.
const TODAY = "2026-10-20";
const todays = occurrence(1, TODAY);
const missed = occurrence(2, "2026-10-17");
const early = occurrence(3, "2026-10-22");

const day = (n: number, name: string) => ({
  day: { id: id(10 + n), dayIndex: n, name, includesLifting: n !== 3 },
  cycleIndex: 2,
  status: "pending",
});

const props = (search: Record<string, string> = {}) =>
  ({ searchParams: Promise.resolve(search) }) as unknown as PageProps<"/today/log">;

const render = async (search?: Record<string, string>) =>
  renderToStaticMarkup(await LogPage(props(search)));

/** The links of the page's rows, in order. */
const hrefs = (html: string) => [...html.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1]);

/** What the page says, without its markup: dates set their figures apart and hold together. */
const text = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\u00a0/g, " ");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(`${TODAY}T09:00:00Z`));
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.sports.mockResolvedValue(["strength", "running"]);
  mocks.between.mockResolvedValue([]);
  mocks.schedule.mockResolvedValue({ state: {} });
  mocks.plan.mockResolvedValue({
    suggestion: { slot: { cycleIndex: 2, dayIndex: 2 } },
    suggestedDay: { id: id(12) },
    cycleDays: [day(1, "Upper A"), day(2, "Lower A"), day(3, "Rest"), day(4, "Upper B")],
  });
  mocks.gyms.mockResolvedValue([
    { id: "g1", name: "Home", isActive: true, isDefault: false },
    { id: "g2", name: "Anytime Fitness", isActive: true, isDefault: true },
    { id: "g3", name: "Old gym", isActive: false, isDefault: false },
  ]);
  mocks.open.mockResolvedValue(null);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Log (ADR 0058)", () => {
  it("asks what was done, from the sports the athlete trains", async () => {
    const html = await render();
    expect(hrefs(html)).toEqual(["/today/log?sport=strength", "/today/log?sport=running"]);
    expect(html).toContain("Workout");
    expect(html).toContain("Run");
    expect(html).not.toContain("Ride");
  });

  it("refuses a sport it does not know", async () => {
    await expect(render({ sport: "rowing" })).rejects.toThrow("notFound");
  });

  describe("a run", () => {
    it("offers today's session, then the missed, then the early, then Unplanned", async () => {
      mocks.between.mockResolvedValue([
        early,
        missed,
        todays,
        // Neither can be counted: a ride, and a session of a programme that has ended.
        occurrence(4, TODAY, { sport: "cycling" }),
        occurrence(5, "2026-10-18", { closed: true, loggable: false }),
      ]);
      const html = await render({ sport: "running" });
      // Two weeks back to six days ahead, the end exclusive.
      expect(mocks.between).toHaveBeenCalledWith({}, "me", "2026-10-06", "2026-10-27");
      expect(html).toContain("Counts as");
      expect(hrefs(html)).toEqual([
        `/today/log?sport=running&amp;counts=${todays.id}`,
        `/today/log?sport=running&amp;counts=${missed.id}`,
        `/today/log?sport=running&amp;counts=${early.id}`,
        "/today/log?sport=running&amp;counts=unplanned",
      ]);
      expect(text(html)).toContain("Sat 17 Oct · missed");
      expect(text(html)).toContain("Thu 22 Oct · early");
      expect(text(html)).toContain("Unplanned run");
    });

    /**
     * Impeccable review, 20 October 2026: Counts as listed nine rows all named "Run". Each is
     * named as Today's card and the session's page name it (ADR 0059): its own name, else its
     * kind, else its sport, with its figure on the line under it beside where it stands. A name
     * that only repeats its figure gives way to its kind. Its mark is drawn still to do.
     */
    it("names each session as Today does, its figure on the line under it", async () => {
      const planned = (extra: Record<string, unknown>) =>
        endurancePrescriptionSchema.parse({
          prescriptionVersion: PRESCRIPTION_VERSION,
          sport: "running",
          sessionTargets: { durationMs: [30 * 60_000, 30 * 60_000] },
          ...extra,
        });
      mocks.between.mockResolvedValue([
        occurrence(1, TODAY, { prescription: planned({ title: "Hill reps" }) }),
        occurrence(2, "2026-10-17", {
          prescription: planned({ running: { sessionType: "long" } }),
        }),
        occurrence(3, "2026-10-22", {
          prescription: planned({ title: "30 min", running: { sessionType: "easy" } }),
        }),
        occurrence(4, "2026-10-23", { prescription: planned({}) }),
      ]);
      const html = await render({ sport: "running" });
      const rows = [...html.matchAll(/<li class="nav-row-item">(.*?)<\/li>/g)].map(([, row]) =>
        text(row!),
      );
      expect(rows).toEqual([
        "Hill repsToday · 30 min",
        "Long runSat 17 Oct · missed · 30 min",
        "Easy runThu 22 Oct · early · 30 min",
        "RunFri 23 Oct · early · 30 min",
        "Unplanned run",
      ]);
      expect(html).toContain("var(--ov-print-run-todo)");
    });

    it("is unplanned without asking when nothing is planned", async () => {
      const html = await render({ sport: "running" });
      expect(html).not.toContain("Counts as");
      expect(html).toContain('<p class="meta">Unplanned</p>');
      expect(html).toContain('action="/training/new"');
      expect(html).not.toContain('name="occurrence"');
      expect(html).toContain('data-back="/today/log"');
    });

    it("counts as a missed session while logged on the day it was done", async () => {
      mocks.between.mockResolvedValue([todays, missed]);
      const html = await render({ sport: "running", counts: missed.id });
      // The day it was planned for is said once, in the header; When is the day it was done.
      expect(text(html)).toContain("Counts as Run · Sat 17 Oct");
      expect(html).toContain(`name="occurrence" value="${missed.id}"`);
      expect(text(html).match(/Sat 17 Oct/g)).toHaveLength(1);
      expect(html).toMatch(/type="date" max="2026-10-20"[^>]* name="date" value="2026-10-20"/);
      expect(html).toContain('data-back="/today/log?sport=running"');
    });

    it("refuses a session it cannot count as", async () => {
      mocks.between.mockResolvedValue([todays]);
      await expect(render({ sport: "running", counts: id(99) })).rejects.toThrow("notFound");
      await expect(render({ sport: "running", counts: "next-tuesday" })).rejects.toThrow(
        "notFound",
      );
    });
  });

  describe("a workout", () => {
    it("offers the cycle's lifting days, the next first, with the start each would get", async () => {
      const html = await render({ sport: "strength" });
      expect(hrefs(html)).toEqual([
        `/today/log?sport=strength&amp;counts=day:${id(12)}:2:2`,
        `/today/log?sport=strength&amp;counts=day:${id(11)}:1:2`,
        `/today/log?sport=strength&amp;counts=day:${id(14)}:4:2`,
        "/today/log?sport=strength&amp;counts=unplanned",
      ]);
      expect(html).toContain("Next in your programme");
      expect(html).toContain("Done this cycle");
      expect(html).toContain("This cycle");
      expect(html).not.toContain("Rest");
      expect(html).toContain("Unplanned workout");
    });

    it("starts the chosen day at the default gym now, or logs it as done earlier", async () => {
      const html = await render({ sport: "strength", counts: `day:${id(11)}:1:2` });
      expect(html).toContain("Counts as Upper A");
      expect(html.match(/action="\/workouts\/start"/g)).toHaveLength(2);
      expect(html.match(new RegExp(`name="day" value="${id(11)}"`, "g"))).toHaveLength(2);
      expect(html.match(/name="exactCycle" value="2"/g)).toHaveLength(2);
      expect(html).toContain('<option value="g2" selected="">Anytime Fitness</option>');
      expect(html).not.toContain("Old gym");
      expect(html).toContain("Start workout");
      expect(html).toContain("Done earlier");
      expect(html).toMatch(/type="time" required=""[^>]* name="time"/);
      expect(html).toContain("Log this workout");
    });

    it("sends an open workout's athlete back to it, and a gymless one to add a gym", async () => {
      mocks.open.mockResolvedValue({ id: "w1" });
      const resume = await render({ sport: "strength", counts: "unplanned" });
      expect(resume).toContain('href="/workouts/w1"');
      expect(resume).not.toContain("<form");

      mocks.open.mockResolvedValue(null);
      mocks.gyms.mockResolvedValue([]);
      const gymless = await render({ sport: "strength", counts: "unplanned" });
      expect(gymless).toContain('href="/gyms/new"');
      expect(gymless).not.toContain("<form");
    });

    it("refuses a lifting day the cycle does not offer", async () => {
      await expect(render({ sport: "strength", counts: `day:${id(13)}:3:2` })).rejects.toThrow(
        "notFound",
      );
    });
  });
});
