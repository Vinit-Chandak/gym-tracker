import type { ReactNode } from "react";

type PhaseNoticeProps = {
  phase: number;
  children: ReactNode;
};

/** Small footnote explaining that a screen is a placeholder until a later phase. */
export function PhaseNotice({ phase, children }: PhaseNoticeProps) {
  return (
    <p className="px-1 text-center text-xs text-ink-subtle">
      <span className="font-medium tracking-wide uppercase">Phase {phase}</span> · {children}
    </p>
  );
}
