import type { Metadata, Route } from "next";

import { RequestList } from "@/components/coaching/request-list";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { loadProgrammeHistory } from "./history-loader";

export const metadata: Metadata = { title: "Past requests and changes" };

/**
 * Everything settled, a line each, one tap from the change it came to.
 *
 * The Changes tab keeps only what needs the athlete. What was asked and what came of it, and
 * each change that was approved, applied or declined, lives here instead — in their own words,
 * with the outcome, and nothing the change screen already says.
 */
export default async function ProgrammeHistoryPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const { requests, changes } = await withUser(
    getDb(),
    user.id,
    (tx) => loadProgrammeHistory(tx, user.id, profile.timeZone),
    { readOnly: true },
  );

  return (
    <>
      <PageHeader title="Past requests and changes" backHref="/profile/programme?view=changes" />
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
                    href={`/profile/programme/drafts/${change.id}` as Route}
                    title={change.title}
                    subtitle={change.subtitle}
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
