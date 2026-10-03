import { WorkoutPreview, type Scenario } from "./workout-preview";

const SCENARIOS: readonly Scenario[] = ["upper", "arms", "coach"];

/**
 * The workout, as the design's boards draw it (docs/ui-redesign/revamp/form-v2: Workout,
 * Workout-Superset, Workout-Coach), against made-up data rather than a database: `?scenario=`
 * picks Upper A under way, Easy Run + Arms with its superset, or the coach's Lower A.
 */
export default async function WorkoutPreviewPage(props: PageProps<"/preview/workout">) {
  const params = await props.searchParams;
  const asked = typeof params.scenario === "string" ? params.scenario : "upper";
  const scenario = (SCENARIOS as readonly string[]).includes(asked) ? (asked as Scenario) : "upper";
  return <WorkoutPreview scenario={scenario} />;
}
