"use client";

import { LoaderCircle, type LucideIcon } from "lucide-react";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

import Link from "@/components/ui/app-link";
import { isNavItemActive, NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

function NavContent({
  label,
  icon: Icon,
  active,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span
        className={cn(
          "flex h-8 w-11 shrink-0 items-center justify-center rounded-control transition-colors lg:size-8",
          (active || pending) && "bg-accent/10 text-accent",
        )}
      >
        {pending ? (
          <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden />
        ) : (
          <Icon className="size-5" strokeWidth={active ? 2.1 : 1.7} aria-hidden />
        )}
      </span>
      <span className={cn("max-w-full truncate", pending && "text-accent")}>{label}</span>
      {pending && <span className="sr-only">Loading {label}…</span>}
    </>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Primary" className="primary-nav">
      <div className="hidden px-6 pt-7 pb-3 lg:block">
        <p className="text-lg font-semibold tracking-tight">
          Overload<span className="text-accent">.</span>
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">Your training, in focus.</p>
      </div>
      <ul className="nav-items">
        {NAV_ITEMS.map(({ href, label, icon }) => {
          const active = isNavItemActive(pathname, href);
          return (
            <li key={href} className="min-w-0 flex-1 lg:flex-none">
              {/* Partial prefetch warms the loading shell without fetching every tab's data. */}
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "nav-link active:bg-surface-raised",
                  active ? "text-accent lg:bg-accent/5" : "text-ink-muted hover:text-ink",
                )}
              >
                <NavContent label={label} icon={icon} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
