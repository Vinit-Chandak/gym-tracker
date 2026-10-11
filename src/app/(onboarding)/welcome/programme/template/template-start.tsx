"use client";

import { useActionState, useState } from "react";

import { Art } from "@/components/art/art";
import type { StrengthColumn } from "@/components/art/geometry";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { formatIsoWeekdayDay } from "@/lib/format";
import { keepsErrorOnDisconnect } from "@/lib/offline-submit";
import { adoptProgramTemplateAction, type AdoptProgramState } from "@/server/actions/programs";

const INITIAL: AdoptProgramState = {};

/** Each fact led by the glyph that says what kind of fact it is. */
const FACT_GLYPHS: readonly GlyphName[] = ["calendar", "table", "target", "pace"];

/**
 * The programme to follow, and Start programme: copied into the athlete's own programme from
 * the day chosen, which ends setup and opens Today.
 */
export function TemplateStart({
  template,
  today,
}: {
  template: {
    slug: string;
    name: string;
    summary: string;
    highlights: readonly string[];
    firstDay: readonly StrengthColumn[];
  };
  today: string;
}) {
  const [state, formAction] = useActionState(
    keepsErrorOnDisconnect(adoptProgramTemplateAction),
    INITIAL,
  );
  const [startDate, setStartDate] = useState(today);

  return (
    <form action={formAction}>
      <input type="hidden" name="templateSlug" value={template.slug} />
      <input type="hidden" name="finishOnboarding" value="1" />
      {template.firstDay.length > 0 && (
        <figure className="template-print">
          <Art
            kind="print"
            label="The programme's first day"
            parts={[{ kind: "strength", columns: template.firstDay }]}
            className="size-full"
          />
        </figure>
      )}
      <h2 className="template-name">{template.name}</h2>
      <p className="onboarding-sub">{template.summary}</p>
      <ul className="template-facts">
        {template.highlights.map((fact, i) => (
          <li key={fact} className="template-fact">
            <Glyph name={FACT_GLYPHS[i] ?? "check"} className="glyph-18 shrink-0" />
            <span className="min-w-0">{fact}</span>
          </li>
        ))}
      </ul>
      <div className="date-row ready-start">
        <Glyph name="calendar" className="glyph-18 shrink-0" />
        <label htmlFor="template-start" className="min-w-0 flex-1 font-bold">
          Starts
        </label>
        <span aria-hidden className="date-row-value">
          {startDate === today ? "Today" : formatIsoWeekdayDay(startDate)}
          <Glyph name="chevronDown" className="glyph-16" />
        </span>
        <input
          id="template-start"
          type="date"
          name="startDate"
          value={startDate}
          min={today}
          onChange={(event) => setStartDate(event.target.value || today)}
          onClick={(event) => {
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
      <PinnedActions stack>
        <FormError message={state.error} />
        <SubmitButton pendingLabel="Setting up…">Start programme</SubmitButton>
      </PinnedActions>
    </form>
  );
}
