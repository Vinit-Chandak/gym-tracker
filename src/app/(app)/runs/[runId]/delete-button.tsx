"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteRunAction } from "@/server/actions/runs";

export function DeleteRunButton({ runId }: { runId: string }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        variant={armed ? "danger" : "ghost"}
        className="w-full"
        disabled={pending}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          startTransition(async () => {
            const result = await deleteRunAction(runId);
            if (result && !result.ok) setError(result.error);
          });
        }}
      >
        {pending ? "Deleting…" : armed ? "Tap again to delete" : "Delete run"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
