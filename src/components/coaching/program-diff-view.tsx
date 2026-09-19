import type { ReactNode } from "react";

import { Card } from "@/components/ui/card";
import {
  ArrowRight,
  ArrowsDownUp,
  Footprints,
  Minus,
  Plus,
  SlidersHorizontal,
  type AppIcon,
} from "@/components/ui/icons";
import type { DayDiff, DayOperation, DiffField, ProgramDiff } from "@/domain/program-diff";
import { WEEKDAY_NAMES } from "@/lib/labels";
import { cn } from "@/lib/utils";

/**
 * A programme change, as the difference it actually is.
 *
 * The review used to print the current programme, the proposed programme and then the
 * proposed days again, which is three readings of the same thing and no answer to the only
 * question being asked: what is different? So this shows the changed days and nothing else.
 * The whole programme has one home, and it is not here.
 *
 * Every row says what happened in a word as well as in a colour, because a colour alone is
 * not a sentence — not to somebody who cannot tell these two apart, and not in forced-colours
 * mode, where the palette collapses to two inks by design.
 */

type Names = Readonly<Record<string, string>>;

const nameOf = (names: Names, slug: string) => names[slug] ?? slug;

/** "Sets: 2 → 3", with the units and the unknowns the blueprint actually stores. */
function FieldLines({ fields }: { fields: readonly DiffField[] }) {
  if (!fields.length) return null;
  return (
    <ul className="mt-1 space-y-0.5">
      {fields.map((field) => (
        <li key={field.field} className="text-sm [overflow-wrap:anywhere] text-ink-muted">
          <span className="text-ink">{field.label}:</span>{" "}
          <span className="line-through decoration-ink-subtle">{field.from}</span>{" "}
          <span aria-hidden>→</span>
          <span className="sr-only">changes to</span> <span className="text-ink">{field.to}</span>
        </li>
      ))}
    </ul>
  );
}

/** The exercise itself, tinted for its side of a change and never tinted only. */
function Side({
  tone,
  name,
  targets,
}: {
  tone: "added" | "removed" | "plain";
  name: string;
  targets?: string;
}) {
  return (
    <div
      className={cn(
        "min-w-0 rounded-control px-2 py-1.5",
        tone === "added" && "bg-accent-soft",
        tone === "removed" && "bg-surface-raised",
      )}
    >
      <p
        className={cn(
          "font-medium [overflow-wrap:anywhere]",
          tone === "added" && "text-success",
          tone === "removed" && "text-danger",
        )}
      >
        {name}
      </p>
      {targets && (
        <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">{targets}</p>
      )}
    </div>
  );
}

function Operation({
  icon: Icon,
  label,
  children,
}: {
  icon: AppIcon;
  label: string;
  children: ReactNode;
}) {
  return (
    <li className="flex min-w-0 gap-3 py-3 first:pt-0 last:pb-0">
      <Icon scale="row" className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium tracking-wide text-ink-muted uppercase">{label}</p>
        <div className="mt-1 min-w-0">{children}</div>
      </div>
    </li>
  );
}

