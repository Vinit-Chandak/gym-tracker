"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Card } from "@/components/ui/card";
import { Button, LinkButton } from "@/components/ui/button";
import { SpeechTextarea } from "@/components/ui/dictation";
import { answerCoachQuestionsAction } from "@/server/actions/coaching-workflow";
import type { CoachJob } from "@/server/repositories/coaching-jobs";
import { coachingAction } from "./client-action";
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
  base: "/welcome/programme" | "/profile/programme";
}) {
  const router = useRouter();
  const pending = job.status === "queued" || job.status === "claimed";
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
      {!pending && !draftId && (
        <LinkButton
          href={`${base}/create` as Route}
          variant={questions ? "secondary" : "primary"}
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
    <div className="space-y-4">
      <ol className="space-y-4">
        {questions.map((question, i) => (
          <li key={question} className="space-y-1.5">
            <p className="text-sm [overflow-wrap:anywhere]">{question}</p>
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
      <Button className="flex w-full" disabled={busy || !answered} onClick={send}>
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
