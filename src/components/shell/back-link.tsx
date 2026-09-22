"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "@/components/ui/app-link";
import { ChevronLeft } from "@/components/ui/icons";
import { sectionLabel } from "@/lib/nav";
import {
  previousAppPage,
  subscribeNavigation,
  trackNavigationHistory,
} from "@/lib/navigation-history";

export function NavigationHistory() {
  useEffect(() => trackNavigationHistory(), []);
  return null;
}

export function BackLink({ fallback, label }: { fallback: string; label?: string }) {
  const router = useRouter();
  const previous = useSyncExternalStore(subscribeNavigation, previousAppPage, () => null);
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
      className="-ml-1.5 flex min-w-0 flex-1 items-center gap-0.5 self-stretch rounded-control px-1.5 text-accent transition-colors duration-[var(--ov-duration-feedback)] ease-[var(--ov-ease-standard)] active:bg-surface-raised"
    >
      <ChevronLeft className="shrink-0" aria-hidden />
      <span className="truncate text-sm">{destination}</span>
    </Link>
  );
}
