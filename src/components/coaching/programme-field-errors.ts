import type { z } from "zod";

/** Use the server schema's bounds, with the error beside the particular field it describes. */
export function programmeFieldError(
  issues: readonly z.core.$ZodIssue[],
  path: readonly (string | number)[],
  scale = 1,
): string | undefined {
  const issue = issues.find((entry) =>
    entry.path.length === path.length
      ? entry.path.every((part, index) => part === path[index])
      : // An inverted range is about its upper end, and is said once.
        path.at(-1) === 1 &&
        entry.path.length === path.length - 1 &&
        entry.path.every((part, index) => part === path[index]),
  );
  if (!issue) return;
  if (issue.code === "invalid_type" && issue.expected === "int") return "Enter a whole number.";
  if (issue.code === "invalid_type" && issue.expected === "number") return "Enter a number.";
  if (issue.code === "too_small" && issue.origin === "number")
    return `Enter ${Number(issue.minimum) / scale} or more.`;
  if (issue.code === "too_big" && issue.origin === "number")
    return `Enter ${Number(issue.maximum) / scale} or less.`;
  return issue.message;
}
