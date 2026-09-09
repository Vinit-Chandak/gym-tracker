"use client";

import Link from "@/components/ui/app-link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/90 backdrop-blur-md"
    >
      <ul className="mx-auto flex max-w-lg items-stretch">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              {/*
               * The safe-area padding belongs on the link, not the bar: on a phone with a
               * home indicator it is 34px of the bar you can see and press but that no
               * link owns, so a thumb aimed low does nothing.
               */}
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-nav-safe flex-col items-center justify-center gap-1 pb-safe text-[11px] font-medium transition-colors select-none",
                  // Acknowledge the press straight away: a server round trip can outlast
                  // the moment where a tap still feels like it registered.
                  "active:bg-surface-raised",
                  active ? "text-accent" : "text-ink-muted active:text-ink",
                )}
              >
                <Icon className="size-6" strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
