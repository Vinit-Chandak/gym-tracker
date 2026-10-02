import { cn } from "@/lib/utils";

/**
 * The app's name, and the only mark it carries: the word with a stroke of highlighter laid
 * under it, the way today's cell is marked on the sheet. The stroke sits below the baseline
 * rather than over the letters, so the word reads in ink on either sheet. Every place that
 * says the name renders this, so no two can drift apart.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-block font-bold tracking-[-0.02em]", className)}>
      <span
        aria-hidden
        className="absolute inset-x-[-0.06em] bottom-[-0.12em] h-[0.3em] rounded-[0.06em] bg-highlight"
      />
      <span className="relative">Overload</span>
    </span>
  );
}
