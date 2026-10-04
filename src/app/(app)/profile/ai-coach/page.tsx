import type { Metadata } from "next";
import { CoachingActivity } from "@/components/coaching/activity";

import type { Route } from "next";

import { RequestList } from "@/components/coaching/request-list";
import { BackLink } from "@/components/shell/back-link";
import Link from "@/components/ui/app-link";
import { Glyph } from "@/components/ui/glyphs";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { NOTE_DISPOSITION_LABELS } from "@/domain/coach-memory";
import { getCoachRoutine, getCoachServiceToken } from "@/lib/env";
import { formatDateTime } from "@/lib/format";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import {
  getCoachMemo,
  latestPlan,
  pendingRequest,
  recentAttempts,
} from "@/server/repositories/coach-plans";
import { countWaitingOnAthlete } from "@/server/repositories/coach-proposals";

import { loadProgrammeChanges } from "../programme/changes";
import { Proposals } from "../programme/proposals";
import { AiCoachSettings } from "./ai-coach-settings";
import { CoachLinks } from "./coach-links";

export const metadata: Metadata = { title: "AI coach" };

export default async function AiCoachSettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const workflow = process.env.COACH_WORKFLOW_ENABLED === "true";
  const { memo, plan, pending, attempts, waiting, changes } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const now = new Date();
      if (workflow) {
        const [memo, waiting, changes] = await Promise.all([
          getCoachMemo(tx, user.id),
          countWaitingOnAthlete(tx, user.id),
          // What waits on the athlete is answered here as well as on the Changes tab.
          loadProgrammeChanges(tx, user.id, profile.timeZone),
        ]);
        return { memo, plan: null, pending: null, attempts: [], waiting, changes };
      }
      // Expired requests are shown as the failures they will be recorded as (`recentAttempts`),
      // so this screen reads without the athlete lock.
      const [memo, plan, pending, attempts] = await Promise.all([
        getCoachMemo(tx, user.id),
        latestPlan(tx, user.id),
        pendingRequest(tx, user.id, now),
        recentAttempts(tx, user.id, 8),
      ]);
      return { memo, plan, pending, attempts, waiting: 0, changes: null };
    },
    { readOnly: true },
  );
  // Whether this server can hear from the coach and start it: owner-side setup facts.
  const configured = getCoachServiceToken() !== null;
  const canRequest = getCoachRoutine() !== null;
  // A coach that is on and working says nothing: the switch is the statement. What is worth a
  // line is that it cannot run here, or, on the older single-plan path, what it last produced.
  const status = !configured
    ? "Not set up on this server yet"
    : workflow
      ? null
      : pending
        ? `Planning now, asked at ${formatDateTime(pending.requestedAt, profile.timeZone)}`
        : plan
          ? `Last plan ${formatDateTime(plan.generatedAt, profile.timeZone)}`
          : "No plan yet; the first arrives after the next overnight run";

  const proposals = changes?.proposals ?? [];
  const waitingOnYou = changes && (
    <>
      {changes.questions.length > 0 && (
        <div className="mt-2">
          <RequestList requests={changes.questions} label="Needs your answer" />
        </div>
      )}
      {(proposals.length > 0 || changes.legacy.length > 0) && (
        <section aria-labelledby="coach-waiting">
          <h2 id="coach-waiting" className="caption-head mt-4.5">
            Waiting for you
          </h2>
          <ul>
            {proposals.map((proposal) => (
              <li key={proposal.id}>
                <Link
                  href={`/profile/programme/drafts/${proposal.id}` as Route}
                  className="waiting-row"
                >
                  <span className="mark-cell">
                    <Glyph name={proposal.lead} className="glyph-20" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="waiting-row-title">
                      {proposal.answers.length > 0 ? proposal.answers.join(", ") : proposal.title}
                    </span>
                    {(proposal.rationale || proposal.asks.length > 0) && (
                      <span className="waiting-row-sub">
                        {proposal.rationale ||
                          `You asked: ${proposal.asks.map((quote) => `“${quote}”`).join(", ")}`}
                      </span>
                    )}
                  </span>
                  <Glyph name="chevronRight" className="nav-row-chevron glyph-20 shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
          {changes.legacy.length > 0 && <Proposals proposals={changes.legacy} />}
        </section>
      )}
    </>
  );

  // Board AI coach: the way back and More (what it plans from, every change and request).
  return (
    <>
      <header className="page-header page-width pt-safe">
        <div className="page-header-bar">
          <BackLink fallback="/profile" />
          {workflow && (
            <div className="page-header-action">
              <CoachLinks waiting={waiting} />
            </div>
          )}
        </div>
      </header>
      <div className="page-width pb-8">
        <AiCoachSettings
          workflow={workflow}
          enabled={profile.aiCoachEnabled}
          status={
            configured && !canRequest && profile.aiCoachEnabled
              ? [status, "On-demand coaching is not set up on this server"]
                  .filter(Boolean)
                  .join(" · ")
              : status
          }
          noteId={crypto.randomUUID()}
          notes={memo.notes.recent.map((note) => ({
            id: note.id,
            text: note.text,
            when: formatDateTime(note.createdAt, profile.timeZone),
            // What became of it, not merely that it was read: a request the coach has parked
            // until your programme review reads very differently from one it declined.
            outcome:
              note.reviewedAt === null
                ? null
                : [
                    note.disposition ? NOTE_DISPOSITION_LABELS[note.disposition] : "Reviewed",
                    note.dispositionDetail,
                  ]
                    .filter(Boolean)
                    .join(" — "),
          }))}
          overview={memo.overview}
          attempts={attempts.map((attempt) => ({
            id: attempt.id,
            when: formatDateTime(attempt.requestedAt, profile.timeZone),
            trigger: attempt.trigger === "nightly" ? "Overnight" : "You asked",
            status: attempt.status,
            gymName: attempt.gymName,
            error: attempt.error,
          }))}
          waiting={waitingOnYou}
        >
          {/* Only a run that failed: the links it used to list are behind More. */}
          <CoachingActivity />
        </AiCoachSettings>
      </div>
    </>
  );
}
