"use client";
import { coachingAction } from "./client-action";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { copyProgramAction, archiveProgramAction } from "@/server/actions/coaching-workflow";

export function ProgrammeTools({ id, active = true }: { id: string; active?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false),
    [archive, setArchive] = useState(false),
    [error, setError] = useState<string | null>(null);
  async function copy(duplicate: boolean) {
    setBusy(true);
    setError(null);
    const result = await coachingAction(() => copyProgramAction(id, duplicate));
    if (result.ok) router.push(`/settings/programme/manual?draft=${result.value.id}` as Route);
    else setError(result.error);
    setBusy(false);
  }
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {active && (
          <Button variant="secondary" disabled={busy} onClick={() => copy(false)}>
            Edit future programme
          </Button>
        )}
        <Button variant="secondary" disabled={busy} onClick={() => copy(true)}>
          Duplicate programme
        </Button>
        {active && (
          <Button variant="ghost" disabled={busy} onClick={() => setArchive(true)}>
            Archive programme
          </Button>
        )}
      </div>
      {archive && (
        <div className="space-y-3 text-sm">
          <p>
            Archive this programme and stop scheduling its future sessions? Your completed workouts
            remain in history. You can duplicate the archived programme later.
          </p>
          <div className="flex gap-2">
            <Button
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
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
