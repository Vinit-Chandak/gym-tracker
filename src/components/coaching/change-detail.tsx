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
import type { ProgramDiff } from "@/domain/program-diff";
import type { RequestState } from "@/domain/program-request";
import {
  activateProgramDraftAction,
  declineProgramChangeAction,
  rejectProgramDraftAction,
  requestChangeRevisionsAction,
  reviewProgramDraftAction,
} from "@/server/actions/coaching-workflow";

import { coachingAction } from "./client-action";
import { ProgramDiffView } from "./program-diff-view";

export type ChangeRequestOutcome = {
  id: string;
  summary: string;
  quote: string;
  state: RequestState;
  detail: string;
  /** Diff operation IDs this ask produced, checked against the diff when it was decided. */
  changeRefs: readonly string[];
};

export type ChangeDetailProps = {
  draftId: string;
  revision: number;
  /** `coach` is a proposal waiting on approval; `manual` is the athlete's own edit. */
  author: "coach" | "manual";
  status: "editing" | "ready" | "activated" | "rejected" | "superseded";
  name: string;
  when: string;
  /** One line saying what this change does. Older drafts have none; then the diff speaks. */
  headline: string;
  rationale: string;
  uncertainties: readonly string[];
  /** Why the server would not apply this itself. Summarised in a line, never printed raw. */
  gateReasons: readonly string[];
  diff: ProgramDiff;
  names: Readonly<Record<string, string>>;
  /** Whether the change can continue the running block, or has to start a new one. */
  canContinue: boolean;
  /** The athlete's own asks this change answers. Asks it does not answer are not shown. */
  requests: readonly ChangeRequestOutcome[];
  today: string;
  base: "/welcome/programme" | "/profile/programme";
  /** True when the draft was written against training data that has since changed. */
  stale: boolean;
};

const STATUS_NOTE: Record<ChangeDetailProps["status"], string | null> = {
  editing: null,
  ready: null,
  activated: "You started this change. It is your programme now.",
  rejected: "You declined this change. Your programme was not altered.",
  superseded: "A later review replaced this change. Nothing here is waiting on you.",
};

/** Operations that change what exists, rather than what an existing slot prescribes. */
const SLOT_COUNT_CHANGED = new Set(["added", "removed", "run_added", "run_removed"]);

/**
 * Why this needs a decision at all, in one line rather than in the guardrail's own words.
 *
 * The server records a finding per slot — "a new slot needs review", twice for two slots —
 * which is an audit trail, not a sentence anybody wants to read above their programme.
 */
function gateLine(diff: ProgramDiff, gateReasons: readonly string[]): string | null {
  if (!gateReasons.length) return null;
  const slots = diff.days
    .flatMap((day) => day.operations)
    .filter((operation) => SLOT_COUNT_CHANGED.has(operation.kind)).length;
  if (slots > 0)
    return `Adds or removes ${slots === 1 ? "an exercise" : "exercises"}, so it needs your approval rather than applying on its own.`;
  return "This is a bigger change than the coach may apply on its own, so it needs your approval.";
}

/** The athlete's own words, short enough to sit on a line of the diff. */
function shortQuote(quote: string): string {
  const clean = quote.trim();
  if (clean.length <= 48) return clean;
  return `${clean.slice(0, 45).trimEnd()}…`;
}

/**
 * One change to the programme, as a decision the athlete can actually take.
 *
 * What is on this screen is the difference and the one line that says what it does. The
 * programme itself is in Cycle, the reasoning is folded away behind it, and each ask this
 * change answers is a tag on the lines it produced rather than a paragraph repeating them —
 * the screen used to state the same change in prose, again as an outcome, and again as a
 * diff. Approving applies the whole reviewed set; asking for revisions hands it back with
 * the athlete's own words attached, to be reworked at the next daily coach run.
 */
