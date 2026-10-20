import type { Route } from "next";

import { Art } from "@/components/art/art";
import { enduranceName } from "@/components/activities/endurance-line";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Glyph } from "@/components/ui/glyphs";
import { NavRow } from "@/components/ui/nav-row";
import { ACTIVITY_SPORT_LABELS } from "@/domain/activity";
import { byDay, weekStartOf, type WeekSession, type WeekStatus } from "@/domain/plan-week";
import { addDays } from "@/domain/program-calendar";
import { holdHyphens, joinFacts } from "@/lib/facts";
import { formatDateRange, formatIsoDate } from "@/lib/format";
import type { NewProgrammeDraft, ProgrammeCard } from "@/server/repositories/sport-programmes";

/** What a programme card needs of its programme: which it is, its sport and its name. */
export type PlanCard = Omit<ProgrammeCard, "programme"> & {
  programme: Pick<ProgrammeCard["programme"], "id" | "sport" | "name">;
};

const MARK = { strength: "strength", running: "run", cycling: "ride", swimming: "swim" } as const;

/** Where a session stands, in the app's three words, and Today for one that is Today's. */
const STATUS: Record<Exclude<WeekStatus, "planned">, string> = {
  done: "Done",
  skipped: "Skipped",
  missed: "Missed",
  today: "Today",
};

/**
 * Where a row of the week leads. Today's session is Today's to start or log, so the row only
 * points there; a run, ride or swim opens its own page, to move or skip it; a lifting day, its
 * programme.
 */
function sessionHref(session: WeekSession): Route {
  if (session.status === "today") return "/today";
  return session.occurrenceId
    ? (`/training/programme/occurrences/${session.occurrenceId}` as Route)
    : ("/plan/strength" as Route);
}

