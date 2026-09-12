"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Card } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import type { CoachJob } from "@/server/repositories/coaching-jobs";
const LABELS = {
  queued: "Your programme request is saved",
  claimed: "The coach is creating your programme",
  succeeded: "Your programme draft is ready",
  failed: "The coach could not finish",
  superseded: "Your inputs changed",
  needs_input: "The coach needs a little more information",
};
export function CoachJobStatus({
  job,
  draftId,
  base,
}: {
  job: CoachJob;
  draftId: string | null;
  base: "/welcome/programme" | "/settings/programme";
}) {
  const router = useRouter();
  const pending = job.status === "queued" || job.status === "claimed";
  useEffect(() => {
    if (!pending) return;
    let delay = 5000;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") router.refresh();
        delay = Math.min(60_000, delay * 2);
        schedule();
      }, delay);
    };
    schedule();
    return () => clearTimeout(timer);
  }, [pending, router]);
  return (
    <Card>
      <h1 className="text-xl font-medium" role="status">
        {LABELS[job.status]}
      </h1>
      {pending && (
        <p className="text-sm text-ink-muted">
          You can leave this screen. Your answers and files are saved, and the draft will appear
          under Programme when it is ready.
        </p>
      )}
      {job.error && <p className="text-sm text-ink-muted">{job.error}</p>}
      {job.result?.outcome === "needs_input" && (
        <ul className="list-disc space-y-2 pl-5 text-sm">
          {job.result.questions.map((question, i) => (
            <li key={i}>{question}</li>
          ))}
        </ul>
      )}
      {draftId && (
        <LinkButton href={`${base}/drafts/${draftId}` as Route}>Review the draft</LinkButton>
      )}
      {!pending && !draftId && (
        <LinkButton href={`${base}/create` as Route}>Review answers and try again</LinkButton>
      )}
      {pending && (
        <Button variant="secondary" onClick={() => router.refresh()}>
          Check status
        </Button>
      )}
      <LinkButton href={base} variant="ghost">
        Back to Programme
      </LinkButton>
    </Card>
  );
}
