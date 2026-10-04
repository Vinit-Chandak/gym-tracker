"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { SpeechTextarea } from "@/components/ui/dictation";
import { Glyph } from "@/components/ui/glyphs";
import { Field, Input } from "@/components/ui/input";
import { NavRow } from "@/components/ui/nav-row";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { PLAN_LIMITS } from "@/domain/plan-limits";
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
 * come, immediately). The coach's reasoning is offered only when something in the change is
 * the coach's own idea rather than an answer to an ask.
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

  const attributed = new Map<string, string>();
  for (const request of props.requests)
    for (const ref of request.changeRefs) attributed.set(ref, shortQuote(request.quote));
  // The reasoning belongs to whatever the coach changed on its own. A change that only answers
  // an ask needs none — the ask is the reason — but one that also cuts runs nobody asked about
  // owes the athlete its why for those.
  const unasked =
    props.summary.program.some((field) => !attributed.has(`program:${field.field}`)) ||
    props.summary.days.some(
      (day) =>
        ((day.fields.length > 0 || day.status !== "changed") &&
          !attributed.has(`day:${day.key}`)) ||
        day.operations.some((operation) => !attributed.has(operation.id)) ||
        (day.runs?.ids.some((id) => !attributed.has(id)) ?? false),
    );
  const why = coach && unasked && (props.rationale || props.uncertainties.length > 0);
  const tags: Record<string, ReactNode> = {};
  for (const [id, quote] of attributed) tags[id] = <span className="ask-tag">“{quote}”</span>;

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
    <div>
      {/* The page names itself for screen readers; the change's own line is what is read. */}
      <h2 className="change-headline">
        {props.headline || (coach ? "The coach's changes" : "Your changes")}
      </h2>
      {props.outcome && <p className="mt-1 type-meta text-ink-2">{props.outcome}</p>}
      {why && (
        <details open className="change-why">
          <summary className="change-why-summary">
            <Glyph name="info" className="glyph-18" />
            Why
          </summary>
          {props.rationale && (
            <p className="type-meta leading-[1.45] [overflow-wrap:anywhere] whitespace-pre-wrap">
              {props.rationale}
            </p>
          )}
          {props.uncertainties.length > 0 && (
            <ul className="mt-1.5 space-y-1 type-meta-small text-ink-2">
              {props.uncertainties.map((line, index) => (
                <li key={index} className="[overflow-wrap:anywhere]">
                  {line}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}

      <div className="mt-1">
        <ProgramDiffView summary={props.summary} names={props.names} reasons={tags} />
      </div>

      {/* Whatever is or is not printed above, an open change can always be answered: one that
          only rewrites the description, or only weeks already behind, still has to be
          approvable and dismissable, or it would sit on the Changes tab for good. */}
      {open && !props.canContinue && (
        <div className="mt-3.5 space-y-3">
          <p className="type-meta-small text-ink-2">
            This changes the programme&apos;s structure, so it starts a new block.
          </p>
          <Field label="Start date">
            <Input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
        </div>
      )}
      {open && (
        <PinnedActions stack>
          {coach && revising ? (
            <>
              <SpeechTextarea
                label="what you would like changed"
                rows={3}
                maxLength={PLAN_LIMITS.memo}
                placeholder="Keep the curls, but leave my Friday alone."
                value={revisionNotes}
                onChange={setRevisionNotes}
              />
              <Button
                size="lg"
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
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <Button
                  size="lg"
                  disabled={busy || !startDate}
                  className="min-w-0 flex-1"
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
                <Button
                  size="lg"
                  variant="tonal"
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
              </div>
              {coach ? (
                <button type="button" className="text-action" onClick={() => setRevising(true)}>
                  Ask for changes
                </button>
              ) : (
                <Link
                  href={`${props.base}/manual?draft=${props.draftId}` as Route}
                  className="text-action"
                >
                  Edit
                </Link>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="type-meta-small font-semibold">
              {error}
            </p>
          )}
        </PinnedActions>
      )}

      {/* The whole programme as it would be — after the difference, not before it. */}
      {props.base === "/profile/programme" && (
        <ul className="mt-3">
          <NavRow
            href={`${props.base}/drafts/${props.draftId}/programme` as Route}
            glyph="table"
            label={
              open
                ? "See the full programme with these changes"
                : props.status === "activated"
                  ? "See the full programme it made"
                  : "See the full programme it proposed"
            }
          />
        </ul>
      )}
    </div>
  );
}
