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
  const destination = previous
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