function OperationRow({
  operation,
  names,
  reason,
}: {
  operation: DayOperation;
  names: Names;
  reason?: ReactNode;
}) {
  const body = (() => {
    switch (operation.kind) {
      case "added":
        return (
          <Operation icon={Plus} label="Added">
            <Side
              tone="added"
              name={nameOf(names, operation.to.exerciseSlug)}
              targets={operation.to.targets}
            />
          </Operation>
        );
      case "removed":
        return (
          <Operation icon={Minus} label="Removed">
            <Side
              tone="removed"
              name={nameOf(names, operation.from.exerciseSlug)}
              targets={operation.from.targets}
            />
          </Operation>
        );
      case "replaced":
        return (
          <Operation icon={ArrowRight} label="Replaced">
            {/* Stacked on a phone, side by side once there is room for both names. */}
            <div className="grid items-center gap-2 sm:grid-cols-[1fr_auto_1fr]">
              <Side
                tone="removed"
                name={nameOf(names, operation.from.exerciseSlug)}
                targets={operation.from.targets}
              />
              <ArrowRight
                className="mx-auto shrink-0 rotate-90 text-ink-subtle sm:rotate-0"
                aria-hidden
              />
              <Side
                tone="added"
                name={nameOf(names, operation.to.exerciseSlug)}
                targets={operation.to.targets}
              />
            </div>
            <FieldLines fields={operation.fields} />
          </Operation>
        );
      case "retargeted":
        return (
          <Operation icon={SlidersHorizontal} label="Target changed">
            <p className="font-medium [overflow-wrap:anywhere]">
              {nameOf(names, operation.to.exerciseSlug)}
            </p>
            <FieldLines fields={operation.fields} />
          </Operation>
        );
      case "reordered":
        return (
          <Operation icon={ArrowsDownUp} label="Moved">
            <p className="font-medium [overflow-wrap:anywhere]">
              {nameOf(names, operation.to.exerciseSlug)}
            </p>
            <p className="mt-0.5 text-sm text-ink-muted tabular-nums">
              Position {operation.from.position} → {operation.to.position} in this day
            </p>
          </Operation>
        );
      case "moved_out":
        return (
          <Operation icon={ArrowRight} label="Moved to another day">
            <p className="font-medium [overflow-wrap:anywhere]">
              {nameOf(names, operation.to.exerciseSlug)}
            </p>
            <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">
              Now on {operation.otherDayName}
            </p>
            <FieldLines fields={operation.fields} />
          </Operation>
        );
      case "moved_in":
        return (
          <Operation icon={ArrowRight} label="Moved here">
            <p className="font-medium [overflow-wrap:anywhere]">
              {nameOf(names, operation.to.exerciseSlug)}
            </p>
            <p className="mt-0.5 text-sm [overflow-wrap:anywhere] text-ink-muted">
              Was on {operation.otherDayName}
            </p>
            <FieldLines fields={operation.fields} />
          </Operation>
        );
      case "run_added":
        return (
          <Operation icon={Footprints} label={`Run added · week ${operation.weekIndex}`}>
            <Side tone="added" name={operation.to} />
          </Operation>
        );
      case "run_removed":
        return (
          <Operation icon={Footprints} label={`Run removed · week ${operation.weekIndex}`}>
            <Side tone="removed" name={operation.from} />
          </Operation>
        );
      case "run_changed":
        return (
          <Operation icon={Footprints} label={`Run changed · week ${operation.weekIndex}`}>
            <FieldLines fields={operation.fields} />
          </Operation>
        );
    }
  })();
  if (!reason) return body;
  return (
    <>
      {body}
      <li className="pb-3 pl-9 text-sm [overflow-wrap:anywhere] text-ink-muted">{reason}</li>
    </>
  );
}

const DAY_STATUS: Record<DayDiff["status"], string | null> = {
  changed: null,
  added: "New day",
  removed: "Day removed",
};

function DayGroup({
  day,
  names,
  reasons,
}: {
  day: DayDiff;
  names: Names;
  reasons: Readonly<Record<string, ReactNode>>;
}) {
  const weekday = day.dayOfWeek ? WEEKDAY_NAMES[day.dayOfWeek] : null;
  const status = DAY_STATUS[day.status];
  return (
    <Card>
      <div>
        <h3 className="font-medium [overflow-wrap:anywhere]">
          {day.dayIndex === null ? day.name : `${day.dayIndex}. ${day.name}`}
        </h3>
        <p className="mt-0.5 text-sm text-ink-muted">
          {[weekday, status].filter(Boolean).join(" · ") || "Changed"}
        </p>
      </div>
      {day.fields.length > 0 && <FieldLines fields={day.fields} />}
      {day.operations.length > 0 && (
        <ul className="ruled-list">
          {day.operations.map((operation) => (
            <OperationRow
              key={`${operation.kind}:${operation.id}`}
              operation={operation}
              names={names}
              reason={reasons[operation.id]}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ProgramDiffView({
  diff,
  names,
  effectiveScope,
  reasons = {},
  emptyReason,
}: {
  diff: ProgramDiff;
  /** Exercise slug to the name the athlete sees; unknown slugs fall back to the slug. */
  names: Names;
  /** When the change takes effect — future occurrences only, never anything logged. */
  effectiveScope?: string | null;
  /** A short line to show beside one operation, keyed by its ID. */
  reasons?: Readonly<Record<string, ReactNode>>;
  /** What to say when nothing differs; the review's own reason belongs here. */
  emptyReason?: ReactNode;
}) {
  if (diff.empty)
    return (
      <Card>
        <h3 className="font-medium">No programme changes</h3>
        {emptyReason && <div className="text-sm [overflow-wrap:anywhere]">{emptyReason}</div>}
      </Card>
    );
  return (
    <div className="space-y-3">
      {diff.program.length > 0 && (
        <Card>
          <h3 className="font-medium">The programme itself</h3>
          <FieldLines fields={diff.program} />
        </Card>
      )}
      {diff.days.map((day) => (
        <DayGroup key={day.key} day={day} names={names} reasons={reasons} />
      ))}
      {effectiveScope && <p className="px-1 text-sm text-ink-muted">{effectiveScope}</p>}
    </div>
  );
}
