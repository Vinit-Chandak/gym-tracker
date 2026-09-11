import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { Wordmark } from "@/components/shell/wordmark";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageContent } from "@/components/shell/page-content";
import { Section } from "@/components/ui/section";

import { PreviewShell } from "../../preview-shell";

export const metadata: Metadata = { title: "Preview · Headers" };

/**
 * Every shape the masthead takes, one under the other, so the set can be read at a phone's
 * width before it ships: the first screen, a screen with a control beside its title, one
 * that qualifies itself with a range, and the compact bar a page one level down carries.
 *
 * The real `PageHeader` renders each of them; only the surrounding page is made up. They
 * are drawn in flow rather than stuck to the top, which is the one thing a gallery cannot
 * show — four sticky headers would stack on each other.
 */
export default function PreviewHeadersPage() {
  return (
    <PreviewShell tab="/settings">
      <div className="[&_header]:static">
        <PageHeader title={<Wordmark />} meta="Fri 11 Sept" />
        <PageHeader
          title="Gyms"
          action={
            <LinkButton href="/preview/headers" size="sm">
              Add gym
            </LinkButton>
          }
        />
        <PageHeader title="Progress" meta="29 Aug – 11 Sept 2026" />
        <PageHeader title="Programme fit" meta="18 of 21" backHref="/gyms" />
        <PageHeader
          title="Anytime Fitness East"
          backHref="/gyms"
          backLabel="All gyms"
          action={
            <LinkButton href="/preview/headers" variant="secondary" size="sm">
              Edit
            </LinkButton>
          }
        />
      </div>
      <PageContent>
        <Section title="What to look at" description="The title's baseline, and what sits on it.">
          <Card>
            <p className="text-sm text-ink-muted">
              The meta hangs off the far end of the title&apos;s own baseline rather than stacking
              above it in uppercase. One level down the title is centred between the way back and
              whatever the screen offers, so a nested page never reads like a top-level one.
            </p>
          </Card>
        </Section>
      </PageContent>
    </PreviewShell>
  );
}
