"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { Badge } from "@/components/ui/badge";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SpeechTextarea } from "@/components/ui/dictation";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Input } from "@/components/ui/input";
import { PLAN_LIMITS } from "@/domain/session-plan";
import type { ChangeSummary } from "@/domain/program-change-summary";
import {
  approveProgramChangeAction,
  declineProgramChangeAction,
  rejectProgramDraftAction,
  requestChangeRevisionsAction,
} from "@/server/actions/coaching-workflow";

import { coachingAction } from "./client-action";
import { ProgramDiffView } from "./program-diff-view";

export type ChangeRequestTag = {
  id: string;
  quote: string;
  /** Diff operation IDs this ask produced, checked against the diff when it was decided. */
  changeRefs: readonly string[];
};

export type ChangeDetailProps = {
  draftId: string;
  revision: number;
  /** `coach` is a proposal waiting on approval; `manual` is the athlete's own edit. */
  author: "coach" | "manual";
  status: "editing" | "ready" | "activated" | "rejected" | "superseded";
  /** How a closed change ended, in a short line; null while it is still open. */
  outcome: string | null;
  /** One line saying what this change does. Older drafts have none. */
  headline: string;
  rationale: string;
  uncertainties: readonly string[];
  summary: ChangeSummary;
  names: Readonly<Record<string, string>>;
  /** False when the change alters the split or schedule and so has to start a new block. */
  canContinue: boolean;
  /** The athlete's own asks this change answers, to tag the lines they produced. */
  requests: readonly ChangeRequestTag[];
  today: string;
  base: "/welcome/programme" | "/profile/programme";
};

/** The athlete's own words, short enough to sit on a line of the diff. */
function shortQuote(quote: string): string {
  const clean = quote.trim();
  if (clean.length <= 48) return clean;
  return `${clean.slice(0, 45).trimEnd()}…`;
}

/**
 * One change to the programme, as a decision the athlete can take in one screen.
 *
 * The title is what the change does. Under it, only what differs — once per cycle, from the
 * week the athlete is in — and the lines an ask of theirs produced carry their own words.
 * Nothing else is restated: not the ask (the previous screen showed it), not that approval is
 * needed (the buttons say so), not when it applies (approving updates every week still to
 * come, immediately). The coach's reasoning is offered only for a change nobody asked for.
 */
export function ChangeDetail(props: ChangeDetailProps) {
  const router = useRouter();
  const [startDate, setStartDate] = useState(props.today);
  const [revising, setRevising] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [noteId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = props.status === "editing" || props.status === "ready";
  const coach = props.author === "coach";
  const asked = props.requests.length > 0;
  const why = coach && !asked && (props.rationale || props.uncertainties.length > 0);

  const attributed = new Map<string, string>();
  for (const request of props.requests)
    for (const ref of request.changeRefs) attributed.set(ref, shortQuote(request.quote));
  const tags: Record<string, ReactNode> = {};
  for (const [id, quote] of attributed) tags[id] = <Badge tone="accent">“{quote}”</Badge>;

  const run = async (work: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => {
    setBusy(true);
    setError(null);
    const result = await work();
    if (result.ok) done?.();
    else setError(result.error ?? "Could not save this change. Please retry.");
    setBusy(false);
  };
  const back = () => router.push(`${props.base}?view=changes` as Route);

  return (
    <div className="space-y-4">
      <Card>
        <h1 className="min-w-0 text-lg font-medium [overflow-wrap:anywhere]">
          {props.headline || (coach ? "The coach's changes" : "Your changes")}
        </h1>
        {props.outcome && <p className="text-sm text-ink-muted">{props.outcome}</p>}
        {why && (
          <Disclosure summary="Why" variant="footer">
            <div className="space-y-3">
              {props.rationale && (
                <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-wrap">
                  {props.rationale}
                </p>
              )}
              {props.uncertainties.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
                  {props.uncertainties.map((line, index) => (
                    <li key={index} className="[overflow-wrap:anywhere]">
                      {line}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Disclosure>
        )}
      </Card>

      <ProgramDiffView summary={props.summary} names={props.names} reasons={tags} />

      {open && !props.summary.empty && (
        <Card>
          {!props.canContinue && (
            <>
              <p className="text-sm text-ink-muted">
                This changes your split, so it starts a new block.
              </p>
              <Field label="Start date">
                <Input
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </Field>
            </>
          )}
          <Button
            disabled={busy || !startDate}
            className="flex w-full"
            onClick={() =>
              run(
                () =>
                  coachingAction(() =>
                    approveProgramChangeAction({
                      id: props.draftId,
                      revision: props.revision,
                      startDate,
                    }),
                  ),
                back,
              )
            }
          >
            {busy ? "Saving…" : coach ? "Approve" : "Use these changes"}
          </Button>
          {coach &&
            (revising ? (
              <div className="space-y-2">
                <SpeechTextarea
                  label="what you would like changed"
                  rows={4}
                  maxLength={PLAN_LIMITS.memo}
                  placeholder="Keep the curls, but leave my Friday alone."
                  value={revisionNotes}
                  onChange={setRevisionNotes}
                />
                <Button
                  variant="secondary"
                  className="flex w-full"
                  disabled={busy || revisionNotes.trim().length === 0}
                  onClick={() =>
                    run(
                      () =>
                        coachingAction(() =>
                          requestChangeRevisionsAction(props.draftId, revisionNotes, noteId),
                        ),
                      back,
                    )
                  }
                >
                  {busy ? "Sending…" : "Send"}
                </Button>
              </div>
            ) : (
              <Button variant="secondary" className="flex w-full" onClick={() => setRevising(true)}>
                Ask for changes
              </Button>
            ))}
          {!coach && (
            <LinkButton
              href={`${props.base}/manual?draft=${props.draftId}` as Route}
              variant="secondary"
              className="flex w-full"
            >
              Edit
            </LinkButton>
          )}
          <Button
            variant="ghost"
            className="flex w-full"
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  coachingAction(() =>
                    coach
                      ? declineProgramChangeAction(props.draftId)
                      : rejectProgramDraftAction(props.draftId),
                  ),
                back,
              )
            }
          >
            {coach ? "Decline" : "Discard"}
          </Button>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </Card>
      )}

      {/* The whole programme as it would be — after the difference, not before it. */}
      {props.base === "/profile/programme" && (
        <LinkButton
          href={`${props.base}/drafts/${props.draftId}/programme` as Route}
          variant="ghost"
          className="flex w-full"
        >
          {open
            ? "See the full programme with these changes"
            : props.status === "activated"
              ? "See the full programme it made"
              : "See the full programme it proposed"}
        </LinkButton>
      )}
    </div>
  );
}
