"use client";

import { useState } from "react";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { SetGrid } from "@/app/(app)/workouts/[sessionId]/set-grid";
import type { RowState } from "@/app/(app)/workouts/[sessionId]/use-set-rows";
import type { PrescriptionType, SetType } from "@/domain/types";
import { DRAFT_VALUE_FIELDS, type DraftValueField } from "@/lib/workout-drafts";

import { PreviewShell } from "../../preview-shell";

function row(setIndex: number, patch: Partial<RowState> = {}): RowState {
  return {
    setIndex,
    setType: "working" as SetType,
    weight: "",
    reps: "",
    rir: "",
    duration: "",
    distance: "",
    touched: new Set<DraftValueField>(),
    logged: null,
    saving: false,
    error: null,
    dirty: false,
    ...patch,
  };
}

/**
 * The set grid in each of the three measures, side by side.
 *
 * The point of the screen: the third column asks what the movement is actually counted in, and
 * the RIR column explains what reps in reserve means for that movement rather than leaving one
 * generic sentence to cover a curl, a plank and a carry alike.
 */
const CASES: {
  title: string;
  measure: PrescriptionType;
  unitLabel: string;
  rirTarget: string;
  rirNote?: string;
  ghost: Partial<Record<DraftValueField, string>>;
}[] = [
  {
    title: "Barbell curl · counted in reps",
    measure: "reps",
    unitLabel: "kg",
    rirTarget: "1–2",
    ghost: { weight: "30", reps: "10", rir: "1" },
  },
  {
    title: "Plank · counted in seconds",
    measure: "duration",
    unitLabel: "+kg",
    rirTarget: "2",
    rirNote:
      "Reps in reserve, read as time: 2 RIR is a hold you could have kept for a few more seconds with the ribs still down. Break position and the set is over, whatever the clock says.",
    ghost: { weight: "0", duration: "45", rir: "2" },
  },
  {
    title: "Farmer's carry · counted in metres",
    measure: "distance",
    unitLabel: "kg",
    rirTarget: "1–2",
    rirNote:
      "Reps in reserve, read as ground: 2 RIR is a carry you could have taken a good way further at the same posture. Put it down before the grip or the ribs go, not after.",
    ghost: { weight: "32", distance: "30", rir: "1" },
  },
];

export default function LoggingPreviewPage() {
  const [rows, setRows] = useState<Record<string, RowState[]>>(() =>
    Object.fromEntries(CASES.map((c) => [c.measure, [row(1), row(2), row(3)]])),
  );

  const edit = (
    measure: string,
    target: RowState,
    patch: Partial<RowState>,
    touch: DraftValueField,
  ) =>
    setRows((current) => ({
      ...current,
      [measure]: (current[measure] ?? []).map((r) =>
        r.setIndex === target.setIndex
          ? { ...r, ...patch, touched: new Set(r.touched).add(touch), dirty: true }
          : r,
      ),
    }));

  const save = (measure: string, target: RowState) =>
    setRows((current) => ({
      ...current,
      [measure]: (current[measure] ?? []).map((r) =>
        r.setIndex === target.setIndex
          ? {
              ...r,
              touched: new Set(DRAFT_VALUE_FIELDS),
              dirty: false,
              logged: {
                id: `${measure}-${r.setIndex}`,
                setIndex: r.setIndex,
                setType: r.setType,
                weight: null,
                unit: "kg",
                reps: null,
                rir: null,
                durationSeconds: null,
                distanceMeters: null,
                completedAt: new Date().toISOString(),
              },
            }
          : r,
      ),
    }));

  return (
    <PreviewShell tab="/today">
      <PageHeader title="Logging" context="Preview" />
      <PageContent>
        {CASES.map((c) => (
          <Card key={c.measure}>
            <h2 className="text-base font-medium">{c.title}</h2>
            <SetGrid
              rows={rows[c.measure] ?? []}
              ghost={() => c.ghost}
              unitLabel={c.unitLabel}
              measure={c.measure}
              rirNote={c.rirNote ?? null}
              rirTarget={c.rirTarget}
              onEdit={(target, patch, touch) => edit(c.measure, target, patch, touch)}
              onSave={(target) => save(c.measure, target)}
              onOptions={() => undefined}
            />
          </Card>
        ))}
      </PageContent>
    </PreviewShell>
  );
}
