"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Card } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import { SpeechTextarea } from "@/components/ui/dictation";
import { Disclosure } from "@/components/ui/disclosure";
import { FormError } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { answerCoachQuestionsAction } from "@/server/actions/coaching-workflow";
import type { CoachJob } from "@/server/repositories/coaching-jobs";
import { coachingAction } from "./client-action";
import { coachQuestionsPath, requestPath, type ProgrammeBase } from "./programme-paths";

/** Where a request stands, in setup's words. */
function statusLine(job: CoachJob, draftId: string | null): string {
  const creating = job.kind === "create_program";
  switch (job.status) {
    case "queued":
    case "claimed":
      return creating
        ? "The coach is writing your programme"
        : job.kind === "review_program"
          ? "The coach is reviewing your programme"
          : "The coach is preparing your session";
    case "needs_input":
      return "The coach has a question";
    case "failed":
      return "The coach could not finish";
    case "superseded":
      return creating ? "Your answers changed" : "Your programme changed first";
    case "succeeded":
      return draftId
        ? job.target.scope === "session"
          ? "Your session is ready"
          : "Your programme is ready"
        : job.kind === "prepare_session"
          ? "Session prepared"
          : job.result?.outcome === "no_change"
            ? "Your programme stays as it is"
            : "Review done";
  }
}

/**
 * A failure in the athlete's words: what is unchanged (DESIGN.md, The Need-to-Know Rule). What the
 * coach or the server wrote for whoever runs them stays under Details.
 */
function unchangedLine(job: CoachJob): string {
  return job.kind === "create_program"
    ? "Your answers are saved."
    : job.kind === "review_program"
      ? "Your programme is unchanged."
      : "Your programme’s targets apply.";
}

/** Where trying again starts, for what was asked. */
function retryHref(job: CoachJob, base: ProgrammeBase): Route {
  if (base === "/welcome/programme") return coachQuestionsPath(base);
  if (job.kind === "review_program") return `/plan/${job.target.sport ?? "strength"}` as Route;
  if (job.kind === "prepare_session") return "/today" as Route;
  // Single coached sessions are set aside for now (ADR 0058).
  if (job.target.scope === "session") return "/plan" as Route;
  return `/plan/new?sport=${job.target.sport ?? "strength"}&method=coach` as Route;
}

export function CoachJobStatus({
  job,
  draftId,
  base,
}: {
  job: CoachJob;
  draftId: string | null;
  base: ProgrammeBase;
}) {
  const router = useRouter();
  const pending = job.status === "queued" || job.status === "claimed";
  const rationale = job.result && "rationale" in job.result ? job.result.rationale : null;
  const questions =
    job.status === "needs_input" && job.result?.outcome === "needs_input"
      ? job.result.questions
      : null;
  // While the coach works the screen keeps itself current, and looks again the moment the app
  // comes back to it, so there is nothing to press: a Check status button that changed nothing
  // until the coach had finished read as a button that did nothing (owner, 24 October 2026).
  useEffect(() => {
    if (!pending) return;
    let delay = 5000;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") router.refresh();
        delay = Math.min(30_000, delay * 2);
        schedule();
      }, delay);
    };
    const returned = () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
      delay = 5000;
      clearTimeout(timer);
      schedule();
    };
    schedule();
    document.addEventListener("visibilitychange", returned);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", returned);
    };
  }, [pending, router]);
  const glyph: GlyphName =
    job.status === "failed"
      ? "warn"
      : job.status === "needs_input"
        ? "coach"
        : job.status === "succeeded"
          ? "check"
          : "wait";
  return (
    <Card>
      {/* The state, under the page's own title: its glyph (the dial turns while the coach works)
          and its words as the card's name, the line under them in Meta at the words' edge. */}
      <div className="request-state">
        <Glyph
          name={glyph}
          className={cn("glyph-24 shrink-0", pending && "motion-safe:animate-spin")}
        />
        <p className="type-card-title" role="status">
          {statusLine(job, draftId)}
        </p>
      </div>
      {job.status === "succeeded" && !draftId && rationale && (
        <p className="text-sm text-ink-muted">{rationale}</p>
      )}
      {pending && job.kind === "create_program" && (
        // A first programme waits on Plan from the moment it is asked for (ADR 0059).
        <p className="request-state-line">You can leave. It waits on Plan.</p>
      )}
      {/* An attempt that timed out tries again; one that failed for good says what stands. */}
      {pending && job.error && <p className="request-state-line">This may take until tonight.</p>}
      {job.status === "failed" && <p className="request-state-line">{unchangedLine(job)}</p>}
      {job.error && (
        <Disclosure summary="Details" variant="inline">
          <p className="text-sm [overflow-wrap:break-word] text-ink-muted">{job.error}</p>
        </Disclosure>
      )}
      {questions ? (
        <CoachQuestions jobId={job.id} questions={questions} base={base} />
      ) : (
        job.result?.outcome === "needs_input" && (
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {job.result.questions.map((question, i) => (
              <li key={i}>{question}</li>
            ))}
          </ul>
        )
      )}
      {draftId && (
        <LinkButton href={`${base}/drafts/${draftId}` as Route} className="flex w-full">
          Review the draft
        </LinkButton>
      )}
      {!pending && !draftId && job.status !== "succeeded" && (
        <LinkButton
          href={retryHref(job, base)}
          variant={questions ? "secondary" : "primary"}
          className="flex w-full"
        >
          {questions ? "Change my answers" : "Try again"}
        </LinkButton>
      )}
    </Card>
  );
}

/**
 * The coach's questions, each with a box under it.
 *
 * A question was previously a bullet and a trip back through the whole six-step form to find
 * the one answer it was about. It is asked here, so it is answered here: the answers are
 * filed with the athlete's own answers and the request goes again, which is the same request
 * the form makes and spends the same one of the day's three.
 */
export function CoachQuestions({
  jobId,
  questions,
  base,
}: {
  jobId: string;
  questions: readonly string[];
  base: ProgrammeBase;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One key for this screen: a double tap is one request, not two of the day's three.
  const [requestKey] = useState(() => crypto.randomUUID());
  const answered = answers.some((answer) => answer.trim() !== "");

  async function send() {
    setBusy(true);
    setError(null);
    const result = await coachingAction(() =>
      answerCoachQuestionsAction(
        jobId,
        questions.map((question, i) => ({ question, answer: answers[i] ?? "" })),
        requestKey,
      ),
    );
    if (result.ok) {
      router.replace(requestPath(base, result.value.jobId));
      return;
    }
    setError(result.error);
    setBusy(false);
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-4">
        {questions.map((question, i) => (
          <li key={question} className="space-y-1.5">
            <p className="text-sm [overflow-wrap:break-word]">{question}</p>
            <SpeechTextarea
              label={`your answer to question ${i + 1}`}
              rows={3}
              maxLength={2000}
              placeholder="Your answer"
              value={answers[i] ?? ""}
              onChange={(value) =>
                setAnswers((current) => current.map((held, at) => (at === i ? value : held)))
              }
            />
          </li>
        ))}
      </ol>
      <p className="text-xs text-ink-subtle">Answer what you can; the coach decides the rest.</p>
      <FormError message={error ?? undefined} />
      <Button className="flex w-full" disabled={busy || !answered} onClick={send}>
        {busy ? "Sending…" : "Send answers"}
      </Button>
    </div>
  );
}
