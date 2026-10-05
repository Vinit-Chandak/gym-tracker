/**
 * Bundles the equipment drawings (plan: discovery and recognition) into one module the server
 * reads, so no drawing reaches the client bundle and none depends on files at run time.
 *
 *   npx tsx scripts/equipment-art.ts           # writes src/components/equipment-art/drawings.generated.ts
 *   npx tsx scripts/equipment-art.ts --check   # fails when that module is out of date
 *
 * The vector sources stay in `src/components/equipment-art/svg/`, named by permanent slug, for
 * the native apps; `drawings.test.ts` checks every one against the drawing spec.
 */
import { readFile, writeFile } from "node:fs/promises";

import { DRAWINGS_MODULE, renderDrawingsModule } from "../src/components/equipment-art/build";

async function main() {
  const rendered = await renderDrawingsModule();
  if (process.argv.includes("--check")) {
    const current = await readFile(DRAWINGS_MODULE, "utf8").catch(() => "");
    if (current !== rendered) {
      console.error(`${DRAWINGS_MODULE} is out of date: run npx tsx scripts/equipment-art.ts`);
      process.exit(1);
    }
    return;
  }
  await writeFile(DRAWINGS_MODULE, rendered);
  console.log(`Wrote ${DRAWINGS_MODULE}.`);
}

void main();
