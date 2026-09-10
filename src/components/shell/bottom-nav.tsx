"use client";

import { LoaderCircle, type LucideIcon } from "lucide-react";
import { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

import Link from "@/components/ui/app-link";
import { isNavItemActive, NAV_ITEMS } from "@/lib/nav";
import { cn } from "@/lib/utils";

/**
 * One tab's contents, and the pill that says it is selected.
 *
 * The fill goes around the icon *and* its label, never the icon alone: the caption names
 * the icon above it, so highlighting one without the other reads as a stray box. It has to
 * live in here rather than on the `<Link>` because `useLinkStatus` only reports from inside
 * the link it belongs to, and a tab being navigated to is filled in the same way.
 */
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
    <span className={cn("nav-tab", (active || pending) && "nav-tab-active")}>
      <span className="flex h-8 w-11 shrink-0 items-center justify-center lg:size-8">
        {pending ? (
          <LoaderCircle className="size-5 motion-safe:animate-spin" aria-hidden />
        ) : (
          <Icon className="size-5" strokeWidth={active ? 2.1 : 1.7} aria-hidden />
        )}
      </span>
      <span className="max-w-full truncate">{label}</span>
      {pending && <span className="sr-only">Loading {label}…</span>}
    </span>
  );
}

export function BottomNav({ pathname: standingIn }: { pathname?: string } = {}) {
  // The preview screen says which tab it is standing in for; every real screen takes its own.
  const current = usePathname();
  const pathname = standingIn ?? current;
  return (
    <nav aria-label="Primary" className="primary-nav">
      <div className="hidden px-6 pt-7 pb-3 lg:block">
        <p className="text-lg font-medium">
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
                className={cn("nav-link", active ? "text-accent" : "text-ink-muted hover:text-ink")}
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
