"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SpeechTextarea } from "@/components/ui/dictation";
import { PLAN_LIMITS } from "@/domain/session-plan";
import { REQUEST_STATE_LABELS, type RequestState } from "@/domain/program-request";
import {
  answerProgramRequestAction,
  withdrawProgramRequestAction,
} from "@/server/actions/coaching-workflow";

import { coachingAction } from "./client-action";

export type RequestView = {
  id: string;
  summary: string;
  quote: string;
  state: RequestState;
  detail: string;
  condition: string;
  reconsiderAfter: string | null;
  when: string;
  /** The change this request is waiting on, when it produced one. */
  draftId: string | null;
};

const TONE: Partial<Record<RequestState, "accent" | "success" | "warning" | "neutral">> = {
  waiting: "neutral",
  needs_answer: "warning",
  proposed: "accent",
  applied: "success",
};

/**
 * What the athlete asked for, and what became of it.
 *
 * A note used to come back marked "Reviewed by coach", which tells somebody who asked for
 * Bayesian curls precisely nothing. Every ask here carries its own outcome: waiting for the
 * next daily run, a question with a box to answer it in, a change to approve, a reason it is
 * not recommended, or a date it comes back. Their own words stay beside it so they can see
 * which ask is which.
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
  const [noteId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = ["waiting", "needs_answer", "proposed", "deferred"].includes(request.state);

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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 font-medium [overflow-wrap:anywhere]">{request.summary}</p>
        <Badge tone={TONE[request.state] ?? "neutral"}>{REQUEST_STATE_LABELS[request.state]}</Badge>
      </div>
      <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">“{request.quote}”</p>
      {request.detail && <p className="text-sm [overflow-wrap:anywhere]">{request.detail}</p>}
      {request.state === "deferred" && (request.condition || request.reconsiderAfter) && (
        <p className="text-sm text-ink-muted tabular-nums">
          {[request.condition, request.reconsiderAfter && `Back on ${request.reconsiderAfter}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}
      <p className="text-xs text-ink-muted tabular-nums">Asked {request.when}</p>
      {request.state === "proposed" && request.draftId && (
        <LinkButton
          href={`${base}/drafts/${request.draftId}` as Route}
          className="flex w-full"
          variant="secondary"
        >
          See the change
        </LinkButton>
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
          <p className="text-xs text-ink-subtle">
            Saved for the next daily coach run; it does not start one now.
          </p>
          <Button
            className="flex w-full"
            disabled={busy || answer.trim().length === 0}
            onClick={() =>
              act(() =>
                coachingAction(() => answerProgramRequestAction(request.id, answer, noteId)),
              )
            }
          >
            {busy ? "Sending…" : "Send answer"}
          </Button>
        </div>
      )}
      {open && (
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
