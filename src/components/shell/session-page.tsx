import type { Route } from "next";
import type { ReactNode } from "react";

import Link from "@/components/ui/app-link";
import { FitTitle } from "@/components/ui/fit-title";
import { Glyph } from "@/components/ui/glyphs";

import { PageHeader } from "./page-header";
import { RestPill } from "./rest-timer";

/**
 * A page of the session's own (DESIGN.md, The session; boards Check-in, Add exercise, Add
 * fallback, Finish, Summary): no tab bar, since the session is a layer over the tabs from the
 * check-in to the summary; a header whose way back names the session, the rest pill beside it
 * while a rest runs, then the page's title and the page. Logging a run, a ride or a swim is the
 * same kind of layer (boards Log a run, a ride, a swim), its way back naming where it was opened.
 *
 * A page that ends something (Finish, the summary) closes rather than goes back: its header is
 * a close at the end, and the session's name is its title.
 */
export function SessionPage({
  title,
  meta,
  back,
  close,
  rest,
  children,
}: {
  title: string;
  meta?: ReactNode;
  /** Where Back goes without a page before it, and its name there (the section's otherwise). */
  back?: { href: Route; label?: string };
  /** Where Close goes, for a page that ends something. */
  close?: { href: Route; label: string };
  /** The session whose rest runs on, when the account keeps a rest timer. */
  rest?: string | null;
  children: ReactNode;
}) {
  const pill = rest ? <RestPill sessionId={rest} /> : undefined;
  return (
    <div className="session-page">
      {back ? (
        <PageHeader
          title={title}
          meta={meta}
          backHref={back.href}
          backLabel={back.label}
          action={pill}
        />
      ) : (
        <header className="page-header page-width pt-safe">
          <div className="page-header-bar">
            <span className="flex-1" />
            {pill}
            <Link
              href={close?.href ?? "/today"}
              aria-label={close?.label ?? "Close"}
              className="icon-button"
            >
              <Glyph name="close" className="glyph-22" />
            </Link>
          </div>
          <FitTitle as="h1" sizes={{ base: 34, narrow: 30 }} className="mt-0.5">
            {title}
          </FitTitle>
          {meta && <p className="meta-line mt-1 [overflow-wrap:anywhere]">{meta}</p>}
        </header>
      )}
      <div className="session-page-body page-width">{children}</div>
    </div>
  );
}
