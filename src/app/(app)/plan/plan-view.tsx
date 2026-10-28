import type { Route } from "next";

import { SportSign } from "@/components/art/sign";
import {
  enduranceName,
  enduranceTarget,
  plannedName,
} from "@/components/activities/endurance-line";
import { alreadySays } from "@/components/activities/prescription-lines";
import { PageHeader } from "@/components/shell/page-header";
import { weekRange } from "@/components/shell/root-dates";
import Link from "@/components/ui/app-link";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Glyph } from "@/components/ui/glyphs";
import { NavRow } from "@/components/ui/nav-row";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { byDay, weekStartOf, type WeekSession, type WeekStatus } from "@/domain/plan-week";
import { addDays, daysBetween } from "@/domain/program-calendar";
import { DEFAULT_SPORT_UNITS, type SportUnits } from "@/lib/distance-units";
import { holdHyphens, joinFacts } from "@/lib/facts";
import { formatIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  NewProgrammeDraft,
  NewProgrammeRequest,
  NewProgrammeRequestStatus,
  ProgrammeCard,
} from "@/server/repositories/sport-programmes";

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
 * points there; a run, ride or swim opens its own page, to move or skip it; a lifting day, the
 * day's page.
 */
function sessionHref(session: WeekSession): Route {
  if (session.status === "today") return "/today";
  if (session.occurrenceId) return `/plan/sessions/${session.occurrenceId}` as Route;
  return (session.dayId ? `/plan/strength/days/${session.dayId}` : "/plan/strength") as Route;
}

/**
 * A row's name and the figure under it. A run, ride or swim is named as Today names it (ADR
 * 0059: its name, else its kind of run, else its sport) with what it asks for under it, so two
 * runs on one day never read the same; the figure is left out where the name already says it.
 */
function sessionWords(
  session: WeekSession,
  units: SportUnits,
): { name: string; figure: string | null } {
  if (session.sport === "strength" || !session.prescription)
    return { name: session.title ?? enduranceName(session.sport), figure: null };
  const name = plannedName(session.prescription, session.sport, units);
  const target = enduranceTarget(session.prescription, units);
  const figure = target ? `${target.figure}\u00a0${target.unit}` : null;
  return { name, figure: figure && !alreadySays(name, figure) ? figure : null };
}

/** A day's entry in the week, which a link to that day leads to. */
const dayAnchor = (date: string) => `plan-day-${date}`;

/**
 * A session as the week lists it (owner, 28 October 2026): its sport's sign, its name, its figure
 * where the name does not say it, and where it stands once that is news (Done, Skipped, Missed).
 * The whole row opens it; nothing on it is said twice.
 */
function SessionRow({ session, units }: { session: WeekSession; units: SportUnits }) {
  const { name, figure } = sessionWords(session, units);
  const status = session.status === "planned" || session.status === "today" ? null : session.status;
  return (
    <li>
      <Link href={sessionHref(session)} className="plan-session">
        <SportSign sport={MARK[session.sport]} />
        <span className="plan-session-text">
          <span className="plan-session-name">{holdHyphens(name)}</span>
          {figure && <span className="plan-session-figure">{figure}</span>}
        </span>
        {status && <span className="plan-session-status">{STATUS[status]}</span>}
      </Link>
    </li>
  );
}

/**
 * A day of the week as one row of the week's card: its date in its own column, the weekday over
 * the day of the month (the week's calendar, said once), today's day the one dark disc, then its
 * sessions. The date is read as one heading ("Tue 20 Oct, today").
 */
function Day({
  date,
  sessions,
  today,
  units,
}: {
  date: string;
  sessions: readonly WeekSession[];
  today: string;
  units: SportUnits;
}) {
  const isToday = date === today;
  return (
    <li id={dayAnchor(date)} className="plan-day">
      <p aria-hidden className="plan-date">
        <span className="plan-date-weekday">{formatIsoDate(date).split("\u00a0")[0]}</span>
        <span className={cn("plan-date-day", isToday && "plan-date-today")}>
          {Number(date.slice(8, 10))}
        </span>
      </p>
      <div className="min-w-0">
        <h3 className="sr-only">
          {formatIsoDate(date, today.slice(0, 4))}
          {isToday && ", today"}
        </h3>
        <ul className="plan-sessions">
          {sessions.map((session) => (
            <SessionRow key={session.key} session={session} units={units} />
          ))}
        </ul>
      </div>
    </li>
  );
}

/** What became of the days gone by, in the app's words: "2 done", "1 done · 1 skipped". */
function outcome(sessions: readonly WeekSession[]): string {
  return joinFacts(
    (["done", "skipped", "missed"] as const).map((status) => {
      const count = sessions.filter((session) => session.status === status).length;
      return count > 0 && `${count}\u00a0${STATUS[status].toLowerCase()}`;
    }),
  );
}

