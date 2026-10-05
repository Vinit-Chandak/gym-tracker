"use client";

import { useEffect, useState } from "react";

import { Glyph } from "@/components/ui/glyphs";

/**
 * Said once, after Discard empty session (the action comes back to /today?discarded=1): the
 * session is gone, and with nothing in it nothing was lost. The words arrive a frame after the
 * region does, so a screen reader hears them, and the address drops ?discarded, so a reload
 * does not say it again.
 */
export function DiscardedNote() {
  const [said, setSaid] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSaid(true));
    const url = new URL(window.location.href);
    if (url.searchParams.has("discarded")) {
      url.searchParams.delete("discarded");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    }
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <p role="status" className="today-note">
      {said && (
        <>
          <Glyph name="check" className="mt-px glyph-18" />
          <span className="min-w-0">Empty session discarded.</span>
        </>
      )}
    </p>
  );
}
