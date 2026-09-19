"use client";

import { useActionState, useState } from "react";

import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Field, Input } from "@/components/ui/input";
import { Section } from "@/components/ui/section";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

/**
 * Scheduling one session (SCHED-08).
 *
 * A date, a sport and — optionally — a template. Choosing a template copies the revision it
 * has right now, so editing that template next month leaves this one alone.
 */

export type ScheduleTemplateOption = {
  id: string;
  revisionId: string;
  name: string;
  summary: string;
};

export function ScheduleForm({
  action,
  sport,
  sports,
  today,
  templates,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  sport: ActivitySport;
  sports: readonly ActivitySport[];
  today: string;
  templates: readonly ScheduleTemplateOption[];
}) {
  const [state, formAction] = useActionState(action, INITIAL_FORM_STATE);
  const [chosen, setChosen] = useState("");
  const template = templates.find((item) => item.id === chosen) ?? null;

  return (
    <form action={formAction} className="space-y-[var(--section-gap)]">
      <Section title="What and when">
        <Card>
          <Field group label="Sport" error={state.fieldErrors?.sport}>
            <SegmentedControl
              name="sport"
              aria-label="Sport"
              options={sports.map((item) => ({
                value: item,
                label: ACTIVITY_SPORT_LABELS[item],
              }))}
              defaultValue={state.values?.sport ?? sport}
              columns={sports.length}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Date" error={state.fieldErrors?.scheduledOn}>
              <Input
                name="scheduledOn"
                type="date"
                defaultValue={state.values?.scheduledOn ?? today}
                required
              />
            </Field>
            <Field label="Time" hint="Optional" error={state.fieldErrors?.scheduledLocalTime}>
              <Input
                name="scheduledLocalTime"
                type="time"
                defaultValue={state.values?.scheduledLocalTime ?? ""}
              />
            </Field>
          </div>
          <p className="text-sm text-ink-muted">
            A time orders the day&rsquo;s cards. Nothing starts recording.
          </p>
        </Card>
      </Section>

      <Section title="Targets">
        <Card>
          <Field label="Template" hint="Optional" error={state.fieldErrors?.templateId}>
            <Select
              name="templateId"
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
            >
              <option value="">No targets — just the date</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.summary}
                </option>
              ))}
            </Select>
          </Field>
          {/* The revision, not the template: what is scheduled is what the template says now. */}
          <input type="hidden" name="templateRevisionId" value={template?.revisionId ?? ""} />
          {template && <p className="text-sm text-ink-muted">Copies {template.summary}.</p>}
        </Card>
      </Section>

      <div className="space-y-2">
        <FormError message={state.formError} />
        <SubmitButton pendingLabel="Scheduling…">Schedule it</SubmitButton>
      </div>
    </form>
  );
}
