"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { sectionLabel } from "@/lib/nav";
import {
  previousPageFrom,
  subscribeNavigation,
  trackNavigationHistory,
} from "@/lib/navigation-history";

export function NavigationHistory() {
  useEffect(() => trackNavigationHistory(), []);
  return null;
}

export function BackLink({ fallback, label }: { fallback: string; label?: string }) {
  const router = useRouter();
  const previous = useSyncExternalStore(
    subscribeNavigation,
    () => previousPageFrom(window.location.pathname),
    () => null,
  );
  // Back to the page it names, the given name holds (a session's own pages name the session);
  // anywhere else, the section it returns to names it.
  const destination =
    previous && previous !== fallback
      ? (sectionLabel(previous) ?? "Back")
      : (label ?? sectionLabel(fallback) ?? "Back");
  return (
    <Link
      href={(previous ?? fallback) as Route}
      aria-label={destination === "Back" ? "Back" : `Back to ${destination}`}
      onNavigate={(event) => {
        if (previous) {
          event.preventDefault();
          router.back();
        }
      }}
      className="back-link"
    >
      <Glyph name="chevronLeft" className="glyph-22" />
      <span className="back-link-label">{destination}</span>
    </Link>
  );
}
