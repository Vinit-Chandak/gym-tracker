"use client";

import { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense } from "react";

import Link from "@/components/ui/app-link";
import { Wordmark } from "@/components/shell/wordmark";
import { Glyph, type Destination } from "@/components/ui/glyphs";
import { isNavItemActive, NAV_ITEMS, ORIGIN_PARAM, parseOrigin, type NavOrigin } from "@/lib/nav";

/**
 * One tab (DESIGN.md, Navigation): the destination's glyph over its label, ink and filled where
 * you are. It lives inside the link because `useLinkStatus` only reports from inside the link it
 * belongs to: a tab being navigated to is drawn as chosen at once, its glyph the dial that waits.
 */
function NavContent({
  label,
  glyph,
  active,
}: {
  label: string;
  glyph: Destination;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  return (
    <>
      {pending ? (
        <Glyph name="wait" className="nav-glyph motion-safe:animate-spin" />
      ) : (
        <Glyph name={glyph} filled={active} className="nav-glyph" />
      )}
      <span className="nav-label">{label}</span>
      {pending && <span className="sr-only">Loading {label}…</span>}
    </>
  );
}

function NavItems({ pathname, origin }: { pathname: string; origin: NavOrigin | null }) {
  return (
    <ul className="nav-items">
      {NAV_ITEMS.map(({ href, label, glyph }) => {
        const active = isNavItemActive(pathname, href, origin);
        return (
          <li key={href} className="min-w-0">
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
              className="nav-link"
            >
              <NavContent label={label} glyph={glyph} active={active} />
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
          <p className="type-heading">
            <Wordmark />
          </p>
          <p className="mt-0.5 type-meta-small text-ink-2">Your training, in focus.</p>
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
