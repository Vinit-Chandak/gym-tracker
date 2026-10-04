import type { Metadata, Route } from "next";
import { notFound, redirect } from "next/navigation";

import { FreshAfterSets } from "@/components/fresh-after-sets";
import { SessionPage } from "@/components/shell/session-page";
import { Glyph } from "@/components/ui/glyphs";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { formatSets } from "@/domain/sets";
import { finishSessionAction } from "@/server/actions/sessions";
import { fromKilograms, setInUnit } from "@/lib/units";
import { LOAD_UNIT_LABELS } from "@/lib/labels";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { seenSetChanges } from "@/server/queries/set-changes";
import { getSessionDetail } from "@/server/repositories/sessions";
import { requireUuid } from "@/server/validation/params";

import { FinishForm } from "./finish-form";
import Loading from "./loading";

export const metadata: Metadata = { title: "Finish session" };

export default async function FinishPage(props: PageProps<"/workouts/[sessionId]/finish">) {
  const { sessionId } = await props.params;
  requireUuid(sessionId);
  const user = await requireUser();
  // Forward, after Back, brings this screen back as it was; after a set it is rendered again.
  const seen = await seenSetChanges();
  const [profile, session] = await Promise.all([
    getRequestProfile(user.id, user.email),
    withUser(
      getDb(),
      user.id,
      (tx) => getSessionDetail(tx, user.id, sessionId, { includeGuidance: false }),
      { readOnly: true },
    ),
  ]);
  const unit = profile.preferredUnit === "lb" ? "lb" : "kg";
  if (!session) notFound();
  if (session.completedAt) redirect(`/workouts/${sessionId}`);

  const done = session.exercises.filter((e) => e.sets.length > 0);
  const skipped = session.exercises.filter((e) => e.skippedAt !== null);
  const untouched = session.exercises.filter((e) => e.sets.length === 0 && !e.skippedAt);
  const totalSets = done.reduce((sum, exercise) => sum + exercise.sets.length, 0);

  const title = session.day?.name ?? "Ad hoc session";

  // Board Finish: what the session recorded and what it did not, then the notes and the day's
  // body weight. A page that ends the session closes back to it rather than going back.
  return (
    <FreshAfterSets seen={seen} loading={<Loading />}>
      <SessionPage
        title={title}
        meta={
          <span className="meta-fact">
            <Glyph name="pin" label="Gym" className="glyph-16" />
            {session.gym.name}
          </span>
        }
        close={{ href: `/workouts/${sessionId}` as Route, label: "Back to the workout" }}
        rest={profile.restTimerEnabled ? sessionId : null}
      >
        <section aria-labelledby="finish-recorded">
          <h2 id="finish-recorded" className="caption-head mt-3 flex justify-between gap-3">
            <span>Recorded</span>
            <span className="tabular-nums">
              {totalSets} {totalSets === 1 ? "set" : "sets"}
            </span>
          </h2>
          {done.length > 0 ? (
            <ul>
              {done.map((exercise) => (
                <li key={exercise.id} className="record-row">
                  <span className="record-row-name">{exercise.exercise.name}</span>{" "}
                  <span className="record-row-sets">
                    {formatSets(
                      exercise.sets.map((set) => setInUnit(set, exercise.equipment?.unit ?? unit)),
                      (loadUnit) => LOAD_UNIT_LABELS[loadUnit],
                    )}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="record-row type-meta text-ink-2">No sets logged yet.</p>
          )}
        </section>

        {/* Not done is a fact about the session, not an error. It is recorded as it stands. */}
        {(untouched.length > 0 || skipped.length > 0) && (
          <section aria-labelledby="finish-not-done">
            <h2 id="finish-not-done" className="caption-head mt-3">
              Not done
            </h2>
            <div className="not-done">
              {untouched.length > 0 && (
                <p>{untouched.map((exercise) => exercise.exercise.name).join(", ")}</p>
              )}
              {skipped.length > 0 && (
                <p>
                  Skipped:{" "}
                  {skipped
                    .map(
                      (exercise) =>
                        `${exercise.exercise.name}${exercise.notes ? ` (${exercise.notes})` : ""}`,
                    )
                    .join(", ")}
                </p>
              )}
            </div>
          </section>
        )}

        <FinishForm
          userId={user.id}
          sessionId={sessionId}
          nothingLogged={totalSets === 0}
          action={finishSessionAction.bind(null, sessionId)}
          unit={unit}
          initialBodyWeight={
            session.bodyWeightKg === null ? "" : String(fromKilograms(session.bodyWeightKg, unit))
          }
          // The profile's weight is always the newest reading (ADR 0020), so no query of its own.
          lastBodyWeight={
            profile.bodyWeightKg === null ? "" : String(fromKilograms(profile.bodyWeightKg, unit))
          }
        />
      </SessionPage>
    </FreshAfterSets>
  );
}