/** "Mon 19", the weekday and its day of the month: a day inside a week the title dates. */
const weekDay = (date: string) =>
  `${formatIsoDate(date).split("\u00a0")[0]}\u00a0${Number(date.slice(8, 10))}`;

/**
 * The week's headline (DESIGN.md, Tab roots): "This week", or where another week is, how far
 * from it ("Next week", "3 weeks ago"), since its dates are said under it.
 */
function weekTitle(monday: string, today: string): string {
  const weeks = Math.round(daysBetween(weekStartOf(today), monday) / 7);
  if (weeks === 0) return "This week";
  if (weeks === 1) return "Next week";
  if (weeks === -1) return "Last week";
  return weeks > 1 ? `In ${weeks} weeks` : `${-weeks} weeks ago`;
}

/**
 * The weeks either side, as the header's one control (owner, 28 October 2026): two round buttons
 * of one size at the end of the title's line, each named by where it stands from today ("Last
 * week", "Next week"); the tab itself comes back to this one.
 */
function WeekSteps({ monday, today }: { monday: string; today: string }) {
  const before = addDays(monday, -7);
  const after = addDays(monday, 7);
  return (
    <nav aria-label="Weeks" className="plan-steps">
      <Link
        href={`/plan?week=${before}` as Route}
        aria-label={weekTitle(before, today)}
        className="round-button"
      >
        <Glyph name="chevronLeft" className="glyph-22" />
      </Link>
      <Link
        href={`/plan?week=${after}` as Route}
        aria-label={weekTitle(after, today)}
        className="round-button"
      >
        <Glyph name="chevronRight" className="glyph-22" />
      </Link>
    </nav>
  );
}

/**
 * The week as one card (DESIGN.md, Layout: Plan; owner, 28 October 2026): its days in order, each
 * with its date in its own column and its sessions beside it, so the list is the calendar and no
 * strip repeats it. In the week that holds today, the days gone by fold into one closed row that
 * says what became of them; a week gone by or to come shows its days whole. Days with nothing
 * planned are left out.
 */
