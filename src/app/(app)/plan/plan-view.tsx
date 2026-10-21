import type { Route } from "next";

import { Art } from "@/components/art/art";
import type { FormState } from "@/components/art/geometry";
import {
  enduranceName,
  enduranceTarget,
  plannedName,
} from "@/components/activities/endurance-line";
import { alreadySays } from "@/components/activities/prescription-lines";
import { PageHeader } from "@/components/shell/page-header";
import { dayAndMonth, weekDates, weekdayName } from "@/components/shell/root-dates";
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
import { formatIsoDate, formatIsoWeekdayLetter } from "@/lib/format";
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

/**
 * A session's mark in its state (DESIGN.md, The Thinned, Full, Dashed Rule): done full, a day
 * gone by unanswered dashed as a skipped one is (Signals: a missed day is its dashed mark, the
 * word Missed beside it), anything still owed thinned.
 */
function markState(status: WeekStatus): FormState {
  return status === "done"
    ? "done"
    : status === "skipped" || status === "missed"
      ? "skipped"
      : "todo";
}

/** Where a session stands, as a day's paper says it to a screen reader: "Lower A, to do". */
const SAID: Record<WeekStatus, string> = {
  done: "done",
  skipped: "skipped",
  missed: "missed",
  today: "to do",
  planned: "to do",
};

/** A day's entry in the rows under the week, which its paper leads to. */
const dayAnchor = (date: string) => `plan-day-${date}`;

/** A day's sessions, each with its sport's mark, its name, its figure and where it stands. */
function DayRows({ sessions, units }: { sessions: readonly WeekSession[]; units: SportUnits }) {
  return (
    <ul className="ruled-list">
      {sessions.map((session) => {
        const { name, figure } = sessionWords(session, units);
        return (
          <NavRow
            key={session.key}
            href={sessionHref(session)}
            lead={
              <Art
                kind="mark"
                sport={MARK[session.sport]}
                size={20}
                state={markState(session.status)}
              />
            }
            label={holdHyphens(name)}
            sub={figure ?? undefined}
            value={session.status === "planned" ? undefined : STATUS[session.status]}
          />
        );
      })}
    </ul>
  );
}

/** The marks a paper holds side by side, then in two rows of two; past four, three and +N. */
const SHOWN_MARKS = 4;

/**
 * The week as seven day papers in the month's grammar (DESIGN.md, Layout: Plan; The month): a
 * tile of paper for each day, its date in the corner, each session its sport's mark in its
 * state, today ringed in print ink, and a day with nothing in it a paler sheet. A day of one
 * session opens it; a day of more opens its entry in the rows under the week.
 */
