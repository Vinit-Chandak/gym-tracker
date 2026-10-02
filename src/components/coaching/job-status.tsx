"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { SpeechTextarea } from "@/components/ui/dictation";
import { Check, Hourglass, Question, Warning, type AppIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { answerCoachQuestionsAction } from "@/server/actions/coaching-workflow";
import type { CoachJob } from "@/server/repositories/coaching-jobs";
import { coachingAction } from "./client-action";
import { CoachLine } from "./sheet-bits";

const LABELS = {
  queued: "Your programme request is saved",
  claimed: "The coach is creating your programme",
  succeeded: "Your programme draft is ready",
  failed: "The coach could not finish",
  superseded: "Your inputs changed",
  needs_input: "The coach needs a little more information",
};

/** The glyph beside the status, and the mark it sits on: the one word the eye reads first. */
const MARKS: Record<keyof typeof LABELS, { icon: AppIcon; className: string }> = {
  queued: { icon: Hourglass, className: "bg-highlight text-on-highlight" },
  claimed: { icon: Hourglass, className: "bg-highlight text-on-highlight" },
  succeeded: { icon: Check, className: "border border-success text-success" },
  failed: { icon: Warning, className: "border border-danger text-danger" },
  superseded: { icon: Warning, className: "border border-warning text-warning" },
  needs_input: { icon: Question, className: "border border-pen text-pen" },
};

/**
 * One request to the coach, and where it has got to: the status as one clear line beside
 * its mark, then whatever the request needs next — a question answered in place, the draft
 * to review, or the way back. One highlighter: the thing to do now.
 */
export function CoachJobStatus({
  job,
  draftId,
  base,
}: {
  job: CoachJob;
  draftId: string | null;
  base: "/welcome/programme" | "/profile/programme";
}) {
  const router = useRouter();
  const pending = job.status === "queued" || job.status === "claimed";
  const successLabel = draftId
    ? "Your programme draft is ready"
    : job.kind === "prepare_session"
      ? "Your session preparation is complete"
      : job.result?.outcome === "no_change"
        ? "Your programme stays as it is"
        : "Your programme review is complete";
  const rationale = job.result && "rationale" in job.result ? job.result.rationale : null;
  const questions =
    job.status === "needs_input" && job.result?.outcome === "needs_input"
      ? job.result.questions
      : null;
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
  const mark = MARKS[job.status];
  const Icon = mark.icon;
  return (
    <section className="box space-y-4 py-4" aria-label="Programme request">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-control",
            mark.className,
          )}
          aria-hidden
        >
          <Icon />
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-xl [overflow-wrap:anywhere]" role="status">
            {job.status === "succeeded" ? successLabel : LABELS[job.status]}
          </h2>
          {job.status === "succeeded" && !draftId && rationale && (
            <CoachLine>{rationale}</CoachLine>
          )}
          {pending && (
            <p className="text-sm text-ink-muted">
              You can leave this screen. Your answers and files are saved, and the draft will
              appear under Programme when it is ready.
            </p>
          )}
          {job.error && (
            <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">{job.error}</p>
          )}
        </div>
      </div>
      {questions ? (
        <CoachQuestions jobId={job.id} questions={questions} base={base} />
      ) : (
        job.result?.outcome === "needs_input" && (
          <ul className="ruled-list">
            {job.result.questions.map((question, i) => (
              <li key={i} className="py-2">
                <CoachLine>{question}</CoachLine>
              </li>
            ))}
          </ul>
        )
      )}
      <div className="space-y-2">
        {draftId && (
          <LinkButton href={`${base}/drafts/${draftId}` as Route} size="lg" className="flex w-full">
            Review the draft
          </LinkButton>
        )}
        {!pending && !draftId && job.status !== "succeeded" && (
          <LinkButton
            href={`${base}/create` as Route}
            variant={questions ? "secondary" : "primary"}
            size={questions ? "md" : "lg"}
            className="flex w-full"
          >
            {questions ? "Change my answers instead" : "Review answers and try again"}
          </LinkButton>
        )}
        {pending && (
          <Button variant="secondary" className="flex w-full" onClick={() => router.refresh()}>
            Check status
          </Button>
        )}
        <LinkButton href={base} variant="ghost" className="flex w-full">
          Back to Programme
        </LinkButton>
      </div>
    </section>
  );
}

/**
 * The coach's questions, each with a cell under it.
 *
 * A question was previously a bullet and a trip back through the whole six-step form to find
 * the one answer it was about. It is asked here, in the coach's hand, so it is answered here:
 * the answers are filed with the athlete's own answers and the request goes again, which is
 * the same request the form makes and spends the same one of the day's three.
 */
function CoachQuestions({
  jobId,
  questions,
  base,
}: {
  jobId: string;
  questions: readonly string[];
  base: "/welcome/programme" | "/profile/programme";
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
      router.replace(`${base}/jobs/${result.value.jobId}` as Route);
      return;
    }
    setError(result.error);
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <ol className="ruled-list">
        {questions.map((question, i) => (
          <li key={question} className="space-y-2 py-3">
            <CoachLine>{question}</CoachLine>
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
      <p className="text-xs text-ink-subtle">
        Answer what you can. Anything you leave blank stays open, and the coach decides it for you.
      </p>
      <Button size="lg" className="flex w-full" disabled={busy || !answered} onClick={send}>
        {busy ? "Sending…" : "Send answers and try again"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
