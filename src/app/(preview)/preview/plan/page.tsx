import type { Metadata } from "next";

import { PlanView, type PlanCard } from "@/app/(app)/plan/plan-view";
import type { WeekSession } from "@/domain/plan-week";

import { PreviewShell } from "../../preview-shell";

export const metadata: Metadata = { title: "Preview · Plan" };

const TODAY = "2026-10-20";
const MONDAY = "2026-10-19";

/** A lifting programme and a running one, the running one with changes waiting to be read. */
const CARDS: PlanCard[] = [
  {
    programme: {
      id: "00000000-0000-4000-8000-000000000001",
      sport: "strength",
      name: "8-Week Strength + Aesthetics Hybrid",
    },
    waiting: [],
    pattern: "Every week",
    position: "Week 3 of 8",
    finished: false,
  },
  {
    programme: {
      id: "00000000-0000-4000-8000-000000000002",
      sport: "running",
      name: "Hybrid Half Marathon",
    },
    waiting: [{ id: "00000000-0000-4000-8000-000000000003", status: "ready", headline: null }],
    pattern: "Progressive",
    position: "Week 5 of 12",
    finished: false,
  },
];

const session = (
  key: string,
  date: string,
  sport: WeekSession["sport"],
  title: string | null,
  status: WeekSession["status"],
): WeekSession => ({
  key,
  date,
  sport,
  title,
  status,
  occurrenceId: sport === "strength" ? null : `00000000-0000-4000-8000-0000000001${key}`,
});

/** The week of a Tuesday: Monday lifted and missed its run, today lifts and runs. */
const WEEK: WeekSession[] = [
  session("10", MONDAY, "strength", "Upper A", "done"),
  session("11", MONDAY, "running", "Easy run", "missed"),
  session("20", TODAY, "strength", "Lower A", "today"),
  session("21", TODAY, "running", null, "today"),
  session("30", "2026-10-21", "strength", "Upper B", "planned"),
  session("40", "2026-10-22", "running", "Tempo run", "planned"),
  session("50", "2026-10-23", "strength", "Lower B", "planned"),
  session("60", "2026-10-24", "running", "Long run", "planned"),
];

/** Plan with made-up programmes: `?state=empty` is an account with none yet. */
export default async function PlanPreviewPage(props: PageProps<"/preview/plan">) {
  const { state } = await props.searchParams;
  const empty = state === "empty";
  return (
    <PreviewShell tab="/plan">
      <PlanView
        cards={empty ? [] : CARDS}
        sessions={empty ? [] : WEEK}
        monday={MONDAY}
        today={TODAY}
      />
    </PreviewShell>
  );
}