export function ChangeDetail(props: ChangeDetailProps) {
  const router = useRouter();
  const [needsCheck, setNeedsCheck] = useState(props.stale || props.status === "editing");
  const [transition, setTransition] = useState<"continue" | "new_block">(
    props.canContinue ? "continue" : "new_block",
  );
  const [startDate, setStartDate] = useState(props.today);
  const [revising, setRevising] = useState(false);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [noteId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = props.status === "editing" || props.status === "ready";
  const coach = props.author === "coach";
  const gate = gateLine(props.diff, props.gateReasons);
  const why = props.rationale || props.uncertainties.length > 0;

  /**
   * Which ask produced each changed line, from the operation IDs the decision named.
   *
   * Only when at least one line is attributable: on a review nobody asked for, marking every
   * row "Coach" distinguishes it from nothing at all.
   */
  const attributed = new Map<string, string>();
  for (const request of props.requests)
    for (const ref of request.changeRefs) attributed.set(ref, shortQuote(request.quote));
  const operations = props.diff.days.flatMap((day) => day.operations);
  const tags: Record<string, ReactNode> = {};
  // A re-reviewed draft can carry refs naming operations this diff no longer has. Tagging
  // then labels every line "Coach" and says the opposite of what happened, so it is the
  // lines that match, not the refs that exist, that decide whether to tag at all.
  if (operations.some((operation) => attributed.has(operation.id)))
    for (const operation of operations)
      tags[operation.id] = attributed.has(operation.id) ? (
        <Badge tone="accent">“{attributed.get(operation.id)}”</Badge>
      ) : (
        <Badge>Coach</Badge>
      );

  const run = async (work: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => {
    setBusy(true);
    setError(null);
    const result = await work();
    if (result.ok) done?.();
    else setError(result.error ?? "Could not save this change. Please retry.");
    setBusy(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h1 className="min-w-0 text-xl font-medium [overflow-wrap:anywhere]">
            {props.diff.empty ? "No programme changes" : "Proposed changes"}
          </h1>
          {open && coach && !props.diff.empty && <Badge tone="warning">Awaiting approval</Badge>}
          {props.status === "activated" && <Badge tone="success">Applied</Badge>}
        </div>
        <p className="text-sm text-ink-muted tabular-nums">
          {props.when} · {props.name}
        </p>
        {/* What it does, in one line. The reasoning that produced it is folded away below. */}
        {props.headline && <p className="[overflow-wrap:anywhere]">{props.headline}</p>}
        {props.requests.length > 0 && (
          <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">
            Answers {props.requests.map((request) => `“${request.quote}”`).join(" · ")}
          </p>
        )}
        {props.diff.empty && (
          <p className="text-sm text-ink-muted">
            Your programme stays as it is. Nothing you have logged changes.
          </p>
        )}
        {STATUS_NOTE[props.status] && (
          <p className="text-sm text-ink-muted">{STATUS_NOTE[props.status]}</p>
        )}
        <LinkButton
          href={`${props.base}?view=cycle` as Route}
          variant="secondary"
          className="flex w-full"
        >
          See the full programme
        </LinkButton>
        {why && (
          <Disclosure summary="Why this" variant="footer">
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

      {/* Nothing differs, so there is nothing to draw: the heading above has already said so,
          and a second box repeating it is the duplication this screen exists to remove. */}
      {!props.diff.empty && (
        <ProgramDiffView
          diff={props.diff}
          names={props.names}
          reasons={tags}
          effectiveScope={
            transition === "continue"
              ? "Takes effect from your next unstarted session. Workouts you have already logged keep what they were prescribed."
              : "Starts a new block from the date you choose. Workouts you have already logged keep what they were prescribed."
          }
        />
      )}

      {open && !props.diff.empty && (
        <Card>
          <h2 className="font-medium">{coach ? "Your decision" : "Use these changes"}</h2>
          {gate && <p className="text-sm text-ink-muted">{gate}</p>}
          {needsCheck && (
            <>
              <p className="text-sm text-ink-muted">
                Check this against your current training data before applying it.
              </p>
              <Button
                disabled={busy}
                variant="secondary"
                onClick={() =>
                  run(
                    () =>
                      coachingAction(() => reviewProgramDraftAction(props.draftId, props.revision)),
                    () => {
                      setNeedsCheck(false);
                      // The difference is computed on the server from the refreshed draft, so
                      // the screen re-reads it rather than keeping one drawn from older props.
                      router.refresh();
                    },
                  )
                }
              >
                Check current data
              </Button>
            </>
          )}
          {props.canContinue ? (
            <fieldset>
              <legend className="text-sm text-ink-muted">When should this take effect?</legend>
              {(
                [
                  ["continue", "Continue the current block"],
                  ["new_block", "Start a new block"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="transition"
                    checked={transition === value}
                    onChange={() => setTransition(value)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="text-sm text-ink-muted">
              This changes your split or schedule, so it starts a new block. Everything you have
              logged stays in your history.
            </p>
          )}
          {transition === "new_block" && (
            <Field label="Start date">
              <Input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </Field>
          )}
          <Button
            disabled={busy || needsCheck || !startDate}
            className="flex w-full"
            onClick={() =>
              run(
                () =>
                  coachingAction(() =>
                    activateProgramDraftAction({
                      id: props.draftId,
                      revision: props.revision,
                      startDate,
                      transition,
                    }),
                  ),
                () => router.push(`${props.base}?view=changes` as Route),
              )
            }
          >
            {busy ? "Saving…" : coach ? "Approve changes" : "Use these changes"}
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
                <p className="text-xs text-ink-subtle">
                  The coach reworks this at its next daily run and shows you the new changes before
                  anything is applied.
                </p>
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
                      () => router.push(`${props.base}?view=changes` as Route),
                    )
                  }
                >
                  {busy ? "Sending…" : "Send my revisions"}
                </Button>
              </div>
            ) : (
              <Button variant="secondary" className="flex w-full" onClick={() => setRevising(true)}>
                Ask for revisions
              </Button>
            ))}
          {!coach && (
            <LinkButton
              href={`${props.base}/manual?draft=${props.draftId}` as Route}
              variant="secondary"
              className="flex w-full"
            >
              Edit the draft
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
                () => router.push(`${props.base}?view=changes` as Route),
              )
            }
          >
            {coach ? "Decline these changes" : "Discard this draft"}
          </Button>
        </Card>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
