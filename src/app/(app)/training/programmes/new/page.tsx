import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/page-header";
import { PageContent } from "@/components/shell/page-content";
import { LinkButton } from "@/components/ui/button";
import { NavRow } from "@/components/ui/nav-row";
import { SportIntakeForm } from "@/components/coaching/sport-intake-form";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { ACTIVITY_SPORTS, ACTIVITY_SPORT_LABELS, isActivitySport } from "@/domain/activity";
import { coachIntakeSchema } from "@/domain/coaching-workflow";
import { todayInTimeZone } from "@/domain/program-calendar";
import { ageOn } from "@/lib/units";
import { requireProfiledUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";
import { latestIntake } from "@/server/repositories/coach-intakes";
import { getActiveProgram } from "@/server/repositories/schedule";

export default async function NewProgrammePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireProfiledUser();
  const search = await searchParams;
  const scope = search.scope === "session" ? "session" : "programme";
  const sport = search.sport;
  if (sport !== undefined && (typeof sport !== "string" || !isActivitySport(sport))) notFound();
  const selected = typeof sport === "string" && isActivitySport(sport) ? sport : null;
  const profile = await getRequestProfile(user.id, user.email);
  const data = selected
    ? await withUser(
        getDb(),
        user.id,
        async (tx) => ({
          intake: await latestIntake(tx, user.id, selected, scope),
          active: await getActiveProgram(tx, user.id, selected),
        }),
        { readOnly: true },
      )
    : null;
  return (
    <>
      <PageHeader
        title={
          selected
            ? `${ACTIVITY_SPORT_LABELS[selected]} ${scope}`
            : scope === "session"
              ? "Create a session"
              : "Add programme"
        }
        backHref="/training"
      />
      <PageContent>
        {!selected ? (
          <ul>
            {ACTIVITY_SPORTS.map((item) => (
              <NavRow
                key={item}
                href={`/training/programmes/new?sport=${item}&scope=${scope}`}
                glyph="table"
                label={ACTIVITY_SPORT_LABELS[item]}
              />
            ))}
          </ul>
        ) : search.method === "coach" ? (
          <SportIntakeForm
            sport={selected}
            scope={scope}
            initial={data!.intake}
            prefill={coachIntakeSchema.parse({
              programmeSport: selected,
              scope,
              heightCm: profile.heightCm,
              weightKg: profile.bodyWeightKg,
              ageYears: profile.dateOfBirth
                ? ageOn(profile.dateOfBirth, todayInTimeZone(profile.timeZone))
                : null,
            })}
          />
        ) : (
          <div className="space-y-4">
            {scope === "programme" && data!.active && (
              <p className="text-sm text-ink-2">
                You already have a {ACTIVITY_SPORT_LABELS[selected].toLowerCase()} programme. A new
                one will replace it only after you review and start it. Your history is preserved.
              </p>
            )}
            <LinkButton
              href={`/training/programmes/new?sport=${selected}&scope=${scope}&method=coach`}
            >
              Create with the coach
            </LinkButton>
            {scope === "programme" && (
              <div>
                <LinkButton
                  href={
                    selected === "strength"
                      ? "/profile/programme/manual"
                      : `/training/programmes/${selected}/edit`
                  }
                  variant="secondary"
                >
                  Build it yourself
                </LinkButton>
              </div>
            )}
            <p className="text-sm text-ink-2">
              {scope === "session"
                ? "This creates a reusable session and leaves your active programmes in place."
                : "Each sport progresses independently. Your coach can see all your programmes when planning."}
            </p>
          </div>
        )}
      </PageContent>
    </>
  );
}
