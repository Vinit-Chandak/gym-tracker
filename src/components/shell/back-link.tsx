"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "@/components/ui/app-link";
import { ChevronLeft } from "@/components/ui/icons";
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
      className="-ml-1.5 flex min-w-0 flex-1 basis-[5.5rem] pressable items-center gap-0.5 self-stretch rounded-chip px-1.5 text-accent active:bg-surface-raised"
    >
      <ChevronLeft className="shrink-0" aria-hidden />
      <span className="text-[0.9375rem] font-semibold [overflow-wrap:anywhere]">{destination}</span>
    </Link>
  );
}
