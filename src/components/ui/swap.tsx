"use client";

import { useEffect, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A word or a figure swapped in place (DESIGN.md, Do's): the old one leaves in 80 ms, then the
 * new one arrives over 120 ms, never both at once. The leaving copy is inert and hidden from
 * screen readers, so only what shows is read. With reduced motion the old one goes at once and
 * the new one fades in.
 */
export function Swap({
  id,
  children,
  className,
}: {
  /** What the content is of; a new id swaps it, a change of the same id updates it in place. */
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const [shown, setShown] = useState({ id, node: children });
  const [leaving, setLeaving] = useState<{ id: string; node: ReactNode } | null>(null);
  if (shown.id !== id) {
    setLeaving(shown);
    setShown({ id, node: children });
  } else if (shown.node !== children) {
    setShown({ id, node: children });
  }

  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => setLeaving(null), 220);
    return () => clearTimeout(timer);
  }, [leaving]);

  return (
    <span className={cn("swap", className)}>
      {leaving && (
        <span key={`out-${leaving.id}`} className="swap-leaving" aria-hidden inert>
          {leaving.node}
        </span>
      )}
      <span key={`in-${id}`} className={leaving ? "swap-entering" : undefined}>
        {children}
      </span>
    </span>
  );
}
