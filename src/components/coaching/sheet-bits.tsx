import type { ReactNode } from "react";

import { ChatText, Pencil } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export type CellState = "pending" | "current" | "done" | "skipped";

/**
 * The number in the margin, drawn like a cell of the cycle strip: outlined while still to
 * come, under the highlighter when it is the current one, inked in once done, struck when
 * skipped. Decorative — the row beside it always says the same thing in words.
 */
export function NumberCell({
  number,
  state = "pending",
  className,
}: {
  number: ReactNode;
  state?: CellState;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-control border font-data text-sm font-semibold tabular-nums",
        state === "current" && "border-highlight-strong bg-highlight text-on-highlight",
        state === "done" && "border-ink bg-ink text-canvas",
        state === "skipped" && "border-line-strong text-ink-subtle line-through",
        state === "pending" && "border-line text-ink-muted",
        className,
      )}
    >
      {number}
    </span>
  );
}

/** A line in the coach's hand: what the coach wrote, in pen, with the pen beside it. */
export function CoachLine({
  children,
  className,
  as: Tag = "p",
}: {
  children: ReactNode;
  className?: string;
  as?: "p" | "div";
}) {
  return (
    <Tag className={cn("flex gap-2 text-sm [overflow-wrap:anywhere] text-pen", className)}>
      <Pencil className="mt-0.5 shrink-0" aria-hidden />
      <span className="min-w-0 whitespace-pre-wrap">{children}</span>
    </Tag>
  );
}

/** The one row that names a list and says what it costs: "THE PLAN · 6 exercises · 15 sets". */
export function ListLabel({ title, summary }: { title: string; summary?: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-1">
      <p className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">{title}</p>
      {summary && <p className="font-data text-sm text-ink-muted tabular-nums">{summary}</p>}
    </div>
  );
}

/**
 * The opening of a block: the name of the thing, set large, with the one line that qualifies
 * it beneath and whatever stands beside it (a badge, a control) at the trailing edge.
 */
export function BlockHead({
  title,
  subtitle,
  aside,
  size = "lg",
  as: Tag = "h2",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
  size?: "lg" | "2xl";
  as?: "h1" | "h2" | "h3";
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <Tag className={cn("[overflow-wrap:anywhere]", size === "2xl" ? "text-2xl" : "text-lg")}>
          {title}
        </Tag>
        {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {aside && <div className="flex shrink-0 flex-wrap justify-end gap-1">{aside}</div>}
    </div>
  );
}

/**
 * The athlete's own ask, under the line it produced: their words, in pen, so the reason for
 * a change is theirs to recognise rather than the coach's to restate.
 */
export function AskLine({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex min-w-0 gap-2 text-sm text-pen", className)}>
      <ChatText className="mt-0.5 !size-4 shrink-0" aria-hidden />
      <div className="min-w-0 [overflow-wrap:anywhere]">{children}</div>
    </div>
  );
}
