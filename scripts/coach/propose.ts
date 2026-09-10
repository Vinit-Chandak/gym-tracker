import { readFileSync } from "node:fs";
import { z } from "zod";

import { programPatchSchema } from "../../src/domain/program-patch";
import { api, args, fail, ServiceError } from "./client";

/**
 * Proposes a change to the programme itself, for the athlete to approve.
 *
 *   npx tsx scripts/coach/propose.ts --user <id> --file /tmp/coach/<id>.proposal.json
 *
 * The file holds a summary, an optional rationale and the patch. The server checks that the
 * patch still applies to the athlete's current programme before storing it, so a proposal
 * that has gone stale is refused here rather than under their thumb weeks later.
 */
const proposal = z.object({
  summary: z.string().trim().min(1).max(300),
  rationale: z.string().trim().max(2000).nullable().optional(),
  patch: programPatchSchema,
});

const a = args();
const user = a.get("user");
const file = a.get("file");
if (!user || !file) fail("Pass --user <id> --file <proposal.json>.");

let raw: unknown;
try {
  raw = JSON.parse(readFileSync(file!, "utf8"));
} catch (error) {
  fail(`Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`);
}
const parsed = proposal.safeParse(raw);
if (!parsed.success) {
  console.error("The proposal file is not valid:");
  for (const issue of parsed.error.issues)
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  process.exit(1);
}

api<{ proposal: { id: string } }>(`users/${user}/proposals`, {
  method: "POST",
  body: parsed.data,
})
  .then((result) => console.log(`Proposed change ${result.proposal.id}, waiting on the athlete.`))
  .catch((error: unknown) => {
    if (error instanceof ServiceError && error.status === 422) {
      console.error(`The programme has moved on: ${error.message}`);
      process.exit(2);
    }
    fail(error);
  });
