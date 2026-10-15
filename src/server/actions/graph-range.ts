"use server";

import { cookies } from "next/headers";

import { parseRangePreset } from "@/domain/graph-range";
import { GRAPH_RANGE_COOKIE } from "@/lib/graph-range";

/**
 * Remembers the span every graph is drawn over (ADR 0042). A preference of this browser's,
 * like its appearance, so it lives in a cookie rather than on the account: nothing else reads
 * it. Setting a cookie in an action drops every page the browser was holding, so no section
 * shows a copy drawn in the old span.
 */
export async function chooseGraphRangeAction(value: string): Promise<void> {
  const preset = parseRangePreset(value);
  if (!preset) return;
  (await cookies()).set(GRAPH_RANGE_COOKIE, preset, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 400,
  });
}
