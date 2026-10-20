"use client";

import { useState, useTransition } from "react";

import { Glyph } from "@/components/ui/glyphs";
import { attempted, OFFLINE_SUBMIT_MESSAGE } from "@/lib/offline-submit";
import { countActivityAsAction } from "@/server/actions/activities";

export type CountsAsChoice = {
  /** The planned session, or null for none: unplanned. */
  occurrenceId: string | null;
  label: string;
  sub?: string;
  /** What it counts as now, which has nothing to choose. */
  current: boolean;
};

/**
 * Which planned session an activity counts as (ADR 0058): one row per session it could count
 * as, and Unplanned. The current one is marked and does nothing; any other changes it at once,
 * and a refusal says why, beside the rows.
 */
export function CountsAsChoices({
  activityId,
  revision,
  choices,
}: {
  activityId: string;
  revision: number;
  choices: readonly CountsAsChoice[];
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="space-y-3">
      <ul className="ruled-list">
        {choices.map((choice) => (
          <li key={choice.occurrenceId ?? "unplanned"} className="nav-row-item">
            <button
              type="button"
              className="nav-row w-full text-left"
              disabled={pending || choice.current}
              aria-current={choice.current ? "true" : undefined}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const attempt = await attempted(
                    () => countActivityAsAction(activityId, revision, choice.occurrenceId),
                    OFFLINE_SUBMIT_MESSAGE,
                  );
                  if (!attempt.ok) setError(attempt.message);
                  else if (attempt.value && !attempt.value.ok) setError(attempt.value.error);
                });
              }}
            >
              <span className="nav-row-main">
                {choice.sub ? (
                  <span className="nav-row-text">
                    <span className="nav-row-head">
                      <span className="nav-row-label nav-row-label-bold">{choice.label}</span>
                    </span>
                    <span className="nav-row-sub">{choice.sub}</span>
                  </span>
                ) : (
                  <span className="nav-row-label">{choice.label}</span>
                )}
              </span>
              {choice.current ? (
                <span className="nav-row-value">Current</span>
              ) : (
                <Glyph name="chevronRight" className="nav-row-chevron glyph-20 shrink-0" />
              )}
            </button>
          </li>
        ))}
      </ul>
      {pending && (
        <p role="status" className="text-sm text-ink-2">
          Saving…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
