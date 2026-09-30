"use client";
import { coachingAction } from "./client-action";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { ChevronRight, ClipboardList, SlidersHorizontal, Trash } from "@/components/ui/icons";
import { List, PRESSABLE_ROW_CLASS, RowIcon } from "@/components/ui/link-row";
import { cn } from "@/lib/utils";
import { copyProgramAction, archiveProgramAction } from "@/server/actions/coaching-workflow";

/**
 * What you can do to a programme without opening it.
 *
 * For the programme being trained these are rows, like every other place to go on Profile:
 * the two edits open the builder, and archiving is the one that takes something away, so it
 * says so in the danger colour and is replaced — not joined — by the question it asks, which
 * keeps one decision on screen at a time. A retired programme can only be copied, so it gets
 * the one button.
 */
export function ProgrammeTools({ id, active = true }: { id: string; active?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [archive, setArchive] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function copy(duplicate: boolean) {
    setBusy(true);
    setError(null);
    const result = await coachingAction(() => copyProgramAction(id, duplicate));
    if (result.ok) router.push(`/profile/programme/manual?draft=${result.value.id}` as Route);
    else setError(result.error);
    setBusy(false);
  }
  const failure = error && (
    <p role="alert" className="px-1 text-sm text-danger">
      {error}
    </p>
  );

  if (!active) {
    return (
      <div className="space-y-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => copy(true)}>
          Duplicate programme
        </Button>
        {failure}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <List>
        <li>
          <button
            type="button"
            disabled={busy}
            onClick={() => copy(false)}
            className={cn(PRESSABLE_ROW_CLASS, "disabled:opacity-60")}
          >
            <RowIcon icon={SlidersHorizontal} />
            <span className="min-w-0 flex-1 font-semibold">Edit future programme</span>
            <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
          </button>
        </li>
        <li>
          <button
            type="button"
            disabled={busy}
            onClick={() => copy(true)}
            className={cn(PRESSABLE_ROW_CLASS, "disabled:opacity-60")}
          >
            <RowIcon icon={ClipboardList} />
            <span className="min-w-0 flex-1 font-semibold">Duplicate programme</span>
            <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
          </button>
        </li>
        <li>
          {archive ? (
            <div className="space-y-3 px-4 py-4">
              <p className="text-sm">
                Archive this programme and stop scheduling its future sessions? Your completed
                workouts remain in history. You can duplicate the archived programme later.
              </p>
              <div className="action-row">
                <Button
                  variant="danger"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    const result = await coachingAction(() => archiveProgramAction(id));
                    if (result.ok) router.refresh();
                    else setError(result.error);
                    setArchive(false);
                    setBusy(false);
                  }}
                >
                  Archive this programme
                </Button>
                <Button variant="ghost" onClick={() => setArchive(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => setArchive(true)}
              className={cn(PRESSABLE_ROW_CLASS, "disabled:opacity-60")}
            >
              <RowIcon icon={Trash} className="bg-danger/12 text-danger" />
              <span className="min-w-0 flex-1 font-semibold text-danger">Archive programme</span>
            </button>
          )}
        </li>
      </List>
      {failure}
    </div>
  );
}
