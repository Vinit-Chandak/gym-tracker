"use client";

import { ErrorScreen } from "@/components/shell/error-screen";

import { PreviewShell } from "../../preview-shell";

/** The error screen with nothing to retry: a preview has no page behind it. */
export function ErrorPreview({ online, inWorkout }: { online: boolean; inWorkout: boolean }) {
  return (
    <PreviewShell tab="/today">
      <ErrorScreen online={online} inWorkout={inWorkout} onRetry={() => {}} />
    </PreviewShell>
  );
}
