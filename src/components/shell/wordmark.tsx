import { cn } from "@/lib/utils";

/**
 * The app's name, and the only mark it carries. On the screens that are about the app itself
 * (signing in, the first run) the word has a stroke of highlighter laid under it, the way
 * today's cell is marked on the sheet. Inside the app it is set in ink alone: there the
 * highlighter belongs to today, the current step and the one primary action, and a brand mark
 * in the top line would be a fourth. Every place that says the name renders this, so no two
 * can drift apart.
 */
export function Wordmark({ className, mark = false }: { className?: string; mark?: boolean }) {
  return (
    <span className={cn("relative inline-block font-bold tracking-[-0.02em]", className)}>
      {mark && (
        <span
          aria-hidden
          className="absolute inset-x-[-0.06em] bottom-[-0.12em] h-[0.3em] rounded-[0.06em] bg-highlight"
        />
      )}
      <span className="relative">Overload</span>
    </span>
  );
}
