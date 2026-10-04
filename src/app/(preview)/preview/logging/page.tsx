import { LoggingPreview, type Scenario } from "./logging-preview";

const SCENARIOS: readonly Scenario[] = ["log", "warmups", "pounds", "superset", "first", "done"];

/**
 * Logging, as the design's boards draw it (docs/ui-redesign/revamp/form-v2), against made-up
 * answers rather than a database: `?scenario=` picks the exercise and how far it has gone,
 * `?fail=1` makes every save fail as a dropped connection does, `?rest=0` starts with no rest
 * running. The figures are the boards' own, from the repository's tests and audit scripts.
 */
export default async function LoggingPreviewPage(props: PageProps<"/preview/logging">) {
  const params = await props.searchParams;
  const asked = typeof params.scenario === "string" ? params.scenario : "log";
  const scenario = (SCENARIOS as readonly string[]).includes(asked) ? (asked as Scenario) : "log";
  return (
    <LoggingPreview scenario={scenario} fail={params.fail === "1"} rest={params.rest !== "0"} />
  );
}
