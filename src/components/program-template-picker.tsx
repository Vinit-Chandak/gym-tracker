"use client";

import { Check } from "@/components/ui/icons";
import { useActionState, useState } from "react";

import { Field, Input } from "@/components/ui/input";
import { FormError, SubmitButton } from "@/components/ui/form";
import { adoptProgramTemplateAction, type AdoptProgramState } from "@/server/actions/programs";

export type TemplateOption = {
  slug: string;
  name: string;
  summary: string;
  highlights: readonly string[];
  weeks: number;
};

const INITIAL: AdoptProgramState = {};

/**
 * Picks a shared programme and a start date, then copies it into the user's own rows.
 * Used by the last onboarding step and by Settings for anyone starting a new block.
 */
export function ProgramTemplatePicker({
  templates,
  today,
  submitLabel = "Start this programme",
  finishOnboarding = false,
}: {
  templates: readonly TemplateOption[];
  /** Today in the user's own time zone, `YYYY-MM-DD`; the default start date. */
  today: string;
  submitLabel?: string;
  /** Set on the last onboarding step: adopting also ends setup. */
  finishOnboarding?: boolean;
}) {
  const [state, formAction] = useActionState(adoptProgramTemplateAction, INITIAL);
  const [chosen, setChosen] = useState(templates[0]?.slug ?? "");

  if (templates.length === 0) {
    return <p className="text-sm text-ink-muted">No programme templates are available.</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      {finishOnboarding && <input type="hidden" name="finishOnboarding" value="1" />}
      <ul className="space-y-2">
        {templates.map((template) => {
          const active = template.slug === chosen;
          return (
            <li key={template.slug}>
              <label className="flex cursor-pointer gap-3 rounded-control border border-transparent bg-surface-raised p-3 has-checked:border-accent has-checked:bg-accent-soft">
                <input
                  type="radio"
                  name="templateSlug"
                  value={template.slug}
                  checked={active}
                  onChange={() => setChosen(template.slug)}
                  className="mt-1 size-5 shrink-0 accent-[var(--ov-accent)]"
                />
                <span className="min-w-0 space-y-1">
                  <span className="block font-medium">{template.name}</span>
                  <span className="block text-sm text-ink-muted">{template.summary}</span>
                  <ul className="space-y-0.5 pt-1">
                    {template.highlights.map((highlight) => (
                      <li key={highlight} className="flex gap-1.5 text-xs text-ink-subtle">
                        <Check className="mt-0.5 shrink-0 text-accent" aria-hidden />
                        <span className="min-w-0">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <Field label="Start date">
        <Input type="date" name="startDate" defaultValue={today} required />
      </Field>

      <FormError message={state.error} />
      <SubmitButton pendingLabel="Setting up…">{submitLabel}</SubmitButton>
    </form>
  );
}
