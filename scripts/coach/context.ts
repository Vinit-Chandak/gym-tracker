import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { api, args, fail } from "./client";

/**
 * Everything the coach may know about one athlete's next session, written to a JSON file.
 *
 *   npx tsx scripts/coach/context.ts --user <id> [--gym <id>] --out /tmp/coach/<id>.json
 *
 * The file is the only thing the planning subagent reads; it never contains another athlete.
 */
const a = args();
const user = a.get("user");
if (!user) fail("Pass --user <id>.");
const out = a.get("out") ?? `/tmp/coach/${user}.json`;
const query = a.get("gym") ? `?gymId=${encodeURIComponent(a.get("gym")!)}` : "";

api<Record<string, unknown>>(`users/${user}/context${query}`)
  .then((context) => {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(context, null, 2));
    const slot = context.slot as { cycleIndex: number; dayIndex: number; name: string } | undefined;
    const gym = context.gym as { id: string; name: string } | undefined;
    const exercises = context.exercises as unknown[] | undefined;
    console.log(
      `Wrote ${out}: ${slot ? `${slot.name} (slot ${slot.cycleIndex}:${slot.dayIndex})` : "?"} at ${gym?.name ?? "?"} (gymId ${gym?.id ?? "?"}), ${exercises?.length ?? 0} slots.`,
    );
  })
  .catch(fail);