function WeekPapers({
  days,
  monday,
  today,
  units,
}: {
  days: readonly { date: string; sessions: WeekSession[] }[];
  monday: string;
  today: string;
  units: SportUnits;
}) {
  const year = today.slice(0, 4);
  const dates = Array.from({ length: 7 }, (_, i) => addDays(monday, i));
  return (
    <div role="group" aria-label="The week, day by day" className="month month-dated plan-papers">
      <div aria-hidden className="month-weekdays">
        {dates.map((date) => (
          <span key={date}>{formatIsoWeekdayLetter(date)}</span>
        ))}
      </div>
      <div className="month-days">
        {dates.map((date) => {
          const sessions = days.find((day) => day.date === date)?.sessions ?? [];
          const isToday = date === today;
          const said = sessions.length
            ? sessions
                .map((session) => `${sessionWords(session, units).name}, ${SAID[session.status]}`)
                .join("; ")
            : "nothing planned";
          const name = `${weekdayName(date)} ${dayAndMonth(date, year)}${isToday ? ", today" : ""}: ${said}`;
          const tile = cn(
            "month-day",
            sessions.length === 0 && "month-day-rest",
            isToday && "month-day-today",
          );
          const shown = sessions.length > SHOWN_MARKS ? sessions.slice(0, 3) : sessions;
          const inner = (
            <>
              <span aria-hidden className="month-date">
                {Number(date.slice(8, 10))}
              </span>
              {sessions.length > 0 && (
                <span aria-hidden className="month-icons">
                  <span className="plan-paper-marks">
                    {shown.map((session) => (
                      <Art
                        key={session.key}
                        kind="mark"
                        sport={MARK[session.sport]}
                        size={16}
                        state={markState(session.status)}
                        surface="paper"
                      />
                    ))}
                    {shown.length < sessions.length && (
                      <span className="plan-paper-more">+{sessions.length - shown.length}</span>
                    )}
                  </span>
                </span>
              )}
            </>
          );
          if (sessions.length === 0)
            return (
              <span key={date} role="img" aria-label={name} className={tile}>
                {inner}
              </span>
            );
          // A day of more than one session is its entry under the week, on this page.
          if (sessions.length > 1)
            return (
              <a key={date} href={`#${dayAnchor(date)}`} aria-label={name} className={tile}>
                {inner}
              </a>
            );
          return (
            <Link key={date} href={sessionHref(sessions[0]!)} aria-label={name} className={tile}>
              {inner}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/** What became of a day gone by, in the app's words: "2 done", "1 done · 1 skipped". */
function outcome(sessions: readonly WeekSession[]): string {
  return joinFacts(
    (["done", "skipped", "missed"] as const).map((status) => {
      const count = sessions.filter((session) => session.status === status).length;
      return count > 0 && `${count}\u00a0${STATUS[status].toLowerCase()}`;
    }),
  );
}

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
 * The weeks either side, under the week's rows as a list's pages are (DESIGN.md, Page tabs),
 * each named by where it stands from today ("Last week", "Next week"); the tab itself comes back
 * to this one.
 */
function WeekSteps({ monday, today }: { monday: string; today: string }) {
  const before = addDays(monday, -7);
  const after = addDays(monday, 7);
  return (
    <nav aria-label="Weeks" className="plan-week-steps">
      <Link href={`/plan?week=${before}` as Route} className="plan-week-step">
        <Glyph name="chevronLeft" className="glyph-20" />
        {weekTitle(before, today)}
      </Link>
      <Link href={`/plan?week=${after}` as Route} className="plan-week-step">
        {weekTitle(after, today)}
        <Glyph name="chevronRight" className="glyph-20" />
      </Link>
    </nav>
  );
}

function Week({
  sessions,
  monday,
  today,
  units,
  label,
}: {
  sessions: readonly WeekSession[];
  monday: string;
  today: string;
  units: SportUnits;
  /** The headline the week stands under, which names it for a screen reader. */
  label: string;
}) {
  const days = byDay(sessions);
  const gone = days.filter(({ date }) => date < today);
  const ahead = days.filter(({ date }) => date >= today);
  const year = today.slice(0, 4);
  return (
    <section aria-label={label} className="plan-week">
      <WeekPapers days={days} monday={monday} today={today} units={units} />
      {days.length === 0 && <p className="type-meta text-ink-2">Nothing planned.</p>}
      {gone.length > 0 && (
        // A day gone by is one closed row saying what became of it, its sessions a tap away
        // (DESIGN.md, Folds): ruled rows that share their rules, never a stack of boxes.
        <ul className="[&>li+li]:-mt-px">
          {gone.map(({ date, sessions: onDay }) => (
            <li key={date} id={dayAnchor(date)} className="plan-day">
              <Disclosure
                summary={formatIsoDate(date, year)}
                meta={outcome(onDay)}
                variant="inline"
              >
                <DayRows sessions={onDay} units={units} />
              </Disclosure>
            </li>
          ))}
        </ul>
      )}
      {ahead.length > 0 && (
        <ul className="plan-days">
          {ahead.map(({ date, sessions: onDay }) => (
            <li key={date} id={dayAnchor(date)} className="plan-day">
              <p className="plan-day-name type-caption tabular-nums">{formatIsoDate(date, year)}</p>
              <DayRows sessions={onDay} units={units} />
            </li>
          ))}
        </ul>
      )}
      <WeekSteps monday={monday} today={today} />
    </section>
  );
}

/** More weeks than this and a segment would be too narrow to read as one; the words say it. */
const MOST_SEGMENTS = 40;

/**
 * Where a programme that runs in weeks or cycles has got to, from the words its card says it in
 * ("Week 3 of 8", "Cycle 5 of 14"); null for one counted in days, not started, or finished.
 */
export function programmeWeeks(position: string | null): { current: number; total: number } | null {
  const found = position ? /^(?:Week|Cycle) (\d+) of (\d+)$/.exec(position) : null;
  if (!found) return null;
  const current = Number(found[1]);
  const total = Number(found[2]);
  return current >= 1 && current <= total && total <= MOST_SEGMENTS ? { current, total } : null;
}

/**
 * A programme's weeks as a row of segments in its sport's pigment (DESIGN.md, Layout: Plan): the
 * weeks done full, the current week thinned, the rest `surface`. The words beside it say where
 * it has got to, so the row is not read out.
 */
function ProgrammeWeeks({
  sport,
  current,
  total,
}: {
  sport: ActivitySport;
  current: number;
  total: number;
}) {
  return (
    <span aria-hidden data-sport={MARK[sport]} className="plan-programme-weeks">
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          data-state={index + 1 < current ? "done" : index + 1 === current ? "now" : undefined}
        />
      ))}
    </span>
  );
}

/** A programme as Plan lists it: its sport, its name, how it runs and where it has got to. */
function Programme({ card }: { card: PlanCard }) {
  const { programme, waiting, pattern, position, finished } = card;
  const draft = waiting[0];
  const weeks = finished ? null : programmeWeeks(position);
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
        {weeks && <ProgrammeWeeks sport={programme.sport} {...weeks} />}
        {draft && (
          <span className="plan-programme-waiting type-meta-small">
            {draft.status === "editing" ? "Draft in progress" : "Changes to review"}
          </span>
        )}
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
 * A first programme on its way (ADR 0059), as a programme's card reads: its sport and name, and
 * what it waits for. Asked of the coach, it opens its request until a draft answers it; a ready
 * draft opens its review, one being built its editor.
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
    <li className="min-w-0">
      <Link href={href as Route} className="plan-programme box panel-padding">
        <span className="plan-programme-sport type-meta-small text-ink-2">
          <Art kind="mark" sport={MARK[sport]} size={20} />
          {ACTIVITY_SPORT_LABELS[sport]}
        </span>
        <span className="plan-programme-name">
          {holdHyphens(name || `New ${ACTIVITY_SPORT_LABELS[sport].toLowerCase()} programme`)}
        </span>
        <span className="plan-programme-waiting type-meta-small">{state}</span>
      </Link>
    </li>
  );
}

function draftHref(draft: Pick<NewProgrammeDraft, "id" | "sport" | "status">): string {
  if (draft.status === "ready") return `/plan/drafts/${draft.id}`;
  // Each sport's builder is under its programme's page, strength's too.
  return `/plan/${draft.sport}/edit?draft=${draft.id}`;
}

/**
 * Plan (ADR 0058): what comes next and how it is built. The week as its headline and as seven
 * day papers, then its sessions for every sport, by date, then one card per programme. Starting,
 * logging and skipping today's sessions are Today's; what has been done is Progress's.
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
      {/* The week is the headline, its dates under it (DESIGN.md, Tab roots); the tab bar
          already says Plan. */}
      <PageHeader
        tab="Plan"
        title={title}
        meta={weekDates(monday, addDays(monday, 6), today.slice(0, 4))}
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
          <Week sessions={sessions} monday={monday} today={today} units={units} label={title} />
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