function Week({
  sessions,
  monday,
  today,
}: {
  sessions: readonly WeekSession[];
  monday: string;
  today: string;
}) {
  const days = byDay(sessions);
  const sunday = addDays(monday, 6);
  const thisWeek = monday === weekStartOf(today);
  return (
    <section aria-labelledby="plan-week" className="plan-week">
      <div className="plan-week-head">
        <div className="min-w-0">
          <h2 id="plan-week" className="caption-head">
            {thisWeek ? "This week" : "Week"}
          </h2>
          <p className="type-meta-small text-ink-2 tabular-nums">
            {formatDateRange(monday, sunday)}
          </p>
        </div>
        {/* Another week is a step away; the tab itself comes back to this one. */}
        <nav aria-label="Weeks" className="plan-week-steps">
          <Link
            href={`/plan?week=${addDays(monday, -7)}` as Route}
            className="icon-button"
            aria-label="Previous week"
          >
            <Glyph name="chevronLeft" className="glyph-20" />
          </Link>
          <Link
            href={`/plan?week=${addDays(monday, 7)}` as Route}
            className="icon-button"
            aria-label="Next week"
          >
            <Glyph name="chevronRight" className="glyph-20" />
          </Link>
        </nav>
      </div>
      {days.length === 0 ? (
        <p className="type-meta text-ink-2">Nothing planned.</p>
      ) : (
        <ul className="plan-days">
          {days.map(({ date, sessions: onDay }) => (
            <li key={date} className="plan-day">
              <p className="plan-day-name type-caption tabular-nums">
                {formatIsoDate(date, today.slice(0, 4))}
              </p>
              <ul className="ruled-list">
                {onDay.map((session) => (
                  <NavRow
                    key={session.key}
                    href={sessionHref(session)}
                    lead={
                      <Art
                        kind="mark"
                        sport={MARK[session.sport]}
                        size={20}
                        state={
                          session.status === "done"
                            ? "done"
                            : session.status === "skipped"
                              ? "skipped"
                              : "todo"
                        }
                      />
                    }
                    label={holdHyphens(session.title ?? enduranceName(session.sport))}
                    value={session.status === "planned" ? undefined : STATUS[session.status]}
                  />
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A programme as Plan lists it: its sport, its name, how it runs and where it has got to. */
function Programme({ card }: { card: PlanCard }) {
  const { programme, waiting, pattern, position, finished } = card;
  const draft = waiting[0];
  return (
    <li className="min-w-0">
      <Link href={`/plan/${programme.sport}` as Route} className="plan-programme box panel-padding">
        <span className="plan-programme-sport type-meta-small text-ink-2">
          <Art kind="mark" sport={MARK[programme.sport]} size={20} />
          {ACTIVITY_SPORT_LABELS[programme.sport]}
        </span>
        <span className="plan-programme-name">{holdHyphens(programme.name)}</span>
        <span className="type-meta text-ink-2 tabular-nums">
          {joinFacts([pattern, finished ? "Complete" : position])}
        </span>
        {draft && (
          <span className="plan-programme-waiting type-meta-small">
            {draft.status === "editing" ? "Draft in progress" : "Changes to review"}
          </span>
        )}
      </Link>
    </li>
  );
}

/**
 * A first programme waiting to be started (ADR 0059), as a programme's card reads: its sport and
 * name, and what it waits for. A ready one opens its review; one being built, its editor.
 */
function Waiting({
  draft,
}: {
  draft: Pick<NewProgrammeDraft, "id" | "sport" | "status" | "name">;
}) {
  const href =
    draft.status === "ready"
      ? `/profile/programme/drafts/${draft.id}`
      : draft.sport === "strength"
        ? `/profile/programme/manual?draft=${draft.id}`
        : `/plan/${draft.sport}/edit?draft=${draft.id}`;
  return (
    <li className="min-w-0">
      <Link href={href as Route} className="plan-programme box panel-padding">
        <span className="plan-programme-sport type-meta-small text-ink-2">
          <Art kind="mark" sport={MARK[draft.sport]} size={20} />
          {ACTIVITY_SPORT_LABELS[draft.sport]}
        </span>
        <span className="plan-programme-name">
          {holdHyphens(
            draft.name || `New ${ACTIVITY_SPORT_LABELS[draft.sport].toLowerCase()} programme`,
          )}
        </span>
        <span className="plan-programme-waiting type-meta-small">
          {draft.status === "ready" ? "New programme to review" : "Draft in progress"}
        </span>
      </Link>
    </li>
  );
}

/**
 * Plan (ADR 0058): what comes next and how it is built. This week's sessions for every sport,
 * by date, then one card per programme. Starting, logging and skipping today's sessions are
 * Today's; what has been done is Progress's.
 */
export function PlanView({
  cards,
  drafts = [],
  sessions,
  monday,
  today,
}: {
  cards: readonly PlanCard[];
  /** First programmes drafted and not yet started, which no card above can stand for. */
  drafts?: readonly Pick<NewProgrammeDraft, "id" | "sport" | "status" | "name">[];
  sessions: readonly WeekSession[];
  monday: string;
  today: string;
}) {
  const empty = cards.length === 0 && drafts.length === 0;
  return (
    <div className="page-wide">
      <PageHeader
        title="Plan"
        // With no programme, starting one is the page itself; otherwise it waits up here.
        action={
          empty ? undefined : (
            <LinkButton href="/plan/new" variant="tonal" size="sm">
              New programme
            </LinkButton>
          )
        }
      />
      <div className="page-width space-y-[var(--section-gap)] pb-8">
        {empty && (
          <Card>
            <h2 className="text-lg font-medium">No programmes yet</h2>
            <LinkButton href="/plan/new">New programme</LinkButton>
          </Card>
        )}
        {(!empty || sessions.length > 0) && (
          <Week sessions={sessions} monday={monday} today={today} />
        )}
        {!empty && (
          <section aria-labelledby="plan-programmes" className="space-y-3">
            <h2 id="plan-programmes" className="caption-head">
              Programmes
            </h2>
            <ul className="programme-card-grid">
              {cards.map((card) => (
                <Programme key={card.programme.id} card={card} />
              ))}
              {drafts.map((draft) => (
                <Waiting key={draft.id} draft={draft} />
              ))}
            </ul>
          </section>
        )}
        <ul>
          <NavRow href="/plan/past" glyph="history" label="Past programmes" />
        </ul>
      </div>
    </div>
  );
}
