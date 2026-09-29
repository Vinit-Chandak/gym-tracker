import type { Finding, JobRecord } from "./coach-simulator";

/** Context keys use colons internally; exported files must also be valid on Windows. */
export const contextFileName = (kind: string) =>
  `context-${kind.replace(/[^a-z0-9_-]/gi, "-")}.json`;

const expectedSupersession = (job: JobRecord) =>
  job.outcome === "unclaimable" &&
  job.kind === "prepare_session" &&
  job.claimState?.httpStatus === 200 &&
  job.claimState.status === "superseded" &&
  [
    "A newer daily preparation replaced this attempt.",
    "A review re-planned this session.",
  ].includes(job.claimState.error ?? "");

/** A message with its identifiers and numbers taken out, so the same refusal groups together. */
export function pattern(message: string) {
  return message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>")
    .replace(/\b\d+(\.\d+)?\b/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
}

const percentile = (values: number[], share: number) => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))]!;
};

export function summarize(jobs: readonly JobRecord[], findings: readonly Finding[]) {
  const failed = jobs.filter(
    (job) =>
      (job.outcome === "unclaimable" && !expectedSupersession(job)) ||
      (!job.meant && ["refused", "crashed", "context_error", "not_accepted"].includes(job.outcome)),
  );
  // Refusals the reference coach corrected its way past are worth knowing; ones it could not
  // are the point.
  const corrected = jobs.filter((job) => job.outcome === "accepted" && job.refusals.length > 0);
  const groups = new Map<string, { count: number; personas: Set<string>; example: JobRecord }>();
  const group = (key: string, job: JobRecord) => {
    const entry = groups.get(key) ?? { count: 0, personas: new Set(), example: job };
    entry.count++;
    entry.personas.add(job.persona);
    groups.set(key, entry);
  };
  for (const job of failed)
    group(
      `${job.kind} · ${job.outcome} · ${pattern(job.refusals.at(-1)?.join(" | ") ?? job.detail ?? "")}`,
      job,
    );
  const correctedGroups = new Map<string, { count: number; personas: Set<string> }>();
  for (const job of corrected)
    for (const issues of job.refusals)
      for (const issue of issues) {
        const key = `${job.kind} · ${pattern(issue)}`;
        const entry = correctedGroups.get(key) ?? { count: 0, personas: new Set() };
        entry.count++;
        entry.personas.add(job.persona);
        correctedGroups.set(key, entry);
      }
  const findingGroups = new Map<
    string,
    { count: number; personas: Set<string>; example: Finding }
  >();
  for (const finding of findings) {
    const key = `${finding.stage} · ${pattern(finding.message).slice(0, 300)}`;
    const entry = findingGroups.get(key) ?? { count: 0, personas: new Set(), example: finding };
    entry.count++;
    entry.personas.add(finding.persona);
    findingGroups.set(key, entry);
  }

  const kinds = [...new Set(jobs.map((job) => job.kind))];
  const lines: string[] = ["# Coach simulation", ""];
  lines.push(
    "| Job kind | Jobs | Accepted | First try | Refused | Other | Context p50 / max (KB) | Context max (ms) |",
  );
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const kind of kinds) {
    const of = jobs.filter((job) => job.kind === kind);
    const sizes = of.flatMap((job) => (job.contextBytes ? [job.contextBytes / 1024] : []));
    const times = of.flatMap((job) => (job.contextMs ? [job.contextMs] : []));
    lines.push(
      `| ${kind} | ${of.length} | ${of.filter((j) => j.outcome === "accepted").length} | ${
        of.filter((j) => j.outcome === "accepted" && j.submissions === 1).length
      } | ${of.filter((j) => j.outcome === "refused").length} | ${
        of.filter((j) => !["accepted", "refused"].includes(j.outcome)).length
      } | ${percentile(sizes, 0.5).toFixed(0)} / ${Math.max(0, ...sizes).toFixed(0)} | ${Math.max(0, ...times)} |`,
    );
  }
  lines.push("", "## Jobs the reference coach could not get accepted", "");
  if (groups.size === 0) lines.push("None.");
  for (const [key, entry] of [...groups].sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`### ${key}`, "", `${entry.count} jobs · ${[...entry.personas].join(", ")}`, "");
    lines.push("```", JSON.stringify(entry.example, null, 2).slice(0, 3000), "```", "");
  }
  const meant = jobs.filter((job) => job.meant && job.outcome !== "accepted");
  if (meant.length)
    lines.push(
      `${meant.length} more jobs were refused on purpose (${[...new Set(meant.map((job) => job.persona))].join(", ")}): their re-plans are checked, not their refusals.`,
      "",
    );
  const superseded = jobs.filter(expectedSupersession);
  if (superseded.length) {
    lines.push("## Queue snapshots superseded before claim", "");
    lines.push(
      "These preparations were replaced after an earlier review in the same queue snapshot finished; the replacement preparations are processed separately.",
      "",
    );
    for (const job of superseded)
      lines.push(`- Day ${job.day}, ${job.persona}, ${job.jobId}: ${job.claimState!.error}`);
    lines.push("");
  }
  lines.push("## Refusals corrected within the budget", "");
  if (correctedGroups.size === 0) lines.push("None.");
  for (const [key, entry] of [...correctedGroups].sort((a, b) => b[1].count - a[1].count))
    lines.push(`- ${entry.count}× ${key} (${[...entry.personas].join(", ")})`);
  lines.push("", "## Everything else that went wrong", "");
  if (findingGroups.size === 0) lines.push("None.");
  for (const [key, entry] of [...findingGroups].sort((a, b) => b[1].count - a[1].count)) {
    lines.push(`### ${key}`, "", `${entry.count}× · ${[...entry.personas].join(", ")}`, "");
    lines.push("```", entry.example.message.slice(0, 2000), "```", "");
  }
  const accepted = jobs.filter((job) => job.outcome === "accepted").length;
  return {
    markdown: lines.join("\n"),
    headline: `${jobs.length} jobs, ${accepted} accepted, ${failed.length} not (${meant.length} more refused on purpose); ${findings.length} other findings.`,
    unanswerable: [...groups.keys(), ...findingGroups.keys()],
  };
}
