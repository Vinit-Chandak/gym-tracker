"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { PinnedActions } from "@/components/ui/pinned-actions";
import type { EnduranceSport } from "@/domain/activity";
import {
  endurancePrescriptionSchema,
  describePrescription,
  type EndurancePrescription,
} from "@/domain/activity-prescription";
import { addDays, daysBetween } from "@/domain/program-calendar";
import { programBlueprintSchema, type ProgramBlueprint } from "@/domain/program-blueprint";
import type { ProgrammeEnduranceSession } from "@/domain/programme-sport";
import {
  enduranceSessionGroups,
  repeatEnduranceSession,
  updateEnduranceSession,
} from "@/domain/endurance-series";
import type { SportUnits } from "@/lib/distance-units";
import {
  saveProgramDraftAction,
  reviewProgramDraftAction,
} from "@/server/actions/coaching-workflow";
import { coachingAction } from "./client-action";

type Scope = "this" | "future_repeats";

export function EnduranceProgrammeBuilder({
  sport,
  initial,
  anchorDate,
  templates,
  units,
  today,
  continuing = false,
}: {
  sport: EnduranceSport;
  initial: { id: string; revision: number; blueprint: ProgramBlueprint } | null;
  anchorDate: string;
  today: string;
  continuing?: boolean;
  units: SportUnits;
  templates: { id: string; name: string; prescription: EndurancePrescription }[];
}) {
  const router = useRouter();
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
            prescription: endurancePrescriptionSchema.parse({
              prescriptionVersion: 1,
              sport,
              sessionTargets: { durationMs: [1800000, 1800000] },
            }),
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
    enduranceSessionGroups(sessions).some((group) => group.indexes.length > 1) ? "pattern" : "week",
  );
  const [week, setWeek] = useState(() => sessions[Math.max(0, firstEditable)]?.weekIndex ?? 1);
  const [scope, setScope] = useState<Scope>("future_repeats");
  const [repeatDays, setRepeatDays] = useState(7);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
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
    setMessage(null);
  }
  function choose(index: number) {
    setSelected(index);
    setScope("future_repeats");
    setError(null);
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
    const value = input === "" ? null : Number(input) * scale;
    const next: [number, number] | null =
      value === null
        ? null
        : end === 0
          ? [value, previous?.[1] ?? value]
          : [previous?.[0] ?? value, value];
    update({
      prescription: {
        ...session.prescription,
        sessionTargets: { ...session.prescription.sessionTargets, [field]: next },
      },
    });
  }
  async function save(review: boolean) {
    setError(null);
    setMessage(null);
    const parsed = programBlueprintSchema.safeParse(plan);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
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
      setMessage("Draft saved. Your active programme is unchanged until you apply it.");
      return;
    }
    const checked = await coachingAction(() =>
      reviewProgramDraftAction(result.value.id, result.value.revision),
    );
    if (checked.ok) router.push(`/profile/programme/drafts/${checked.value.id}` as Route);
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
                  label: `${addDays(anchorDate, entry.dayOffset)} · ${entry.name || "Session"}`,
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
    <div className="space-y-6 pb-24">
      <fieldset disabled={pending} className="min-w-0 space-y-6">
        <div className="space-y-3">
          <Field label="Programme name">
            <Input
              value={plan.name}
              maxLength={120}
              placeholder="Name your programme"
              onChange={(event) => change({ name: event.target.value })}
            />
          </Field>
          <p className="text-sm text-ink-2">
            {continuing
              ? "Edit upcoming training. Past sessions and completed logs stay unchanged."
              : "Build your sessions, then review the programme and choose its start date."}
          </p>
          <details>
            <summary className="min-h-[var(--ov-target)] cursor-pointer py-3 font-medium">
              Programme settings · {plan.weeks || "—"} weeks
            </summary>
            <div className="space-y-3 pb-3">
              <Field
                label="Length in weeks"
                hint="Shortening the programme does not delete sessions. Move or remove any sessions beyond the new end before saving."
              >
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={plan.weeks || ""}
                  onChange={(event) => change({ weeks: Number(event.target.value) })}
                />
              </Field>
              <Field label="Programme notes">
                <Textarea
                  value={plan.notes}
                  maxLength={2000}
                  onChange={(event) => change({ notes: event.target.value })}
                />
              </Field>
            </div>
          </details>
        </div>

        <section aria-label="Choose a session" className="space-y-3 border-t border-line pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium">Your sessions</h2>
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
                {Array.from({ length: Math.max(1, Math.min(52, plan.weeks || 1)) }, (_, i) => (
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
            <p className="text-sm text-ink-2">No sessions this week. Add one below.</p>
          )}
          {view === "pattern" && (
            <p className="text-sm text-ink-2">
              Identical workouts appear once. Different weekly targets stay separate; use By week
              for a progressive plan.
            </p>
          )}
        </section>

        {session && (view === "pattern" || session.weekIndex === week) && (
          <section aria-label="Session editor" className="space-y-4 border-t border-line pt-5">
            <div>
              <h2 className="text-lg font-medium">{session.name || "Session"}</h2>
              <p className="mt-1 text-sm text-ink-2">
                {addDays(anchorDate, session.dayOffset)}
                {group?.intervalDays
                  ? ` · Repeats every ${group.intervalDays === 7 ? "week" : `${group.intervalDays} days`}`
                  : ""}
              </p>
            </div>
            {past ? (
              <p className="text-sm">
                Past prescription · {describePrescription(session.prescription, units)}. Choose an
                upcoming session to make changes.
              </p>
            ) : (
              <>
                {futureIndexes.length > 1 && (
                  <Field
                    label="Apply workout changes to"
                    hint={
                      group?.inferred
                        ? "These sessions have identical prescriptions and a regular schedule. Dates are edited individually."
                        : "Dates are edited individually. Different targets and completed sessions are preserved."
                    }
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
                <Field label="Session name">
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
                <div className="adaptive-grid">
                  {(
                    [
                      ["durationMs", "Minutes", 60_000],
                      ["distanceMetres", distanceUnit, distanceScale],
                      ["effort", "Effort (0–5)", 1],
                    ] as const
                  ).map(([field, label, scale]) => (
                    <fieldset key={field} className="min-w-0 space-y-2">
                      <legend className="text-sm font-medium">{label}</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {([0, 1] as const).map((end) => (
                          <Field key={end} label={`${label} ${end === 0 ? "from" : "to"}`}>
                            <Input
                              type="number"
                              step="any"
                              min={0}
                              max={field === "effort" ? 5 : undefined}
                              value={
                                session.prescription.sessionTargets[field]
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
                <details>
                  <summary className="min-h-[var(--ov-target)] cursor-pointer py-3 font-medium">
                    Date and instructions
                  </summary>
                  <div className="space-y-3 pb-3">
                    <Field
                      label="Session date"
                      hint={`Only this occurrence moves. Dates use ${anchorDate} as the programme start.`}
                    >
                      <Input
                        type="date"
                        min={continuing && today > anchorDate ? today : anchorDate}
                        max={addDays(anchorDate, Math.max(1, plan.weeks) * 7 - 1)}
                        value={addDays(anchorDate, session.dayOffset)}
                        onChange={(event) => {
                          if (event.target.value) {
                            const offset = daysBetween(anchorDate, event.target.value);
                            update({ dayOffset: offset });
                            setWeek(Math.floor(offset / 7) + 1);
                          }
                        }}
                      />
                    </Field>
                    <Field label="Time (optional)">
                      <Input
                        type="time"
                        value={session.scheduledLocalTime ?? ""}
                        onChange={(event) =>
                          update({ scheduledLocalTime: event.target.value || null })
                        }
                      />
                    </Field>
                    <Field label="Instructions">
                      <Textarea
                        value={session.prescription.instructions ?? ""}
                        maxLength={2000}
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
                    {session.prescription.nodes.length > 0 && (
                      <p className="text-sm text-ink-2">
                        This workout’s structured steps are preserved. These fields edit its overall
                        targets.
                      </p>
                    )}
                  </div>
                </details>
                <details>
                  <summary className="min-h-[var(--ov-target)] cursor-pointer py-3 font-medium">
                    Repeat or remove
                  </summary>
                  <div className="space-y-3 pb-3">
                    <Field
                      label="Repeat every (days)"
                      hint="7 keeps the same weekday. 4 creates a rolling four-day pattern. Existing sessions are kept."
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
                          setError(
                            "A programme can hold up to 730 sessions. Shorten the repeat range.",
                          );
                          return;
                        }
                        const linked = sessions.map((entry, index) =>
                          (group?.indexes ?? [selected]).includes(index)
                            ? { ...entry, seriesId: repeated[0]!.seriesId }
                            : entry,
                        );
                        change({ enduranceSessions: [...linked, ...additions] });
                        setView("pattern");
                        setMessage(
                          `${additions.length} repeats added. Edit this workout once to update its matching future repeats.`,
                        );
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
                </details>
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
            disabled={sessions.length >= 730 || plan.weeks < 1}
            onClick={() => {
              const template = templates.find((entry) => entry.id === templateId);
              const earliest = continuing ? Math.max(0, daysBetween(anchorDate, today)) : 0;
              const offset = Math.max(earliest, (week - 1) * 7);
              if (offset >= plan.weeks * 7) {
                setError("Extend the programme length to add an upcoming session.");
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
                    prescription:
                      template?.prescription ??
                      endurancePrescriptionSchema.parse({
                        prescriptionVersion: 1,
                        sport,
                        sessionTargets: { durationMs: [1800000, 1800000] },
                      }),
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
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <PinnedActions>
        <Button disabled={pending} onClick={() => start(() => save(true))}>
          {pending ? "Saving…" : "Review programme"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => start(() => save(false))}>
          Save draft
        </Button>
      </PinnedActions>
    </div>
  );
}
