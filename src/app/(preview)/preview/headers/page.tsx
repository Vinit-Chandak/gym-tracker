import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Wordmark } from "@/components/shell/wordmark";
import { LinkButton } from "@/components/ui/button";
import { Section } from "@/components/ui/section";

import { PreviewShell } from "../../preview-shell";

export const metadata: Metadata = { title: "Preview · Chrome" };

/**
 * The sheet's chrome, one piece under the other, so the set can be read at a phone's width
 * in both palettes before it ships: the wordmark at the sizes it is set, every shape the
 * masthead takes — the first screen, a screen with a control beside its title, one that
 * qualifies itself with a range, and the compact bar a page one level down carries — the
 * four pens an action can be drawn in, and the tab bar the shell stands beneath it all.
 *
 * The real components render each of them; only the surrounding page is made up. The
 * headers are drawn in flow rather than stuck to the top, which is the one thing a gallery
 * cannot show — five sticky headers would stack on each other.
 */
export default function PreviewHeadersPage() {
  return (
    <PreviewShell tab="/profile">
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
        <Section
          title="Wordmark"
          description="The name with a stroke of highlighter under it, at the sizes it is set: the auth sheet, a block title, the masthead."
        >
          <div className="flex box flex-wrap items-baseline gap-x-8 gap-y-4 py-4">
            <p className="text-3xl leading-none">
              <Wordmark />
            </p>
            <p className="text-2xl">
              <Wordmark />
            </p>
            <p className="text-xl">
              <Wordmark />
            </p>
          </div>
        </Section>
        <Section
          title="Four pens"
          description="The highlighter for the one primary action on a screen, and the ruled, pen and red-pen alternatives beside it."
        >
          <div className="action-row box py-4">
            <LinkButton href="/preview/headers">Primary</LinkButton>
            <LinkButton href="/preview/headers" variant="secondary">
              Secondary
            </LinkButton>
            <LinkButton href="/preview/headers" variant="ghost">
              Ghost
            </LinkButton>
            <LinkButton href="/preview/headers" variant="danger">
              Danger
            </LinkButton>
          </div>
        </Section>
      </PageContent>
    </PreviewShell>
  );
}
