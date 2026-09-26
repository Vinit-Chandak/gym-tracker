/** Read-only checks for the local long-history fixtures and their actual RLS boundaries. */
import { mkdir, writeFile } from "node:fs/promises";
import { eq, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { withUser } from "@/db/with-user";

const database = process.env.SEED_DATABASE_URL ?? "";
const target = new URL(database);
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
  target.search !== "" ||
  target.hash !== "" ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname)
) {
  throw new Error("Fixture verification requires a loopback overload_audit database.");
}
const client = postgres(database, { max: 1, prepare: false });
const db = drizzle(client, { schema });
const checks: { name: string; passed: boolean; detail: unknown }[] = [];
const check = (name: string, passed: boolean, detail: unknown) => {
  checks.push({ name, passed, detail });
  console.log(`${passed ? "PASS" : "FAIL"} ${name}: ${JSON.stringify(detail)}`);
};

async function main() {
  try {
    const [state] =
      await client`select details from auth.local_audit_seed_state where name = 'history-56-months-v1'`;
    if (!state) throw new Error("Run audit:setup before verifying the 56-month fixture.");
    const window = state.details as { from: string; through: string; months: number };
    const coverage = await client`
    select p.username, a.sport, count(*)::int as activities,
      count(distinct to_char(a.occurred_on, 'YYYY-MM'))::int as months,
      min(a.occurred_on)::text as first_day, max(a.occurred_on)::text as last_day
    from activities a join profiles p on p.id = a.user_id
    where a.source_reference = 'history-56-months-v1'
    group by p.username, a.sport order by p.username, a.sport`;
    check(
      "56 months of all four sports for four established personas",
      coverage.length === 16 &&
        coverage.every(
          (row) =>
            row.months === window.months &&
            row.first_day >= window.from &&
            row.last_day <= window.through,
        ),
      coverage,
    );

    const nutrition = await client`
    select p.username,
      (select count(distinct to_char(e.eaten_on, 'YYYY-MM'))::int from food_entries e where e.user_id = p.id and e.eaten_on between ${window.from}::date and ${window.through}::date) as food_months,
      (select count(distinct to_char(b.measured_on, 'YYYY-MM'))::int from body_weight_logs b where b.user_id = p.id and b.measured_on between ${window.from}::date and ${window.through}::date) as weight_months
    from profiles p where p.username in ('vinit', 'shreyash', 'priya', 'alex') order by p.username`;
    check(
      "56 months of food and body-weight readings",
      nutrition.length === 4 &&
        nutrition.every((row) => row.food_months === 56 && row.weight_months === 56),
      nutrition,
    );
    const recovery = await client`
      select p.username, count(distinct to_char(r.date, 'YYYY-MM'))::int as months
      from daily_recovery r join profiles p on p.id = r.user_id
      where p.username in ('vinit', 'shreyash', 'priya', 'alex')
        and r.date between ${window.from}::date and ${window.through}::date
      group by p.username order by p.username`;
    check(
      "56 months of standalone recovery",
      recovery.length === 4 && recovery.every((row) => row.months === 56),
      recovery,
    );

    const [chronology] = await client`
    select count(*)::int as mismatches from activities a
    left join workout_sessions w on w.activity_id = a.id and w.user_id = a.user_id
    where a.source_reference = 'history-56-months-v1' and (
      a.occurred_on <> (a.started_at at time zone a.recorded_time_zone)::date or
      a.occurred_on < ${window.from}::date or a.occurred_on > ${window.through}::date or
      (a.sport = 'strength' and (w.id is null or w.completed_at is null or w.started_at <> a.started_at
        or a.duration_ms is distinct from (extract(epoch from (w.completed_at - w.started_at)) * 1000)::int)))`;
    check(
      "Canonical history dates and workout durations agree",
      chronology!.mismatches === 0,
      chronology,
    );

    const [projection] = await client`
    select count(*)::int as mismatches from activities a
    join profiles p on p.id = a.user_id
    left join user_sport_preferences pref on pref.user_id = a.user_id and pref.sport = a.sport
    left join shared_session_stats st on st.user_id = a.user_id and st.source_id = a.id
      and st.sport::text = case a.sport when 'strength' then 'workout' when 'running' then 'run' when 'cycling' then 'cycle' else 'swim' end
    where a.source_reference = 'history-56-months-v1' and (
      ((a.sport in ('strength', 'running') or (p.share_training and pref.share_stats)) and (st.id is null or st.occurred_on <> a.occurred_on))
      or (a.sport in ('cycling', 'swimming') and not (p.share_training and coalesce(pref.share_stats, false)) and st.id is not null))`;
    check(
      "Historical projections match dates and sport-sharing consent",
      projection!.mismatches === 0,
      projection,
    );

    const [weight] = await client`
    select count(*)::int as mismatches from profiles p
    join lateral (select weight_kg from body_weight_logs b where b.user_id = p.id order by measured_on desc limit 1) b on true
    where p.body_weight_kg is distinct from b.weight_kg`;
    check("Profile weight agrees with the newest reading", weight!.mismatches === 0, weight);

    const people = await db.select().from(schema.profiles);
    for (const person of people)
      await withUser(
        db,
        person.id,
        async (tx) => {
          const [activities, food, profiles] = await Promise.all([
            tx
              .select({ count: sql<number>`count(*)::int` })
              .from(schema.activities)
              .where(ne(schema.activities.userId, person.id)),
            tx
              .select({ count: sql<number>`count(*)::int` })
              .from(schema.foodEntries)
              .where(ne(schema.foodEntries.userId, person.id)),
            tx
              .select({ count: sql<number>`count(*)::int` })
              .from(schema.profiles)
              .where(ne(schema.profiles.id, person.id)),
          ]);
          check(
            `@${person.username} cannot read another owner's raw activities, food or profile`,
            [activities, food, profiles].every((result) => result[0]!.count === 0),
            {
              activities: activities[0]!.count,
              food: food[0]!.count,
              profiles: profiles[0]!.count,
            },
          );
          const alex = people.find((row) => row.username === "alex");
          if (person.username === "vinit" && alex && !alex.shareTraining) {
            const [shared] = await tx
              .select({ count: sql<number>`count(*)::int` })
              .from(schema.sharedSessionStats)
              .where(eq(schema.sharedSessionStats.userId, alex.id));
            check("Alex's private training is hidden from Vinit", shared!.count === 0, shared);
          }
        },
        { readOnly: true },
      );

    const [counts] = await client`select
    (select count(*)::int from profiles) as users,
    (select count(*)::int from activities) as activities,
    (select count(*)::int from workout_sessions) as workouts,
    (select count(*)::int from set_logs) as sets,
    (select count(*)::int from food_entries) as food_entries,
    (select count(*)::int from body_weight_logs) as body_weight_readings,
    (select count(*)::int from daily_recovery) as recovery_readings,
    (select count(*)::int from activity_resources) as resources,
    (select count(*)::int from saved_meals) as saved_meals,
    (select count(*)::int from planned_occurrences) as scheduled_occurrences`;
    const summary = {
      database: target.pathname.slice(1),
      window,
      counts,
      checks,
      passed: checks.every((entry) => entry.passed),
    };
    const output = process.env.AUDIT_OUTPUT_DIR ?? "output/flow-audit";
    await mkdir(output, { recursive: true });
    await writeFile(`${output}/seed-verification.json`, JSON.stringify(summary, null, 2));
    console.log(`Fixture counts: ${JSON.stringify(counts)}`);
    if (!summary.passed) process.exitCode = 1;
  } finally {
    await client.end();
  }
}
main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
