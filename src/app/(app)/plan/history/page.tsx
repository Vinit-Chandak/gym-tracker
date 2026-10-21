import type { Metadata, Route } from "next";
import { notFound } from "next/navigation";

import { RequestList } from "@/components/coaching/request-list";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { isActivitySport } from "@/domain/activity";
import { requireUser } from "@/server/auth";
import { holdHyphens } from "@/lib/facts";
import { getRequestProfile } from "@/server/queries/request-profile";

import { loadProgrammeHistory } from "./history-loader";

export const metadata: Metadata = { title: "Past requests and changes" };

/**
 * Everything settled, a line each, one tap from the change it came to.
 *
 * A programme's page keeps only what needs the athlete. What was asked and what came of it, and
 * each change that was approved, applied or declined, lives here instead — in their own words,
 * with the outcome, and nothing the change screen already says. `?sport=` is one programme's, as
 * its page links to it; without it, every sport's.
 */
export default async function ProgrammeHistoryPage(props: PageProps<"/plan/history">) {
  const user = await requireUser();
  const [profile, params] = await Promise.all([
    getRequestProfile(user.id, user.email),
    props.searchParams,
  ]);
  const sport = params.sport;
  if (sport !== undefined && (typeof sport !== "string" || !isActivitySport(sport))) notFound();
  const { requests, changes } = await withUser(
    getDb(),
    user.id,
    (tx) => loadProgrammeHistory(tx, user.id, profile.timeZone, new Date(), sport),
    { readOnly: true },
  );

  return (
    <>
      {/* Back to the programme whose page it was opened from; cold, without one, to Plan. */}
      <PageHeader
        title="Past requests and changes"
        backHref={
          (sport === undefined
            ? "/plan"
            : sport === "strength"
              ? "/plan/strength?view=changes"
              : `/plan/${sport}`) as Route
        }
      />
      <PageContent>
        {requests.length > 0 && (
          <Section title="Your requests">
            <RequestList requests={requests} />
          </Section>
        )}
        {changes.length > 0 && (
          <Section title="Programme changes">
            <List>
              {changes.map((change) => (
                <li key={change.id}>
                  <LinkRow
                    href={`/plan/drafts/${change.id}` as Route}
                    // A programme's name breaks between its words, never at a hyphen.
                    title={holdHyphens(change.title)}
                    subtitle={holdHyphens(change.subtitle)}
                    meta={change.on}
                  />
                </li>
              ))}
            </List>
          </Section>
        )}
        {requests.length === 0 && changes.length === 0 && (
          <Card>
            <p className="text-sm text-ink-muted">Nothing settled yet.</p>
          </Card>
        )}
      </PageContent>
    </>
  );
}
