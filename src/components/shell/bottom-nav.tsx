"use client";

import { LoaderCircle, type AppIcon } from "@/components/ui/icons";
import { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import Link from "@/components/ui/app-link";
import { Wordmark } from "@/components/shell/wordmark";
import { isNavItemActive, NAV_ITEMS, ORIGIN_PARAM, parseOrigin, type NavOrigin } from "@/lib/nav";
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
  icon: AppIcon;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  return (
    <span className={cn("nav-tab", (active || pending) && "nav-tab-active")}>
      <span className="flex h-8 w-11 shrink-0 items-center justify-center lg:size-8">
        {pending ? (
          <LoaderCircle scale="navigation" className="motion-safe:animate-spin" aria-hidden />
        ) : (
          <Icon scale="navigation" aria-hidden />
        )}
      </span>
      <span className="max-w-full truncate">{label}</span>
      {pending && <span className="sr-only">Loading {label}…</span>}
    </span>
  );
}

function NavItems({ pathname, origin }: { pathname: string; origin: NavOrigin | null }) {
  return (
    <ul className="nav-items">
      {NAV_ITEMS.map(({ href, label, icon }) => {
        const active = isNavItemActive(pathname, href, origin);
        return (
          <li key={href} className="min-w-0 flex-1 lg:flex-none">
            {/*
              Full prefetch: each tab's data is on the phone before it is tapped, so switching
              tabs shows the screen at once instead of the loading screen, which React holds for
              at least 300 ms. Production measured about 2 ms per database round trip, so a tab
              read in the background costs tens of milliseconds (docs/audits/2026-09-25-db-round-trips.md).
              A copy is used for at most `staleTimes.static` (next.config.ts), and any action that
              revalidates discards it. The tab pages only read, so a prefetch never takes the
              athlete lock.
            */}
            <Link
              href={href}
              prefetch
              aria-current={active ? "page" : undefined}
              className={cn("nav-link", active ? "text-accent" : "text-ink-muted hover:text-ink")}
            >
              <NavContent label={label} icon={icon} active={active} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The tabs, with a record's origin read from the link that opened it (NAV-03). */
function OriginNavItems({ pathname }: { pathname: string }) {
  const origin = parseOrigin(useSearchParams().get(ORIGIN_PARAM) ?? undefined);
  return <NavItems pathname={pathname} origin={origin} />;
}

export function BottomNav({ pathname: standingIn }: { pathname?: string } = {}) {
  // The preview screen says which tab it is standing in for; every real screen takes its own.
  const current = usePathname();
  const pathname = standingIn ?? current;
  return (
    <div className="viewport-chrome">
      <nav aria-label="Primary" className="primary-nav">
        <div className="hidden px-6 pt-7 pb-3 lg:block">
          <p className="text-lg font-medium">
            <Wordmark />
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">Your training, in focus.</p>
        </div>
        {/* A request always has its search parameters, so the app never shows the fallback:
            only a prerendered screen, which has none to read, stands on its path alone. */}
        <Suspense fallback={<NavItems pathname={pathname} origin={null} />}>
          <OriginNavItems pathname={pathname} />
        </Suspense>
      </nav>
    </div>
  );
}
