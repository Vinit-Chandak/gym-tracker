"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { FormError } from "@/components/ui/form";
import { InfoTip } from "@/components/ui/info-tip";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { SavedNotice } from "@/components/ui/saved-notice";
import type { EnduranceSport } from "@/domain/activity";
import {
  endurancePrescriptionSchema,
  describePrescription,
  type EndurancePrescription,
  type RunningInstructions,
} from "@/domain/activity-prescription";
import { addDays, daysBetween } from "@/domain/program-calendar";
import { programBlueprintSchema, type ProgramBlueprint } from "@/domain/program-blueprint";
import type { ProgrammeEnduranceSession } from "@/domain/programme-sport";
import { RUN_TYPES, RUN_TYPE_LABELS, isRunType } from "@/domain/run-types";
import {
  enduranceSessionGroups,
  repeatEnduranceSession,
  updateEnduranceSession,
} from "@/domain/endurance-series";
import type { SportUnits } from "@/lib/distance-units";
import { formatIsoDate } from "@/lib/format";
import {
  saveProgramDraftAction,
  reviewProgramDraftAction,
} from "@/server/actions/coaching-workflow";
import { coachingAction } from "./client-action";
import { PaceZoneFields, StepsEditor } from "./steps-editor";
import { programmeFieldError } from "./programme-field-errors";
import { useEditorReady } from "./use-editor-ready";

type Scope = "this" | "future_repeats";

