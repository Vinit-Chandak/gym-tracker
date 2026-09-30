"use client";
import { coachingAction } from "./client-action";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button, LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HeroCard } from "@/components/ui/hero-card";
import { ChevronDown, ClipboardList } from "@/components/ui/icons";
import { Field, Input } from "@/components/ui/input";
import { List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { StatTile, StatTileRow } from "@/components/ui/stat-tile";
import {
  activateProgramDraftAction,
  rejectProgramDraftAction,
  reviewProgramDraftAction,
} from "@/server/actions/coaching-workflow";
import type { ProgramDraft } from "@/server/repositories/program-drafts";
import type { OpeningPlan } from "@/domain/coaching-workflow";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { exerciseTargets } from "@/domain/program-diff";
import { rangeLabel } from "@/lib/labels";
import { WEEKDAY_NAMES } from "@/lib/labels";

import { DayChip, dayKind } from "./day-chip";
import { phrase } from "./phrase";

/** Lifting sets in one cycle, counting every day's exercises. */
function setsPerCycle(blueprint: ProgramBlueprint): number {
  return blueprint.days.reduce(
    (total, day) => total + day.exercises.reduce((sum, e) => sum + e.sets, 0),
    0,
  );
}

/** "8 reps @ 60 kg, RIR 2": one set of the opening session, as the plan's lines read. */
function openingSet(set: OpeningPlan["exercises"][number]["sets"][number], unit: string): string {
  const target =
    set.reps !== null
      ? `${set.reps} reps`
      : set.durationSeconds !== null
        ? `${set.durationSeconds} s`
        : set.distanceMeters !== null
          ? `${set.distanceMeters} m`
          : "Target to calibrate";
  return [
    set.weight === null ? `${target}, load to calibrate` : `${target} @ ${set.weight} ${unit}`,
    set.rir === null ? null : `RIR ${set.rir}`,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * A first programme, in full, before anybody starts it.
 *
 * This is the one screen that still prints a whole programme, because there is nothing to
 * compare it against: an athlete with no programme cannot be shown a difference. Every later
 * version arrives as a change detail instead, and the programme itself lives in Cycle.
 *
 * The programme is the screen's filled card: its name in the display face and the shape of one
 * cycle. The coach's own words about it come next, as prose, then the days, each a row that
 * opens in place, then the one decision: start it, change it, or let it go.
 */
export function DraftPreview({
  draft,
  library,
  today,
  base,
  stale,
  machines,
  preferredUnit,
}: {
  draft: ProgramDraft;
  library: { slug: string; name: string }[];
  today: string;
  base: "/welcome/programme" | "/profile/programme";
  stale: boolean;
  machines: { id: string; unit: string }[];
  preferredUnit: "kg" | "lb";
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(draft),
    [needsCheck, setNeedsCheck] = useState(stale || draft.status === "editing"),
    [startDate, setStartDate] = useState(today),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const editable = ["editing", "ready"].includes(current.status);
  const blueprint = current.blueprint;
  const nameOf = (slug: string) => library.find((x) => x.slug === slug)?.name ?? slug;
  async function check() {
    setBusy(true);
    const result = await coachingAction(() =>
      reviewProgramDraftAction(current.id, current.revision),
    );
    if (result.ok) {
      setCurrent(result.value);
      setNeedsCheck(false);
      setError(null);
    } else setError(result.error);
    setBusy(false);
  }
  async function activate() {
    setBusy(true);
    const result = await coachingAction(() =>
      activateProgramDraftAction({
        id: current.id,
        revision: current.revision,
        startDate,
        transition: "new_block",
      }),
    );
    if (result.ok) router.push("/today");
    else setError(result.error);
    setBusy(false);
  }
  const fromCoach =
    current.rationale || blueprint.notes || current.uncertainties.length > 0 ? (
      <Card>
        {current.rationale && (
          <p className="[overflow-wrap:anywhere] whitespace-pre-wrap">{current.rationale}</p>
        )}
        {blueprint.notes && (
          <p className="text-sm [overflow-wrap:anywhere] whitespace-pre-wrap text-ink-muted">
            {blueprint.notes}
          </p>
        )}
        {current.uncertainties.length > 0 && (
          <div className="border-t border-line pt-3">
            <h2 className="font-semibold">What the coach is unsure about</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {current.uncertainties.map((line, i) => (
                <li key={i} className="[overflow-wrap:anywhere]">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    ) : null;

  return (
    <div className="space-y-[var(--section-gap)]">
      <HeroCard tone="lift">
        <p className="flex min-h-7 items-center gap-2 text-sm font-semibold text-ink-muted">
          <ClipboardList aria-hidden />
          {editable ? "Draft, not started" : "Draft"}
        </p>
        <h1 className="font-display text-display-m [overflow-wrap:anywhere]">{blueprint.name}</h1>
        <StatTileRow className="grid-cols-3 @min-[27rem]:grid-cols-3">
          <StatTile label="Weeks" value={blueprint.weeks} />
          <StatTile label="Days a cycle" value={blueprint.days.length} />
          <StatTile label="Sets a cycle" value={setsPerCycle(blueprint)} />
        </StatTileRow>
      </HeroCard>

      {fromCoach}

      <Section title="The cycle">
        <List>
          {blueprint.days.map((day) => {
            const runs = day.includesRun
              ? blueprint.runs.filter((r) => r.dayOfWeek === day.dayOfWeek)
              : [];
            const meta = [WEEKDAY_NAMES[day.dayOfWeek], day.focus, day.timeNote]
              .filter(Boolean)
              .join(", ");
            const sets = day.exercises.reduce((sum, e) => sum + e.sets, 0);
            const rest = !day.includesLifting && !day.includesRun;
            return (
              <li key={day.dayIndex}>
                <details className="group min-w-0">
                  <summary className="flex min-h-16 list-none items-start gap-3 px-4 py-3 transition-colors duration-[var(--ov-duration-feedback)] focus-visible:-outline-offset-2 active:bg-surface-raised">
                    <DayChip index={day.dayIndex} kind={dayKind(day)} />
                    <span className="min-w-0 flex-1 self-center">
                      <span className="block font-semibold [overflow-wrap:anywhere]">
                        {day.name}
                      </span>
                      {meta && (
                        <span className="mt-0.5 block text-sm [overflow-wrap:anywhere] text-ink-muted">
                          {meta}
                        </span>
                      )}
                      <span className="mt-0.5 block text-sm text-ink-subtle tabular-nums">
                        {rest
                          ? "Rest and mobility"
                          : [
                              day.exercises.length > 0
                                ? `${day.exercises.length} ${day.exercises.length === 1 ? "exercise" : "exercises"}, ${sets} ${sets === 1 ? "set" : "sets"}`
                                : null,
                              day.includesRun ? "a run" : null,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                      </span>
                    </span>
                    <ChevronDown
                      className="mt-3 shrink-0 text-ink-subtle transition-transform duration-[var(--ov-duration-feedback)] group-open:rotate-180"
                      aria-hidden
                    />
                  </summary>
                  <div className="space-y-4 pr-4 pb-4 pl-[4.5rem]">
                    {day.exercises.length > 0 && (
                      <ol className="space-y-3">
                        {day.exercises.map((e, i) => (
                          <li key={i} className="min-w-0">
                            <p className="font-semibold [overflow-wrap:anywhere]">
                              {nameOf(e.exerciseSlug)}
                            </p>
                            <p className="text-sm text-ink-muted tabular-nums">
                              {phrase(exerciseTargets(e))}
                            </p>
                            {e.supersetGroup && (
                              <p className="text-xs font-semibold text-ink-muted">
                                Superset: {e.supersetGroup}
                              </p>
                            )}
                            {e.targetLoadNote && <p className="text-sm">{e.targetLoadNote}</p>}
                            {e.notes && <p className="text-sm text-ink-muted">{e.notes}</p>}
                            {e.progressionNotes && (
                              <p className="text-sm text-ink-muted">{e.progressionNotes}</p>
                            )}
                            {e.keyCue && <p className="text-sm text-ink-muted">{e.keyCue}</p>}
                          </li>
                        ))}
                      </ol>
                    )}
                    {runs.length > 0 && (
                      <div className="space-y-2">
                        <h3 className="text-sm font-semibold text-run-ink">Run targets</h3>
                        <ul className="space-y-2 text-sm">
                          {runs.map((r) => (
                            <li key={r.weekIndex} className="tabular-nums">
                              Week {r.weekIndex}:{" "}
                              {[
                                r.distanceKm ? `${span(r.distanceKm)} km` : null,
                                `${span(r.duration)} min`,
                                `effort ${span(r.rpe)}`,
                              ]
                                .filter(Boolean)
                                .join(", ")}
                              {(r.paceNote || r.stopRule) && (
                                <p className="text-ink-muted">
                                  {[r.paceNote, r.stopRule].filter(Boolean).join(" ")}
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {day.notes && <p className="text-sm text-ink-muted">{day.notes}</p>}
                  </div>
                </details>
              </li>
            );
          })}
        </List>
      </Section>

      {current.openingPlan && (
        <Section
          title="Your opening session"
          info="Editing the programme clears this opening session. Your edited programme targets will be used when you start."
        >
          <Card>
            <p className="[overflow-wrap:anywhere]">{current.openingPlan.summary}</p>
            {current.openingPlan.warmup.length > 0 && (
              <p className="text-sm text-ink-muted">
                Warm-up: {current.openingPlan.warmup.join(" ")}
              </p>
            )}
            <ul className="text-sm ruled-list">
              {current.openingPlan.exercises.map((entry, i) => (
                <li key={i} className="py-2 first:pt-0 last:pb-0">
                  <p className="font-semibold [overflow-wrap:anywhere]">
                    {nameOf(entry.exerciseSlug)}
                  </p>
                  {entry.note && <p className="[overflow-wrap:anywhere]">{entry.note}</p>}
                  <p className="text-ink-muted tabular-nums">
                    {entry.action === "drop"
                      ? "Left out"
                      : entry.sets
                          .map((s) =>
                            openingSet(
                              s,
                              machines.find((machine) => machine.id === entry.equipmentInstanceId)
                                ?.unit ?? preferredUnit,
                            ),
                          )
                          .join("; ")}
                  </p>
                </li>
              ))}
            </ul>
            {current.openingPlan.run && (
              <p className="text-sm">
                <span className="font-semibold text-run-ink">Run: </span>
                {[
                  current.openingPlan.run.durationMinutes !== null
                    ? `${current.openingPlan.run.durationMinutes} minutes`
                    : "Duration to calibrate",
                  current.openingPlan.run.distanceKm !== null
                    ? `${current.openingPlan.run.distanceKm} km`
                    : null,
                  current.openingPlan.run.rpe !== null
                    ? `effort ${current.openingPlan.run.rpe}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                . {current.openingPlan.run.paceNote} {current.openingPlan.run.stopRule}
              </p>
            )}
          </Card>
        </Section>
      )}

      {editable && (
        <Card>
          <h2 className="text-headline font-semibold">Start this programme</h2>
          {needsCheck && (
            <>
              <p className="text-sm text-ink-muted">
                Check this draft against your current training data before starting it.
              </p>
              <Button disabled={busy} variant="secondary" onClick={check}>
                Check current data
              </Button>
            </>
          )}
          <Field label="Start date">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Button size="lg" disabled={busy || needsCheck || !startDate} onClick={activate}>
            {busy ? "Saving…" : "Start my programme"}
          </Button>
          <div className="action-row">
            <LinkButton href={`${base}/manual?draft=${current.id}` as Route} variant="secondary">
              Edit the draft
            </LinkButton>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                const result = await coachingAction(() => rejectProgramDraftAction(current.id));
                if (result.ok) router.push(base);
                else setError(result.error);
                setBusy(false);
              }}
            >
              Discard this draft
            </Button>
          </div>
        </Card>
      )}
      {!editable && <p className="px-1 text-sm text-ink-muted">This draft is {current.status}.</p>}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
/** "4–6", or "5" when a range's ends agree — as targets read everywhere else. */
function span(range: readonly [number, number] | null | undefined): string {
  if (!range) return "—";
  return rangeLabel(range[0], range[1]);
}
