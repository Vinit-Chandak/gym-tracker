"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";

import { Button, LinkButton } from "@/components/ui/button";
import { SpeechTextarea } from "@/components/ui/dictation";
import { Disclosure } from "@/components/ui/disclosure";
import { Field, Input } from "@/components/ui/input";
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
import { CoachLine, AskLine } from "./sheet-bits";

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

/** The athlete's own words, whole: on a phone an ask is two lines, and a cut ask reads as a hint. */
function shortQuote(quote: string): string {
  return quote.trim();
}

/**
 * One change to the programme, as a decision the athlete can take in one screen.
 *
 * The title is what the change does. Under it, only what differs — once per cycle, from the
 * week the athlete is in — drawn as the pen layer over the programme, and the lines an ask of
 * theirs produced carry their own words. Nothing else is restated: not the ask (the previous
 * screen showed it), not that approval is needed (the buttons say so), not when it applies
 * (approving updates every week still to come, immediately). The coach's reasoning is offered
 * only when something in the change is the coach's own idea rather than an answer to an ask.
 *
 * The decision stands off the page on a panel: Approve under the highlighter, the other two
 * answers ruled and in the red pen.
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
  // One ask is printed whole, once, under the headline, and the lines it produced say so;
  // several asks each ride with their own lines, so a line never needs the list above.
  const asks = [...new Set(props.requests.map((request) => shortQuote(request.quote)))].filter(
    (quote) => quote.length > 0,
  );
  const tags: Record<string, ReactNode> = {};
  for (const [id, quote] of attributed)
    tags[id] = asks.length === 1 ? <span>Answers your ask</span> : <span>“{quote}”</span>;

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
    <div className="space-y-[var(--section-gap)]">
      <section className="box space-y-3 py-4">
        {/* The page header is the h1; the change's own line is the thing this screen is about. */}
        <h2 className="min-w-0 text-2xl [overflow-wrap:anywhere]">
          {props.headline || (coach ? "The coach's changes" : "Your changes")}
        </h2>
        {props.outcome && <p className="text-sm text-ink-muted">{props.outcome}</p>}
        {asks.length === 1 && <AskLine>“{asks[0]}”</AskLine>}
        {why && (
          <Disclosure summary="Why" variant="footer">
            <div className="space-y-3">
              {props.rationale && <CoachLine>{props.rationale}</CoachLine>}
              {props.uncertainties.length > 0 && (
                <ul className="space-y-1 text-sm text-ink-muted">
                  {props.uncertainties.map((line, index) => (
                    <li key={index} className="flex gap-2 [overflow-wrap:anywhere]">
                      <span aria-hidden className="shrink-0">
                        ·
                      </span>
                      <span className="min-w-0">{line}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Disclosure>
        )}
      </section>

      <ProgramDiffView summary={props.summary} names={props.names} reasons={tags} />

      {/* Whatever is or is not printed above, an open change can always be answered: one that
          only rewrites the description, or only weeks already behind, still has to be
          approvable and dismissable, or it would sit on the Changes tab for good. */}
      {open && (
        <section className="panel space-y-3 panel-padding" aria-label="Answer this change">
          {!props.canContinue && (
            <>
              <p className="text-sm text-ink-muted">
                This changes the programme&apos;s structure, so it starts a new block.
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
          {/* The one thing worth saying before the decision: what approving touches. */}
          <p className="text-sm text-ink-muted">
            Applies to every week still to come. Sessions already logged keep what they were
            prescribed.
          </p>
          <Button
            size="lg"
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
            variant="danger"
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
        </section>
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