/** An invalid date stays correctable; it must not move a session into the frozen past. */
function SessionDateField({
  value,
  min,
  max,
  onChange,
}: {
  value: string;
  min: string;
  max: string;
  onChange: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const entered = draft ?? value;
  const error =
    draft !== null && (!entered || entered < min || entered > max)
      ? `Choose a session date from ${min} to ${max}.`
      : undefined;
  return (
    <Field label="Session date" info="Only this session moves." error={error}>
      <Input
        type="date"
        min={min}
        max={max}
        value={entered}
        data-typed-invalid={error ? "true" : undefined}
        onChange={(event) => {
          const next = event.target.value;
          if (!next || next < min || next > max) setDraft(next);
          else {
            setDraft(null);
            onChange(next);
          }
        }}
      />
    </Field>
  );
}

/** A distance's unit in words, as the steps editor writes it, for the legend over its range. */
const UNIT_WORDS = { km: "Kilometres", mi: "Miles", m: "Metres", yd: "Yards" } as const;

const NO_RUNNING_NOTES: RunningInstructions = {
  paceNote: null,
  progressionNote: null,
  symptomStopRule: null,
  note: null,
};

/** A new session: half an hour, and for a run, an easy one until it is told otherwise. */
function newPrescription(sport: EnduranceSport): EndurancePrescription {
  return endurancePrescriptionSchema.parse({
    prescriptionVersion: 1,
    sport,
    sessionTargets: { durationMs: [1800000, 1800000] },
    running: sport === "running" ? { ...NO_RUNNING_NOTES, sessionType: "easy" } : null,
  });
}

/** The run's kind set or cleared (ADR 0059), its other running instructions kept. */
function withSessionType(
  running: RunningInstructions | null,
  value: string,
): RunningInstructions | null {
  const { sessionType: _previous, ...rest } = running ?? NO_RUNNING_NOTES;
  if (isRunType(value)) return { ...rest, sessionType: value };
  return Object.values(rest).some((entry) => entry !== null) ? rest : null;
}

export function EnduranceProgrammeBuilder({
  sport,
  initial,
  anchorDate,
  templates,
  units,
  today,
  continuing = false,
  startView,
}: {
  sport: EnduranceSport;
  initial: { id: string; revision: number; blueprint: ProgramBlueprint } | null;
  anchorDate: string;
  today: string;
  continuing?: boolean;
  units: SportUnits;
  templates: { id: string; name: string; prescription: EndurancePrescription }[];
  /** How a new programme opens, as New programme chose (ADR 0058); a draft opens as it reads. */
  startView?: "pattern" | "week";
}) {
  const router = useRouter();
  const ready = useEditorReady();
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [plan, setPlan] = useState<ProgramBlueprint>(
    () =>
      initial?.blueprint ?? {
        blueprintVersion: 1,
        sport,
        slug: `manual-${crypto.randomUUID()}`,
        name: "",
        weeks: 8,
        notes: "",
        days: [],
        runs: [],
        enduranceSessions: [
          {
            lineageId: crypto.randomUUID(),
            name: "Session 1",
            weekIndex: 1,
            dayOffset: 0,
            scheduledLocalTime: null,
            prescription: newPrescription(sport),
          },
        ],
      },
  );
  const [draft, setDraft] = useState(
    initial ? { id: initial.id, revision: initial.revision } : null,
  );
  const [savedPlan, setSavedPlan] = useState(() =>
    initial ? JSON.stringify(initial.blueprint) : "",
  );
  const dirty = JSON.stringify(plan) !== savedPlan;
  const sessions = plan.enduranceSessions ?? [];
  const firstEditable = sessions.findIndex(
    (entry) => !continuing || addDays(anchorDate, entry.dayOffset) >= today,
  );
  const [selected, setSelected] = useState(() => Math.max(0, firstEditable));
  const [view, setView] = useState<"pattern" | "week">(() =>
    !initial && startView
      ? startView
      : enduranceSessionGroups(sessions).some((group) => group.indexes.length > 1)
        ? "pattern"
        : "week",
  );
  const [week, setWeek] = useState(() => sessions[Math.max(0, firstEditable)]?.weekIndex ?? 1);
  const [scope, setScope] = useState<Scope>("future_repeats");
  const [repeatDays, setRepeatDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const nameError = showProblems && !plan.name.trim() ? "Name your programme." : undefined;
  const validation = showProblems ? programBlueprintSchema.safeParse(plan) : null;
  const issues = validation && !validation.success ? validation.error.issues : [];
  const validWeeks = Number.isInteger(plan.weeks) && plan.weeks >= 1 && plan.weeks <= 52;
  // Keep the entered value for correction; only a bounded value may reach calendar rendering.
  const calendarWeeks = Number.isFinite(plan.weeks)
    ? Math.max(1, Math.min(52, Math.floor(plan.weeks)))
    : 1;
  const weeksError =
    showProblems && !validWeeks ? "Enter a whole number of weeks from 1 to 52." : undefined;
  // What stops a change, said under the field it is about, which its fold opens to show.
  const [fieldError, setFieldError] = useState<{
    field: "weeks" | "repeat";
    message: string;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const year = today.slice(0, 4);
  const groups = enduranceSessionGroups(sessions);
  const group = groups.find((entry) => entry.indexes.includes(selected));
  const session = sessions[selected];
  const past = !!session && continuing && addDays(anchorDate, session.dayOffset) < today;
  const futureIndexes =
    group?.indexes.filter(
      (index) =>
        sessions[index]!.dayOffset >= (session?.dayOffset ?? 0) &&
        (!continuing || addDays(anchorDate, sessions[index]!.dayOffset) >= today),
    ) ?? [];
  const visibleGroups =
    view === "pattern"
      ? groups
      : groups.filter((entry) =>
          entry.indexes.some((index) => sessions[index]!.weekIndex === week),
        );

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change(patch: Partial<ProgramBlueprint>) {
    setPlan((previous) => ({ ...previous, ...patch }));
    setError(null);
    setFieldError(null);
    setMessage(null);
  }
  function choose(index: number) {
    setSelected(index);
    setScope("future_repeats");
    setError(null);
    setFieldError(null);
  }
  function update(patch: Partial<ProgrammeEnduranceSession>) {
    if (!session || past) return;
    change({
      enduranceSessions: updateEnduranceSession(sessions, selected, patch, {
        scope,
        fromDayOffset: continuing ? daysBetween(anchorDate, today) : 0,
      }),
    });
  }
  function target(
    field: "durationMs" | "distanceMetres" | "effort",
    end: 0 | 1,
    input: string,
    scale: number,
  ) {
    if (!session) return;
    const previous = session.prescription.sessionTargets[field];
    const value = input === "" ? NaN : Number(input) * scale;
    const range: [number, number] =
      end === 0 ? [value, previous?.[1] ?? value] : [previous?.[0] ?? value, value];
    // Clearing one end must not silently erase the other. Both blank means no target.
    const next = range.every(Number.isNaN) ? null : range;
    update({
      prescription: {
        ...session.prescription,
        sessionTargets: { ...session.prescription.sessionTargets, [field]: next },
      },
    });
  }
  async function save(review: boolean) {
    setShowProblems(true);
    setError(null);
    setMessage(null);
    // A typed step may still hold a refused edit. Never save its previous valid value as if
    // the edit succeeded. Reveal the field even when its disclosure has since been closed.
    const invalid = form.current?.querySelector<HTMLInputElement>('[data-typed-invalid="true"]');
    if (invalid) {
      let parent = invalid.parentElement;
      while (parent) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
        parent = parent.parentElement;
      }
      invalid.focus();
      return;
    }
    const parsed = programBlueprintSchema.safeParse({ ...plan, name: plan.name.trim() });
    if (!parsed.success) {
      const sessionIssue = parsed.error.issues.find(
        (issue) => issue.path[0] === "enduranceSessions" && typeof issue.path[1] === "number",
      );
      if (sessionIssue) {
        const index = sessionIssue.path[1] as number;
        setSelected(index);
        setWeek(sessions[index]!.weekIndex);
      }
      const general = parsed.error.issues.filter((issue) => {
        if (issue.path[0] === "name" || issue.path[0] === "weeks") return false;
        return !(
          issue.path[3] === "sessionTargets" &&
          ["durationMs", "distanceMetres", "effort"].includes(String(issue.path[4]))
        );
      });
      setError(general.map((issue) => issue.message).join(" ") || null);
      return;
    }
    const result = await coachingAction(() =>
      saveProgramDraftAction(parsed.data, draft?.id, draft?.revision),
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setDraft({ id: result.value.id, revision: result.value.revision });
    setSavedPlan(JSON.stringify(plan));
    if (!review) {
      setMessage("Draft saved.");
      return;
    }
    const checked = await coachingAction(() =>
      reviewProgramDraftAction(result.value.id, result.value.revision),
    );
    if (checked.ok) router.push(`/plan/drafts/${checked.value.id}` as Route);
    else setError(checked.error);
  }
  const distanceScale =
    sport === "swimming"
      ? units.poolUnit === "yd"
        ? 0.9144
        : 1
      : units.distanceUnit === "mi"
        ? 1609.344
        : 1000;
  const distanceUnit = sport === "swimming" ? units.poolUnit : units.distanceUnit;
  const selectOptions =
    view === "pattern"
      ? visibleGroups.map((entry) => {
          const index =
            entry.indexes.find(
              (i) => !continuing || addDays(anchorDate, sessions[i]!.dayOffset) >= today,
            ) ?? entry.indexes[0]!;
          const item = sessions[index]!;
          return {
            index,
            label: `${item.name || "Session"}${entry.indexes.length > 1 ? ` · ${entry.indexes.length} repeats` : ` · Week ${item.weekIndex}`}`,
          };
        })
      : sessions.flatMap((entry, index) =>
          entry.weekIndex === week
            ? [
                {
                  index,
                  label: `${formatIsoDate(addDays(anchorDate, entry.dayOffset), year)} · ${entry.name || "Session"}`,
                },
              ]
            : [],
        );
  // A selected occurrence can be later in a pattern; keep its pattern selected in the outline.
  const selectedOption =
    view === "pattern"
      ? selectOptions.find((option) => group?.indexes.includes(option.index))?.index
      : selected;

  return (
    <form
      ref={form}
      className="space-y-6 pb-24"
      noValidate
      onSubmit={(event) => event.preventDefault()}
    >
      <fieldset disabled={!ready || pending} className="min-w-0 space-y-6">
        <div className="space-y-3">
          <Field label="Programme name" error={nameError}>
            <Input
              value={plan.name}
              maxLength={120}
              onChange={(event) => change({ name: event.target.value })}
            />
          </Field>
          <Disclosure
            summary="Programme settings"
            meta={`${plan.weeks || "—"} weeks`}
            variant="inline"
            defaultOpen={Boolean(weeksError) || fieldError?.field === "weeks"}
          >
            <div className="space-y-3">
              {/* What saving needs, said before it is typed rather than behind an ⓘ. */}
              <Field
                label="Length in weeks"
                hint="Move or remove any sessions past the new end before saving."
                error={
                  weeksError ?? (fieldError?.field === "weeks" ? fieldError.message : undefined)
                }
              >
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={plan.weeks || ""}
                  onChange={(event) => change({ weeks: Number(event.target.value) })}
                />
              </Field>
              <Field label="Programme notes" aside="Optional">
                <Textarea
                  value={plan.notes}
                  maxLength={2000}
                  onChange={(event) => change({ notes: event.target.value })}
                />
              </Field>
            </div>
          </Disclosure>
        </div>

        <section aria-label="Choose a session" className="space-y-3">
          <div className="heading-row">
            {/* The ⓘ beside the heading, never in it, so the heading reads as its name. */}
            <div className="flex items-center gap-1">
              <h2 className="caption-head">Your sessions</h2>
              {(continuing || view === "pattern") && (
                <InfoTip label="About your sessions">
                  {[
                    continuing && "Past sessions and anything logged stay as they are.",
                    view === "pattern" &&
                      "Identical sessions show once; use By week when weeks differ.",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                </InfoTip>
              )}
            </div>
            <span className="text-sm text-ink-2">
              {sessions.length} scheduled · {groups.length}{" "}
              {groups.length === 1 ? "workout" : "workouts"}
            </span>
          </div>
          <SegmentedControl
            name="session-view"
            value={view}
            columns={2}
            options={[
              { value: "pattern", label: "Repeating workouts" },
              { value: "week", label: "By week" },
            ]}
            onChange={(value) => {
              setView(value);
              if (session) setWeek(session.weekIndex);
            }}
          />
          {view === "week" && (
            <Field label="Week">
              <Select
                value={week}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  setWeek(next);
                  choose(sessions.findIndex((entry) => entry.weekIndex === next));
                }}
              >
                {Array.from({ length: calendarWeeks }, (_, i) => (
                  <option key={i + 1} value={i + 1}>
                    Week {i + 1}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          {selectOptions.length > 0 ? (
            <Field label={view === "pattern" ? "Workout to edit" : "Session to edit"}>
              <Select
                value={selectedOption ?? ""}
                onChange={(event) => choose(Number(event.target.value))}
              >
                {selectOptions.map((option) => (
                  <option key={option.index} value={option.index}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <p className="text-sm text-ink-2">No sessions this week.</p>
          )}
        </section>

        {session && (view === "pattern" || session.weekIndex === week) && (
          <section
            key={`${session.lineageId}:${session.originalWeekIndex ?? session.weekIndex}`}
            aria-label="Session editor"
            className="space-y-4 border-t border-line pt-5"
          >
            {/* Its name is the field below; its date and how it repeats are said once here. */}
            <p className="text-sm text-ink-2">
              {formatIsoDate(addDays(anchorDate, session.dayOffset), year)}
              {group?.intervalDays
                ? ` · Repeats every ${group.intervalDays === 7 ? "week" : `${group.intervalDays} days`}`
                : ""}
            </p>
            {past ? (
              <p className="text-sm">
                Past session · {describePrescription(session.prescription, units)}
              </p>
            ) : (
              <>
                {futureIndexes.length > 1 && (
                  <Field
                    label="Apply workout changes to"
                    info="Dates change one session at a time. Finished sessions keep their targets."
                  >
                    <Select
                      value={scope}
                      onChange={(event) => setScope(event.target.value as Scope)}
                    >
                      <option value="future_repeats">
                        This and future repeats ({futureIndexes.length} sessions)
                      </option>
                      <option value="this">Only this session</option>
                    </Select>
                  </Field>
                )}
                <Field label="Session name" aside="Optional">
                  <Input
                    value={session.name}
                    maxLength={120}
                    onChange={(event) =>
                      update({
                        name: event.target.value,
                        prescription: {
                          ...session.prescription,
                          title: event.target.value || null,
                        },
                      })
                    }
                  />
                </Field>
                {sport === "running" && (
                  <Field label="Kind of run">
                    <Select
                      value={session.prescription.running?.sessionType ?? ""}
                      onChange={(event) =>
                        update({
                          prescription: {
                            ...session.prescription,
                            running: withSessionType(
                              session.prescription.running,
                              event.target.value,
                            ),
                          },
                        })
                      }
                    >
                      <option value="">Not said</option>
                      {RUN_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {RUN_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
                {sport !== "running" && session.prescription.nodes.length > 0 && (
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium">Session targets</p>
                    <InfoTip label="About session targets">
                      Its steps stay as written; these are the whole session&apos;s targets.
                    </InfoTip>
                  </div>
                )}
                <div className="adaptive-grid">
                  {(
                    [
                      ["durationMs", "Minutes", 60_000],
                      ["distanceMetres", UNIT_WORDS[distanceUnit], distanceScale],
                      // The sessions' own words for it: "Effort 2–3 of 5".
                      ["effort", "Effort out of 5", 1],
                    ] as const
                  ).map(([field, label, scale]) => (
                    <fieldset key={field} className="min-w-0 space-y-2">
                      <legend className="text-sm font-medium">{label}</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {([0, 1] as const).map((end) => (
                          // "From" and "To" under the legend, each named whole for a screen
                          // reader ("Minutes from"): the legend is not said three times.
                          <Field
                            key={end}
                            label={end === 0 ? "From" : "To"}
                            error={programmeFieldError(
                              issues,
                              [
                                "enduranceSessions",
                                selected,
                                "prescription",
                                "sessionTargets",
                                field,
                                end,
                              ],
                              scale,
                            )}
                          >
                            <Input
                              aria-label={`${label} ${end === 0 ? "from" : "to"}`}
                              type="number"
                              step="any"
                              min={0}
                              max={field === "effort" ? 5 : undefined}
                              value={
                                Number.isFinite(session.prescription.sessionTargets[field]?.[end])
                                  ? Number(
                                      (
                                        session.prescription.sessionTargets[field]![end] / scale
                                      ).toFixed(6),
                                    )
                                  : ""
                              }
                              onChange={(event) => target(field, end, event.target.value, scale)}
                            />
                          </Field>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
                {sport === "running" && (
                  <>
                    {(session.prescription.nodes.length === 0 ||
                      session.prescription.sessionTargets.paceSecondsPerKm ||
                      session.prescription.sessionTargets.heartRateZones) && (
                      <fieldset className="min-w-0 space-y-2">
                        <legend className="text-sm font-medium">Whole-run pace and zone</legend>
                        <PaceZoneFields
                          pace={session.prescription.sessionTargets.paceSecondsPerKm}
                          zones={session.prescription.sessionTargets.heartRateZones}
                          unit={units.distanceUnit}
                          onChange={({ pace, zones }) => {
                            const {
                              paceSecondsPerKm: _pace,
                              heartRateZones: _zones,
                              ...targets
                            } = session.prescription.sessionTargets;
                            update({
                              prescription: {
                                ...session.prescription,
                                sessionTargets: {
                                  ...targets,
                                  ...(pace ? { paceSecondsPerKm: pace } : {}),
                                  ...(zones ? { heartRateZones: zones } : {}),
                                },
                              },
                            });
                          }}
                        />
                      </fieldset>
                    )}
                    <div className="space-y-3">
                      <h3 className="type-heading">Steps</h3>
                      <StepsEditor
                        nodes={session.prescription.nodes}
                        unit={units.distanceUnit}
                        onChange={(nodes) =>
                          update({
                            prescription: {
                              ...session.prescription,
                              structureSource: "authored",
                              nodes,
                            },
                          })
                        }
                      />
                    </div>
                  </>
                )}
                <Disclosure summary="Date and instructions" variant="inline">
                  <div className="space-y-3">
                    <SessionDateField
                      key={`${anchorDate}:${today}:${calendarWeeks}`}
                      min={continuing && today > anchorDate ? today : anchorDate}
                      max={addDays(anchorDate, calendarWeeks * 7 - 1)}
                      value={addDays(anchorDate, session.dayOffset)}
                      onChange={(date) => {
                        const offset = daysBetween(anchorDate, date);
                        update({ dayOffset: offset });
                        setWeek(Math.floor(offset / 7) + 1);
                      }}
                    />
                    <Field label="Time" aside="Optional">
                      <Input
                        type="time"
                        value={session.scheduledLocalTime ?? ""}
                        onChange={(event) =>
                          update({ scheduledLocalTime: event.target.value || null })
                        }
                      />
                    </Field>
                    <Field label="Instructions" aside="Optional">
                      <Textarea
                        value={session.prescription.instructions ?? ""}
                        maxLength={300}
                        onChange={(event) =>
                          update({
                            prescription: {
                              ...session.prescription,
                              instructions: event.target.value || null,
                            },
                          })
                        }
                      />
                    </Field>
                  </div>
                </Disclosure>
                <Disclosure
                  summary="Repeat or remove"
                  variant="inline"
                  defaultOpen={fieldError?.field === "repeat"}
                >
                  <div className="space-y-3">
                    <Field
                      label="Repeat every (days)"
                      info="7 keeps the weekday; 4 makes a four-day rotation. Existing sessions stay."
                      error={fieldError?.field === "repeat" ? fieldError.message : undefined}
                    >
                      <Input
                        type="number"
                        min={1}
                        max={364}
                        value={repeatDays || ""}
                        onChange={(event) => setRepeatDays(Number(event.target.value))}
                      />
                    </Field>
                    <Button
                      variant="secondary"
                      disabled={
                        !validWeeks ||
                        !Number.isInteger(repeatDays) ||
                        repeatDays < 1 ||
                        repeatDays > 364 ||
                        session.dayOffset + repeatDays >= plan.weeks * 7
                      }
                      onClick={() => {
                        const repeated = repeatEnduranceSession(session, {
                          everyDays: repeatDays,
                          throughDayOffset: plan.weeks * 7 - 1,
                        });
                        const existingOffsets = new Set(
                          (group?.indexes ?? [selected]).map((i) => sessions[i]!.dayOffset),
                        );
                        const additions = repeated
                          .slice(1)
                          .filter((entry) => !existingOffsets.has(entry.dayOffset));
                        if (sessions.length + additions.length > 730) {
                          setFieldError({
                            field: "repeat",
                            message:
                              "A programme can hold up to 730 sessions. Shorten the repeat range.",
                          });
                          return;
                        }
                        const linked = sessions.map((entry, index) =>
                          (group?.indexes ?? [selected]).includes(index)
                            ? { ...entry, seriesId: repeated[0]!.seriesId }
                            : entry,
                        );
                        change({ enduranceSessions: [...linked, ...additions] });
                        setView("pattern");
                        setMessage(`${additions.length} repeats added.`);
                      }}
                    >
                      Repeat through programme
                    </Button>
                    <div>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          const remove = new Set(
                            scope === "future_repeats" ? futureIndexes : [selected],
                          );
                          const next = sessions.filter((_, index) => !remove.has(index));
                          change({ enduranceSessions: next });
                          choose(
                            Math.max(
                              0,
                              next.findIndex(
                                (entry) =>
                                  !continuing || addDays(anchorDate, entry.dayOffset) >= today,
                              ),
                            ),
                          );
                        }}
                      >
                        {scope === "future_repeats" && futureIndexes.length > 1
                          ? `Remove ${futureIndexes.length} future repeats`
                          : "Remove this session"}
                      </Button>
                    </div>
                  </div>
                </Disclosure>
              </>
            )}
          </section>
        )}

        <div className="space-y-3 border-t border-line pt-4">
          {templates.length > 0 && (
            <Field label="Add from a session template">
              <Select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                <option value="">New session</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Button
            variant="secondary"
            disabled={sessions.length >= 730 || !validWeeks}
            onClick={() => {
              const template = templates.find((entry) => entry.id === templateId);
              const earliest = continuing ? Math.max(0, daysBetween(anchorDate, today)) : 0;
              const offset = Math.max(earliest, (week - 1) * 7);
              if (offset >= plan.weeks * 7) {
                setFieldError({
                  field: "weeks",
                  message: "Extend the programme length to add an upcoming session.",
                });
                return;
              }
              change({
                enduranceSessions: [
                  ...sessions,
                  {
                    lineageId: crypto.randomUUID(),
                    name: template?.name ?? `Session ${sessions.length + 1}`,
                    weekIndex: Math.floor(offset / 7) + 1,
                    dayOffset: offset,
                    scheduledLocalTime: null,
                    prescription: template?.prescription ?? newPrescription(sport),
                  },
                ],
              });
              choose(sessions.length);
              setWeek(Math.floor(offset / 7) + 1);
            }}
          >
            Add session
          </Button>
        </div>
      </fieldset>
      {/* A confirmation is said, then goes (SavedNotice), never left standing. */}
      {message && message !== "Draft saved." && <SavedNotice key={message}>{message}</SavedNotice>}
      <PinnedActions stack>
        {message === "Draft saved." && <SavedNotice>{message}</SavedNotice>}
        <FormError message={nameError || weeksError ? undefined : (error ?? undefined)} />
        {/* Peers, one size, the one that ends the task last (DESIGN.md, The Equal Actions Rule). */}
        <div className="action-row">
          <Button
            size="lg"
            variant="secondary"
            disabled={!ready || pending}
            onClick={() => start(() => save(false))}
          >
            Save draft
          </Button>
          <Button size="lg" disabled={!ready || pending} onClick={() => start(() => save(true))}>
            {pending ? "Saving…" : "Review programme"}
          </Button>
        </div>
      </PinnedActions>
    </form>
  );
}
