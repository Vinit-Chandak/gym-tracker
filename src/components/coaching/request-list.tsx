"use client";

import { useState } from "react";
import type { Route } from "next";

import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { SpeechTextarea } from "@/components/ui/dictation";
import { Glyph } from "@/components/ui/glyphs";
import { PLAN_LIMITS } from "@/domain/plan-limits";
import type { RequestState } from "@/domain/program-request";
import { formatIsoDay } from "@/lib/format";
import {
  answerProgramRequestAction,
  withdrawProgramRequestAction,
} from "@/server/actions/coaching-workflow";

import { coachingAction } from "./client-action";

export type RequestView = {
  id: string;
  quote: string;
  state: RequestState;
  /** The coach's question, reason or outcome line; empty when the state says it all. */
  detail: string;
  condition: string;
  reconsiderAfter: string | null;
  /** The change this ask was answered with, when there is one to open. */
  draftId: string | null;
  /** For a settled ask: what the change did, and when it was settled. */
  outcome?: string | null;
  settledOn?: string | null;
};

/** What a settled ask came to, in a word. */
const SETTLED: Partial<Record<RequestState, string>> = {
  applied: "Done",
  declined: "You declined it",
  withdrawn: "You withdrew it",
  not_recommended: "Not recommended",
  already_satisfied: "Already in your programme",
};

/** Where an ask that needs nothing from the athlete is. */
function waitingLine(request: RequestView): string {
  if (request.state === "deferred")
    return [
      request.reconsiderAfter ? `Back on ${formatIsoDay(request.reconsiderAfter)}` : "Later",
      request.condition,
    ]
      .filter(Boolean)
      .join(" · ");
  return "At the next coach run";
}

/**
 * What the athlete asked for, in their own words, and what it needs from them now.
 *
 * Their words are the title, because they recognise them. A question comes with the box to
 * answer it in; an ask waiting on the coach says when it will be heard; a settled one says
 * what it came to. Nothing is said twice: no status badge under a heading that already says
 * it, no coach paraphrase of the ask above the ask, no date the coach's run stamped on it.
 */
export function RequestList({
  requests,
  base = "/profile/programme",
  label,
}: {
  requests: readonly RequestView[];
  base?: string;
  /** What each card is, where no heading above says it (board AI coach: "Needs your answer"). */
  label?: string;
}) {
  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li key={request.id}>
          <RequestRow request={request} base={base} label={label} />
        </li>
      ))}
    </ul>
  );
}

function RequestRow({
  request,
  base,
  label,
}: {
  request: RequestView;
  base: string;
  label?: string;
}) {
  const [answer, setAnswer] = useState("");
  const [noteId, setNoteId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = SETTLED[request.state];
  const withdrawable = ["waiting", "needs_answer", "deferred"].includes(request.state);

  const act = async (work: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const result = await work();
    if (!result.ok) setError(result.error ?? "Could not save. Please retry.");
    setBusy(false);
  };

  // Board AI coach: on surface, the ask in the athlete's words, the coach's question, the box
  // to answer in, then Send answer and the way out on one line.
  return (
    <div className="request-card">
      {label && (
        <p className="request-card-label">
          <Glyph name="coach" className="glyph-16" />
          {label}
        </p>
      )}
      <p className="request-card-quote">“{request.quote}”</p>
      {settled ? (
        <p className="type-meta-small [overflow-wrap:anywhere] text-ink-2">
          {[settled, request.outcome || request.detail].filter(Boolean).join(" — ")}
          {request.settledOn && <span className="tabular-nums"> · {request.settledOn}</span>}
        </p>
      ) : request.state === "needs_answer" ? (
        request.detail && <p className="type-body [overflow-wrap:anywhere]">{request.detail}</p>
      ) : (
        <p className="type-meta-small text-ink-2 tabular-nums">{waitingLine(request)}</p>
      )}
      {settled && request.draftId && (
        <Link
          href={`${base}/drafts/${request.draftId}` as Route}
          className="flex min-h-11 items-center type-meta font-bold underline underline-offset-4"
        >
          See the change
        </Link>
      )}
      {request.state === "needs_answer" && (
        <div className="request-card-answer">
          <SpeechTextarea
            label="your answer to the coach"
            rows={2}
            maxLength={PLAN_LIMITS.memo}
            placeholder="Your answer"
            value={answer}
            onChange={setAnswer}
          />
        </div>
      )}
      {(request.state === "needs_answer" || withdrawable) && (
        <div className="request-card-actions">
          {request.state === "needs_answer" && (
            <Button
              variant={answer.trim().length === 0 ? "waiting" : "primary"}
              className={answer.trim().length === 0 ? "bg-ground" : undefined}
              disabled={busy || answer.trim().length === 0}
              onClick={() =>
                act(async () => {
                  const result = await coachingAction(() =>
                    answerProgramRequestAction(request.id, answer, noteId),
                  );
                  if (result.ok) {
                    setAnswer("");
                    setNoteId(crypto.randomUUID());
                  }
                  return result;
                })
              }
            >
              {busy ? "Sending…" : "Send answer"}
            </Button>
          )}
          {withdrawable && (
            <Button
              variant="text"
              disabled={busy}
              onClick={() =>
                act(() => coachingAction(() => withdrawProgramRequestAction(request.id)))
              }
            >
              I no longer want this
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="type-meta-small font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
