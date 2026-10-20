import type { Route } from "next";

import { Art } from "@/components/art/art";
import {
  enduranceName,
  enduranceTarget,
  plannedName,
} from "@/components/activities/endurance-line";
import { alreadySays } from "@/components/activities/prescription-lines";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Disclosure } from "@/components/ui/disclosure";
import { Glyph } from "@/components/ui/glyphs";
import { NavRow } from "@/components/ui/nav-row";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { byDay, weekStartOf, type WeekSession, type WeekStatus } from "@/domain/plan-week";
import { addDays } from "@/domain/program-calendar";
import { DEFAULT_SPORT_UNITS, type SportUnits } from "@/lib/distance-units";
import { holdHyphens, joinFacts } from "@/lib/facts";
import { formatDateRange, formatIsoDate } from "@/lib/format";
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
                state={
                  session.status === "done"
                    ? "done"
                    : session.status === "skipped"
                      ? "skipped"
                      : "todo"
                }
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

/** What became of a day gone by, in the app's words: "2 done", "1 done · 1 skipped". */
function outcome(sessions: readonly WeekSession[]): string {
  return joinFacts(
    (["done", "skipped", "missed"] as const).map((status) => {
      const count = sessions.filter((session) => session.status === status).length;
      return count > 0 && `${count}\u00a0${STATUS[status].toLowerCase()}`;
    }),
  );
}

function Week({
  sessions,
  monday,
  today,
  units,
}: {
  sessions: readonly WeekSession[];
  monday: string;
  today: string;
  units: SportUnits;
}) {
  const days = byDay(sessions);
  const gone = days.filter(({ date }) => date < today);
  const ahead = days.filter(({ date }) => date >= today);
  const year = today.slice(0, 4);
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
      {days.length === 0 && <p className="type-meta text-ink-2">Nothing planned.</p>}
      {gone.length > 0 && (
        // A day gone by is one closed row saying what became of it, its sessions a tap away
        // (DESIGN.md, Folds): ruled rows that share their rules, never a stack of boxes.
        <ul className="[&>li+li]:-mt-px">
          {gone.map(({ date, sessions: onDay }) => (
            <li key={date}>
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
            <li key={date} className="plan-day">
              <p className="plan-day-name type-caption tabular-nums">{formatIsoDate(date, year)}</p>
              <DayRows sessions={onDay} units={units} />
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
 * Plan (ADR 0058): what comes next and how it is built. This week's sessions for every sport,
 * by date, then one card per programme. Starting, logging and skipping today's sessions are
 * Today's; what has been done is Progress's.
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
          <Week sessions={sessions} monday={monday} today={today} units={units} />
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
