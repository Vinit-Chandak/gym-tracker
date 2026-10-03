"use client";

import { useActionState, useState, type ReactNode } from "react";

import { Art } from "@/components/art/art";
import type { StrengthColumn } from "@/components/art/geometry";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { formatIsoWeekdayDay } from "@/lib/format";
import { keepsErrorOnDisconnect } from "@/lib/offline-submit";
import { adoptProgramTemplateAction, type AdoptProgramState } from "@/server/actions/programs";

export type TemplateOption = {
  slug: string;
  name: string;
  summary: string;
  highlights: readonly string[];
  weeks: number;
  /** Its first lifting day, as the print draws it: a column of sets for each exercise. */
  firstDay?: readonly StrengthColumn[];
};

const INITIAL: AdoptProgramState = {};

/**
 * Picks a shared programme and a start date, then copies it into the user's own rows (board
 * Plan): each template a card, its first day's print, its name, what it is and how long; the
 * chosen one outlined in ink and checked, its start date a row under it. Used by the last
 * onboarding step and by Profile › Programme for anyone starting a new block.
 */
export function ProgramTemplatePicker({
  templates,
  today,
  submitLabel = "Start this programme",
  finishOnboarding = false,
  pinned = false,
  extra,
}: {
  templates: readonly TemplateOption[];
  /** Today in the user's own time zone, `YYYY-MM-DD`; the default start date. */
  today: string;
  submitLabel?: string;
  /** Set on the last onboarding step: adopting also ends setup. */
  finishOnboarding?: boolean;
  /** The action pinned at the foot (the first run), rather than under the cards. */
  pinned?: boolean;
  /** Under the action in the foot: the way past it ("Just track my workouts"). */
  extra?: ReactNode;
}) {
  const [state, formAction] = useActionState(
    keepsErrorOnDisconnect(adoptProgramTemplateAction),
    INITIAL,
  );
  const [chosen, setChosen] = useState(templates[0]?.slug ?? "");
  const [startDate, setStartDate] = useState(today);

  if (templates.length === 0) {
    return <p className="type-meta text-ink-2">No programme templates are available.</p>;
  }

  const actions = (
    <>
      <FormError message={state.error} />
      <SubmitButton pendingLabel="Setting up…">{submitLabel}</SubmitButton>
      {extra}
    </>
  );

  return (
    <form action={formAction}>
      {finishOnboarding && <input type="hidden" name="finishOnboarding" value="1" />}
      <ul className="space-y-2.5">
        {templates.map((template) => {
          const active = template.slug === chosen;
          return (
            <li key={template.slug}>
              <div className="template-card" data-chosen={active}>
                <label className="block cursor-pointer">
                  <input
                    type="radio"
                    name="templateSlug"
                    value={template.slug}
                    checked={active}
                    onChange={() => setChosen(template.slug)}
                    className="peer sr-only"
                  />
                  {template.firstDay && template.firstDay.length > 0 && (
                    <span className="template-card-print">
                      <Art
                        kind="print"
                        parts={[{ kind: "strength", columns: template.firstDay }]}
                        className="size-full"
                      />
                    </span>
                  )}
                  <span className="mt-2.5 flex items-start gap-2">
                    <span className="template-card-name">{template.name}</span>
                    {active && (
                      <span aria-hidden className="picker-chosen">
                        <Glyph name="check" className="glyph-14" />
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block type-meta-small leading-[1.4] text-ink-2">
                    {template.summary}
                  </span>
                  {template.highlights[0] && (
                    <span className="mt-2 block type-meta-small font-semibold tabular-nums">
                      {template.highlights[0]}
                    </span>
                  )}
                </label>
                {active && (
                  <div className="date-row">
                    <Glyph name="calendar" className="glyph-18 shrink-0" />
                    <label htmlFor="template-start" className="min-w-0 flex-1 font-semibold">
                      Start date
                    </label>
                    <span aria-hidden className="date-row-value">
                      {startDate === today ? "Today" : formatIsoWeekdayDay(startDate)}
                      <Glyph name="chevronDown" className="glyph-16" />
                    </span>
                    {/* The platform's own date picker, over the whole row and unseen. */}
                    <input
                      id="template-start"
                      type="date"
                      name="startDate"
                      value={startDate}
                      onChange={(event) => setStartDate(event.target.value || today)}
                      onClick={(event) => {
                        // A desktop browser opens its picker only from its own icon otherwise.
                        try {
                          event.currentTarget.showPicker?.();
                        } catch {
                          /* Already open, or not allowed here: the field still takes typing. */
                        }
                      }}
                      required
                      className="select-row-native"
                    />
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {pinned ? (
        <PinnedActions stack>{actions}</PinnedActions>
      ) : (
        <div className="mt-4 space-y-2">{actions}</div>
      )}
    </form>
  );
}
