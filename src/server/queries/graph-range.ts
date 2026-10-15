import { cookies } from "next/headers";

import {
  chooseRange,
  DEFAULT_RANGE_PRESET,
  parseRangePreset,
  type RangeChoice,
  type RangePreset,
} from "@/domain/graph-range";
import { GRAPH_RANGE_COOKIE } from "@/lib/graph-range";

/** The span this browser last chose for its graphs, or a month (ADR 0042). */
export async function rememberedRange(): Promise<RangePreset> {
  try {
    return (
      parseRangePreset((await cookies()).get(GRAPH_RANGE_COOKIE)?.value) ?? DEFAULT_RANGE_PRESET
    );
  } catch {
    // Outside a request (a script, a test) there is no cookie to read.
    return DEFAULT_RANGE_PRESET;
  }
}

/** What a page's graphs are drawn over: dates in its URL, else the span remembered. */
export async function readRangeChoice(
  params: Record<string, string | string[] | undefined>,
  today: string,
): Promise<{ choice: RangeChoice; error: string | null }> {
  const value = (key: string) => (typeof params[key] === "string" ? params[key] : undefined);
  return chooseRange(await rememberedRange(), { from: value("from"), to: value("to") }, today);
}