function Week({
  sessions,
  today,
  units,
  label,
}: {
  sessions: readonly WeekSession[];
  today: string;
  units: SportUnits;
  /** The headline the week stands under, which names it for a screen reader. */
  label: string;
}) {
  const days = byDay(sessions);
  const ahead = days.filter(({ date }) => date >= today);
  // Only a week still under way folds its past: one gone by, opened on purpose, is read whole.
  const gone = ahead.length > 0 ? days.filter(({ date }) => date < today) : [];
  const shown = ahead.length > 0 ? ahead : days;
  return (
    <section aria-label={label} className="plan-week box">
      {/* An empty week is one quiet line where its rows would be (DESIGN.md, Need-to-Know). */}
      {days.length === 0 && <p className="plan-week-empty">Nothing planned this week</p>}
      {gone.length > 0 && (
        <Disclosure
          summary={
            gone.length === 1
              ? weekDay(gone[0]!.date)
              : `${weekDay(gone[0]!.date)} – ${weekDay(gone.at(-1)!.date)}`
          }
          meta={outcome(gone.flatMap(({ sessions: onDay }) => onDay))}
          variant="inline"
          className="plan-earlier"
        >
          <ul className="plan-days">
            {gone.map(({ date, sessions: onDay }) => (
              <Day key={date} date={date} sessions={onDay} today={today} units={units} />
            ))}
          </ul>
        </Disclosure>
      )}
      {shown.length > 0 && (
        <ul className="plan-days">
          {shown.map(({ date, sessions: onDay }) => (
            <Day key={date} date={date} sessions={onDay} today={today} units={units} />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * A programme as Plan lists it (owner, 28 October 2026): its name, how it runs and where it has
 * got to, what waits on it (a draft to review) in ink as the news it is, and its sport's sign at
 * the row's end. Never its next session, which is Today's, and never a bar, which is its page's.
 */
function Programme({ card }: { card: PlanCard }) {
  const { programme, waiting, pattern, position, finished } = card;
  const draft = waiting[0];
  return (
    <ProgrammeRow
      href={`/plan/${programme.sport}`}
      sport={programme.sport}
      name={programme.name}
      facts={joinFacts([pattern, finished ? "Complete" : position])}
      waits={draft && (draft.status === "editing" ? "Draft in progress" : "Changes to review")}
    />
  );
}

/** One row of the programmes' list: what it is, how it stands, what waits, its sign. */
function ProgrammeRow({
  href,
  sport,
  name,
  facts,
  waits,
}: {
  href: string;
  sport: ActivitySport;
  name: string;
  facts?: string;
  waits?: string | false;
}) {
  return (
    <li className="nav-row-item">
      <Link href={href as Route} className="nav-row plan-programme">
        <span className="nav-row-main">
          <span className="nav-row-text">
            <span className="nav-row-label nav-row-label-bold">{holdHyphens(name)}</span>
            {facts && <span className="nav-row-sub tabular-nums">{facts}</span>}
            {waits && <span className="plan-programme-waits">{waits}</span>}
          </span>
        </span>
        <SportSign sport={MARK[sport]} size={40} label={ACTIVITY_SPORT_LABELS[sport]} />
      </Link>
    </li>
  );
}

/** Where a request for a first programme stands, in the words its request page says it in. */
const REQUEST_STATE: Record<NewProgrammeRequestStatus, string> = {
  writing: "Being written",
  needs_answer: "Needs your answer",
  failed: "Could not finish",
};

/**
 * A first programme on its way (ADR 0059), as a programme's row reads: its name, and what it
 * waits for. Asked of the coach, it opens its request until a draft answers it; a ready draft
 * opens its review, one being built its editor.
 */
function Waiting({
  href,
  sport,
  name,
  state,
}: {
  href: string;
  sport: ActivitySport;
  name: string | null;
  state: string;
}) {
  return (
    <ProgrammeRow
      href={href}
      sport={sport}
      name={name || `New ${ACTIVITY_SPORT_LABELS[sport].toLowerCase()} programme`}
      waits={state}
    />
  );
}

function draftHref(draft: Pick<NewProgrammeDraft, "id" | "sport" | "status">): string {
  if (draft.status === "ready") return `/plan/drafts/${draft.id}`;
  // Each sport's builder is under its programme's page, strength's too.
  return `/plan/${draft.sport}/edit?draft=${draft.id}`;
}

/**
 * Plan (ADR 0058): what comes next and how it is built. The week as its headline, then the week
 * as one card of its days, each session with its sport's sign, then the programmes as one list
 * (owner, 28 October 2026). Starting, logging and skipping today's sessions are Today's; what
 * has been done is Progress's.
 */
export function PlanView({
  cards,
  drafts = [],
  requests = [],
  sessions,
  units = DEFAULT_SPORT_UNITS,
  monday,
  today,
}: {
  cards: readonly PlanCard[];
  /** First programmes drafted and not yet started, which no card above can stand for. */
  drafts?: readonly Pick<NewProgrammeDraft, "id" | "sport" | "status" | "name">[];
  /** First programmes asked of the coach that no draft answers yet. */
  requests?: readonly NewProgrammeRequest[];
  sessions: readonly WeekSession[];
  /** How the athlete reads distances, for the figure under a run, ride or swim. */
  units?: SportUnits;
  monday: string;
  today: string;
}) {
  const empty = cards.length === 0 && drafts.length === 0 && requests.length === 0;
  const title = weekTitle(monday, today);
  return (
    <div className="page-wide">
      {/* The week is the headline, its dates its second tone and its steps at its end
          (DESIGN.md, Tab roots); the tab bar already says Plan. */}
      <PageHeader
        tab="Plan"
        title={title}
        meta={weekRange(monday, addDays(monday, 6), today.slice(0, 4))}
        action={<WeekSteps monday={monday} today={today} />}
      />
      <div className="page-width space-y-[var(--section-gap)] pb-8">
        {empty && (
          <Card className="space-y-[var(--ov-gap-block)]">
            <h2 className="type-section">No programmes yet</h2>
            <LinkButton href="/plan/new" size="lg" className="w-full">
              <Glyph name="plus" className="glyph-18" />
              New programme
            </LinkButton>
          </Card>
        )}
        {(!empty || sessions.length > 0) && (
          <Week sessions={sessions} today={today} units={units} label={title} />
        )}
        {!empty && (
          <section aria-labelledby="plan-programmes">
            {/* Starting a programme stands with the programmes, led by its plus at the end of
                their heading (DESIGN.md, Buttons: Looks like a control). */}
            <div className="heading-row">
              <h2 id="plan-programmes" className="caption-head">
                Programmes
              </h2>
              <Link href="/plan/new" aria-label="New programme" className="list-head-action">
                <Glyph name="plus" className="glyph-20" />
                New
              </Link>
            </div>
            <ul className="ov-panel ov-panel-list">
              {cards.map((card) => (
                <Programme key={card.programme.id} card={card} />
              ))}
              {drafts.map((draft) => (
                <Waiting
                  key={draft.id}
                  href={draftHref(draft)}
                  sport={draft.sport}
                  name={draft.name}
                  state={draft.status === "ready" ? "New programme to review" : "Draft in progress"}
                />
              ))}
              {requests.map((request) => (
                <Waiting
                  key={request.id}
                  href={`/plan/requests/${request.id}`}
                  sport={request.sport}
                  name={null}
                  state={REQUEST_STATE[request.status]}
                />
              ))}
              <NavRow href="/plan/past" label="Past programmes" />
            </ul>
          </section>
        )}
        {empty && (
          <ul className="ov-panel ov-panel-list">
            <NavRow href="/plan/past" label="Past programmes" />
          </ul>
        )}
      </div>
    </div>
  );
}
