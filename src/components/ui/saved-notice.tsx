"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { Glyph } from "./glyphs";

/**
 * A record kept (DESIGN.md, Inputs and choices; 21 October 2026): the success tint with its
 * check, what was kept in a few words ("Run saved as intervals"), and Undo where the save can be
 * undone. It is a status, read once by a screen reader, and it stands for six seconds, longer
 * while a finger or the focus is on it, so Undo is never pulled away mid-reach.
 */
export function SavedNotice({
  children,
  action,
  seconds = 6,
}: {
  children: ReactNode;
  /** Undo, or another way back, as a button or a form; it keeps the bar while it is used. */
  action?: ReactNode;
  seconds?: number;
}) {
  const [shown, setShown] = useState(true);
  const held = useRef(false);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!held.current) setShown(false);
    }, seconds * 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);
  if (!shown) return null;
  return (
    <div
      role="status"
      className="saved-notice"
      onFocus={() => (held.current = true)}
      onBlur={() => (held.current = false)}
      onPointerEnter={() => (held.current = true)}
      onPointerLeave={() => (held.current = false)}
    >
      <Glyph name="check" className="glyph-20" />
      <span className="min-w-0 flex-1 [overflow-wrap:break-word]">{children}</span>
      {action}
    </div>
  );
}
