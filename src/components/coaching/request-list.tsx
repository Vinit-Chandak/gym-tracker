"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SpeechTextarea } from "@/components/ui/dictation";
import { PLAN_LIMITS } from "@/domain/session-plan";
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
}: {
  requests: readonly RequestView[];
  base?: string;
}) {
  return (
    <ul className="space-y-3">
      {requests.map((request) => (
        <li key={request.id}>
          <RequestRow request={request} base={base} />
        </li>
      ))}
    </ul>
  );
}

function RequestRow({ request, base }: { request: RequestView; base: string }) {
  const router = useRouter();
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
    if (result.ok) router.refresh();
    else setError(result.error ?? "Could not save. Please retry.");
    setBusy(false);
  };

  return (
    <Card>
      <p className="font-medium [overflow-wrap:anywhere]">“{request.quote}”</p>
      {settled ? (
        <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">
          {[settled, request.outcome || request.detail].filter(Boolean).join(" — ")}
          {request.settledOn && <span className="tabular-nums"> · {request.settledOn}</span>}
        </p>
      ) : request.state === "needs_answer" ? (
        request.detail && <p className="text-sm [overflow-wrap:anywhere]">{request.detail}</p>
      ) : (
        <p className="text-sm text-ink-muted tabular-nums">{waitingLine(request)}</p>
      )}
      {settled && request.draftId && (
        <Link
          href={`${base}/drafts/${request.draftId}` as Route}
          className="flex min-h-11 items-center text-sm text-accent underline-offset-4 hover:underline"
        >
          See the change
        </Link>
      )}
      {request.state === "needs_answer" && (
        <div className="space-y-2">
          <SpeechTextarea
            label="your answer to the coach"
            rows={3}
            maxLength={PLAN_LIMITS.memo}
            placeholder="Your answer"
            value={answer}
            onChange={setAnswer}
          />
          <Button
            className="flex w-full"
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
        </div>
      )}
      {withdrawable && (
        <Button
          variant="ghost"
          className="flex w-full"
          disabled={busy}
          onClick={() => act(() => coachingAction(() => withdrawProgramRequestAction(request.id)))}
        >
          I no longer want this
        </Button>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
