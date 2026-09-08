import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PhaseNotice } from "@/components/ui/phase-notice";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { listGyms } from "@/server/repositories/gyms";

import { GymSwitcher } from "./gym-switcher";

export const metadata: Metadata = { title: "Today" };

const PREVIEW_SETS = [1, 2, 3, 4];

export default async function TodayPage() {
  const user = await requireUser();
  const gyms = await withUser(getDb(), user.id, (tx) => listGyms(tx, user.id));
  const activeGyms = gyms
    .filter((gym) => gym.isActive)
    .map((gym) => ({ id: gym.id, name: gym.name, kind: gym.kind, isDefault: gym.isDefault }));

  return (
    <>
      <PageHeader title="Today" />
      <PageContent>
        <GymSwitcher gyms={activeGyms} />

        {/* Static preview of the exercise-card layout. Real data arrives in Phase 4. */}
        <Card aria-label="Exercise card design preview">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg leading-tight font-semibold">Barbell bench press</h2>
              <p className="mt-0.5 text-sm text-ink-muted">Barbell · comparable across gyms</p>
            </div>
            <span className="shrink-0 rounded-full border border-line-strong px-2 py-0.5 text-xs font-medium text-ink-muted">
              Preview
            </span>
          </div>

          <dl className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-control bg-surface-raised px-2 py-2">
              <dt className="text-xs text-ink-subtle">Sets × reps</dt>
              <dd className="text-lg font-semibold tabular-nums">4 × 3–5</dd>
            </div>
            <div className="rounded-control bg-surface-raised px-2 py-2">
              <dt className="text-xs text-ink-subtle">RIR</dt>
              <dd className="text-lg font-semibold tabular-nums">2</dd>
            </div>
            <div className="rounded-control bg-surface-raised px-2 py-2">
              <dt className="text-xs text-ink-subtle">Rest</dt>
              <dd className="text-lg font-semibold tabular-nums">3–4 min</dd>
            </div>
          </dl>

          <div className="flex items-center justify-between rounded-control border border-line px-3 py-2 text-sm">
            <span className="text-ink-muted">Previous comparable</span>
            <span className="font-medium tabular-nums">—</span>
          </div>
          <div className="flex items-center justify-between rounded-control border border-line px-3 py-2 text-sm">
            <span className="text-ink-muted">Suggested start</span>
            <span className="font-medium tabular-nums">—</span>
          </div>

          <ol className="divide-y divide-line" aria-label="Sets">
            <li className="grid grid-cols-[2rem_1fr_1fr_1fr] gap-2 px-1 pb-1 text-xs text-ink-subtle">
              <span>#</span>
              <span className="text-center">kg</span>
              <span className="text-center">Reps</span>
              <span className="text-center">RIR</span>
            </li>
            {PREVIEW_SETS.map((n) => (
              <li
                key={n}
                className="grid grid-cols-[2rem_1fr_1fr_1fr] items-center gap-2 px-1 py-2"
              >
                <span className="text-sm font-medium text-ink-muted tabular-nums">{n}</span>
                <span className="flex h-12 items-center justify-center rounded-control bg-surface-raised text-xl font-semibold tabular-nums">
                  —
                </span>
                <span className="flex h-12 items-center justify-center rounded-control bg-surface-raised text-xl font-semibold tabular-nums">
                  —
                </span>
                <span className="flex h-12 items-center justify-center rounded-control bg-surface-raised text-xl font-semibold tabular-nums">
                  —
                </span>
              </li>
            ))}
          </ol>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="lg" disabled>
              Add set
            </Button>
            <Button size="lg" disabled>
              Complete
            </Button>
          </div>
        </Card>

        <PhaseNotice phase={4}>
          Gym selection, planned-day pick, pre-session recovery check-in, set logging and the rest
          timer arrive in Phase 4.
        </PhaseNotice>
      </PageContent>
    </>
  );
}
