"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { EnduranceSport } from "@/domain/activity";
import {
  endurancePrescriptionSchema,
  describePrescription,
  type EndurancePrescription,
} from "@/domain/activity-prescription";
import { addDays, daysBetween } from "@/domain/program-calendar";
import { programBlueprintSchema, type ProgramBlueprint } from "@/domain/program-blueprint";
import type { ProgrammeEnduranceSession } from "@/domain/programme-sport";
import type { SportUnits } from "@/lib/distance-units";
import {
  saveProgramDraftAction,
  reviewProgramDraftAction,
} from "@/server/actions/coaching-workflow";
import { coachingAction } from "./client-action";

export function EnduranceProgrammeBuilder({
  sport,
  initial,
  anchorDate,
  templates,
  units,
  today,
}: {
  sport: EnduranceSport;
  initial: { id: string; revision: number; blueprint: ProgramBlueprint } | null;
  anchorDate: string;
  today: string;
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
            name: "",
            weekIndex: 1,
            dayOffset: 0,
            scheduledLocalTime: null,
            prescription: endurancePrescriptionSchema.parse({ prescriptionVersion: 1, sport }),
          },
        ],
      },
  );
  const [draft, setDraft] = useState(
    initial ? { id: initial.id, revision: initial.revision } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("");
  const sessions = plan.enduranceSessions ?? [];
  const update = (index: number, patch: Partial<ProgrammeEnduranceSession>) =>
    setPlan((previous) => ({
      ...previous,
      enduranceSessions: previous.enduranceSessions!.map((entry, i) =>
        i === index ? { ...entry, ...patch } : entry,
      ),
    }));
  const target = (
    index: number,
    field: "durationMs" | "distanceMetres" | "effort",
    end: 0 | 1,
    input: string,
    scale: number,
  ) => {
    const session = sessions[index]!;
    const previous = session.prescription.sessionTargets[field];
    const value = input === "" ? null : Number(input) * scale;
    const next: [number, number] | null =
      value === null
        ? null
        : end === 0
          ? [value, previous?.[1] ?? value]
          : [previous?.[0] ?? value, value];
    update(index, {
      prescription: {
        ...session.prescription,
        sessionTargets: { ...session.prescription.sessionTargets, [field]: next },
      },
    });
  };
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
    if (!review) {
      setMessage("Draft saved.");
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
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-2">
        Dates are relative to the programme start. Completed sessions and past prescriptions stay
        unchanged when you edit an existing programme.
      </p>
      <Field label="Programme name">
        <Input
          value={plan.name}
          maxLength={120}
          onChange={(event) => setPlan({ ...plan, name: event.target.value })}
        />
      </Field>
      <Field label="Length in weeks">
        <Input
          type="number"
          min={1}
          max={52}
          value={plan.weeks}
          onChange={(event) => setPlan({ ...plan, weeks: Number(event.target.value) })}
        />
      </Field>
      <p className="text-sm text-ink-2">
        Dates below use {anchorDate} as the start.{" "}
        {initial
          ? "A revision continues the current programme."
          : "You’ll choose the start date when you review it."}
      </p>
      {sessions.map((session, index) => {
        const past = initial !== null && addDays(anchorDate, session.dayOffset) < today;
        return (
          <Card key={`${session.lineageId}:${session.weekIndex}:${index}`}>
            <h2 className="font-medium">
              Session {index + 1}
              {past ? " · Past prescription" : ""}
            </h2>
            {past ? (
              <p className="text-sm">
                {addDays(anchorDate, session.dayOffset)} · {session.name} ·{" "}
                {describePrescription(session.prescription, units)}
              </p>
            ) : (
              <>
                <Field label="Name">
                  <Input
                    value={session.name}
                    maxLength={120}
                    onChange={(event) =>
                      update(index, {
                        name: event.target.value,
                        prescription: {
                          ...session.prescription,
                          title: event.target.value || null,
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Date">
                  <Input
                    type="date"
                    min={anchorDate}
                    max={addDays(anchorDate, Math.max(1, plan.weeks) * 7 - 1)}
                    value={addDays(anchorDate, session.dayOffset)}
                    onChange={(event) => {
                      if (event.target.value)
                        update(index, { dayOffset: daysBetween(anchorDate, event.target.value) });
                    }}
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
                      <legend className="text-sm">{label}</legend>
                      <div className="grid grid-cols-2 gap-2">
                        {([0, 1] as const).map((end) => (
                          <Field key={end} label={end === 0 ? "From" : "To"}>
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
                              onChange={(event) =>
                                target(index, field, end, event.target.value, scale)
                              }
                            />
                          </Field>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
                {session.prescription.nodes.length > 0 && (
                  <p className="text-sm text-ink-2">
                    The structured steps from this session are preserved. Overall targets can be
                    edited here.
                  </p>
                )}
                <Field label="Instructions">
                  <Textarea
                    value={session.prescription.instructions ?? ""}
                    maxLength={2000}
                    onChange={(event) =>
                      update(index, {
                        prescription: {
                          ...session.prescription,
                          instructions: event.target.value || null,
                        },
                      })
                    }
                  />
                </Field>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setPlan({ ...plan, enduranceSessions: sessions.filter((_, i) => i !== index) })
                  }
                >
                  Remove session
                </Button>
              </>
            )}
          </Card>
        );
      })}
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
        onClick={() => {
          const template = templates.find((entry) => entry.id === templateId);
          const offset = Math.min(plan.weeks * 7 - 1, Math.max(0, daysBetween(anchorDate, today)));
          setPlan({
            ...plan,
            enduranceSessions: [
              ...sessions,
              {
                lineageId: crypto.randomUUID(),
                name: template?.name ?? "",
                weekIndex: Math.floor(offset / 7) + 1,
                dayOffset: offset,
                scheduledLocalTime: null,
                prescription:
                  template?.prescription ??
                  endurancePrescriptionSchema.parse({ prescriptionVersion: 1, sport }),
              },
            ],
          });
        }}
      >
        Add session
      </Button>
      <Field label="Programme notes">
        <Textarea
          value={plan.notes}
          maxLength={10000}
          onChange={(event) => setPlan({ ...plan, notes: event.target.value })}
        />
      </Field>
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
      <div className="flex flex-wrap gap-2">
        <Button disabled={pending} onClick={() => start(() => save(true))}>
          {pending ? "Saving…" : "Review programme"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => start(() => save(false))}>
          Save draft
        </Button>
      </div>
    </div>
  );
}
