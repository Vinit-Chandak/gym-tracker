"use client";

import { Check } from "@/components/ui/icons";
import { useActionState, useState } from "react";

import { Field, Input } from "@/components/ui/input";
import { FormError, SubmitButton } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { keepsErrorOnDisconnect } from "@/lib/offline-submit";
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
 * Used by the last onboarding step and by Profile › Programme for anyone starting a new block.
 *
 * The programmes are ruled rows; the chosen one sits under the highlighter's wash with a tick,
 * so the choice reads without the colour.
 */
export function ProgramTemplatePicker({
  templates,
  today,
  submitLabel = "Start this programme",
  submitVariant = "primary",
  finishOnboarding = false,
}: {
  templates: readonly TemplateOption[];
  /** Today in the user's own time zone, `YYYY-MM-DD`; the default start date. */
  today: string;
  submitLabel?: string;
  /**
   * `secondary` where another action on the screen already holds the highlighter (the coach's
   * way of starting a programme sits above this picker on both screens that show it).
   */
  submitVariant?: "primary" | "secondary";
  /** Set on the last onboarding step: adopting also ends setup. */
  finishOnboarding?: boolean;
}) {
  const [state, formAction] = useActionState(
    keepsErrorOnDisconnect(adoptProgramTemplateAction),
    INITIAL,
  );
  const [chosen, setChosen] = useState(templates[0]?.slug ?? "");

  if (templates.length === 0) {
    return <p className="text-sm text-ink-muted">No programme templates are available.</p>;
  }

  return (
    <form action={formAction} className="space-y-4">
      {finishOnboarding && <input type="hidden" name="finishOnboarding" value="1" />}
      <ul className="box-rows">
        {templates.map((template) => {
          const active = template.slug === chosen;
          return (
            <li key={template.slug}>
              <label
                className={cn(
                  "flex cursor-pointer gap-3 py-3 transition-colors duration-[var(--ov-duration-feedback)] has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus has-[:focus-visible]:ring-inset",
                  active ? "bg-highlight-soft" : "active:bg-surface-raised",
                )}
              >
                <input
                  type="radio"
                  name="templateSlug"
                  value={template.slug}
                  checked={active}
                  onChange={() => setChosen(template.slug)}
                  className="sr-only"
                />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="block font-medium [overflow-wrap:anywhere]">
                    {template.name}
                  </span>
                  <span className="block text-sm text-ink-muted">{template.summary}</span>
                  <ul className="space-y-0.5 pt-1">
                    {template.highlights.map((highlight) => (
                      <li key={highlight} className="flex gap-1.5 text-xs text-ink-subtle">
                        <Check className="mt-0.5 shrink-0 text-pen" aria-hidden />
                        <span className="min-w-0">{highlight}</span>
                      </li>
                    ))}
                  </ul>
                </span>
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-control border",
                    active
                      ? "border-ink bg-ink text-canvas"
                      : "border-line-strong text-transparent",
                  )}
                  aria-hidden
                >
                  <Check className="!size-4" aria-hidden />
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
      <SubmitButton variant={submitVariant} pendingLabel="Setting up…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
