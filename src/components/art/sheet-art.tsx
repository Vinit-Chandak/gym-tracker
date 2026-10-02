import { cn } from "@/lib/utils";

/**
 * The app's own art: drawings in the sheet's three inks. Each is an inline SVG that takes
 * its colours from the tokens (ink from `currentColor`, the highlighter and the pen from the
 * palette), so one drawing is right on both sheets. They are decoration, hidden from the
 * screen reader; the words beside them say what the screen is for.
 */

type ArtProps = { className?: string; title?: string };

/**
 * A sheet with the plan written on it: ruled lines, one of them under the highlighter, and
 * the coach's tick in pen. The welcome screen and the empty programme use it.
 */
export function PlanSheetArt({ className, title }: ArtProps) {
  return (
    <svg
      viewBox="0 0 160 120"
      className={cn("block h-auto w-40 text-ink", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title && <title>{title}</title>}
      {/* The sheet, slightly turned, sitting on the grid. */}
      <g transform="rotate(-3 80 60)">
        <rect
          x="26"
          y="10"
          width="108"
          height="100"
          rx="3"
          fill="var(--ov-surface)"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        {/* The highlighter, laid before the ink so the ink reads over it. */}
        <rect x="38" y="47" width="72" height="11" rx="2" fill="var(--ov-highlight)" />
        {/* Ruled lines: the plan's rows. */}
        <path d="M38 30h68M38 74h70M38 96h46" stroke="currentColor" strokeWidth="1.5" />
        {/* The highlighted row is written in ink on the highlighter, on either sheet. */}
        <path d="M38 52h54" stroke="var(--ov-on-highlight)" strokeWidth="1.5" />
        {/* The row numbers in the margin. */}
        <path
          d="M31 28v4M31 50v4M31 72v4M31 94v4"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.5"
        />
        {/* The coach's tick on the highlighted row. */}
        <path d="M114 55l5 5 10-13" stroke="var(--ov-pen)" strokeWidth="2.5" />
        {/* A pencil line still to be confirmed: dotted. */}
        <path d="M38 96h46" stroke="var(--ov-ink-ghost)" strokeWidth="1.5" strokeDasharray="2 3" />
      </g>
    </svg>
  );
}

/**
 * A loaded bar drawn in pen on the grid: plates as nested rules, the sleeve as a line. For
 * the lifting empty states and the sign-in sheet.
 */
export function BarbellArt({ className, title }: ArtProps) {
  return (
    <svg
      viewBox="0 0 200 80"
      className={cn("block h-auto w-48 text-ink", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title && <title>{title}</title>}
      {/* The bar. */}
      <path d="M6 40h188" stroke="currentColor" strokeWidth="2.5" />
      {/* Collars. */}
      <path d="M36 33v14M164 33v14" stroke="currentColor" strokeWidth="3" />
      {/* Plates: the outer pair under the highlighter, the inner in ink. */}
      <rect
        x="40"
        y="14"
        width="12"
        height="52"
        rx="2"
        fill="var(--ov-highlight)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="148"
        y="14"
        width="12"
        height="52"
        rx="2"
        fill="var(--ov-highlight)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="54"
        y="22"
        width="9"
        height="36"
        rx="2"
        fill="var(--ov-surface)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="137"
        y="22"
        width="9"
        height="36"
        rx="2"
        fill="var(--ov-surface)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="65"
        y="28"
        width="6"
        height="24"
        rx="1.5"
        fill="var(--ov-surface)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <rect
        x="129"
        y="28"
        width="6"
        height="24"
        rx="1.5"
        fill="var(--ov-surface)"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      {/* The coach's note: a short pen line under the bar. */}
      <path d="M78 62c10-6 20 6 30 0s20-6 14 0" stroke="var(--ov-pen)" strokeWidth="2" />
    </svg>
  );
}

/**
 * The cycle as a strip of cells with today under the highlighter and the days before it
 * inked in: the plan's shape, in one glance. Onboarding's programme step and the empty
 * progress sheet use it.
 */
export function CycleArt({ className, title }: ArtProps) {
  const cells = [0, 1, 2, 3, 4, 5, 6];
  return (
    <svg
      viewBox="0 0 200 64"
      className={cn("block h-auto w-48 text-ink", className)}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      fill="none"
    >
      {title && <title>{title}</title>}
      {cells.map((i) => {
        const x = 4 + i * 28;
        const done = i < 3;
        const today = i === 3;
        return (
          <g key={i}>
            <rect
              x={x}
              y="8"
              width="24"
              height="32"
              rx="3"
              fill={today ? "var(--ov-highlight)" : done ? "currentColor" : "var(--ov-surface)"}
              stroke="currentColor"
              strokeWidth="1.5"
              opacity={!today && !done ? 0.55 : 1}
            />
            {done && (
              <path
                d={`M${x + 7} 24l4 4 7-9`}
                stroke="var(--ov-canvas)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}
            {today && (
              <path
                d={`M${x + 12} 16v16`}
                stroke="var(--ov-on-highlight)"
                strokeWidth="2"
                strokeLinecap="round"
              />
            )}
          </g>
        );
      })}
      {/* The coach's pen marking the week. */}
      <path
        d="M8 54h120"
        stroke="var(--ov-pen)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="1 5"
      />
    </svg>
  );
}
