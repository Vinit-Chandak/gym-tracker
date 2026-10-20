// Compare the actual production page manifest with successful screen visits.
import { existsSync } from "node:fs";
import { glob, readFile, readdir, writeFile } from "node:fs/promises";

import { createRouteMatcher, isSuccessfulScreenVisit } from "./audit-route-matcher.mjs";

const output = process.env.AUDIT_OUTPUT_DIR ?? "output/flow-audit";
// The build being served, which may have been made in another checkout (AUDIT_BUILD_DIR). With no
// build here, the pages are listed from this checkout's app directory, as the build lists them.
const manifestPath = `${process.env.AUDIT_BUILD_DIR ?? ".next-audit"}/server/app-paths-manifest.json`;
let manifest;
if (existsSync(manifestPath)) manifest = JSON.parse(await readFile(manifestPath, "utf8"));
else {
  if (process.env.AUDIT_BUILD_DIR) throw new Error(`No build manifest at ${manifestPath}.`);
  console.log(`No build manifest at ${manifestPath}; listing the pages under src/app instead.`);
  manifest = {};
  for await (const file of glob("src/app/**/page.{tsx,ts,jsx,js}"))
    manifest[file.replace(/^src\/app/, "").replace(/\.[jt]sx?$/, "")] = file;
}
const files = (await readdir(output)).filter((name) => /^screens-.*\.json$/.test(name));
const visits = (
  await Promise.all(
    files.map(async (name) => JSON.parse(await readFile(`${output}/${name}`, "utf8"))),
  )
).flat();
const successful = visits.filter(isSuccessfulScreenVisit);
const redirectOnly = new Set(["/", "/runs", "/runs/new", "/welcome/sports"]);
const pages = Object.keys(manifest)
  .filter(
    (path) =>
      path.endsWith("/page") &&
      (process.env.AUDIT_INCLUDE_PREVIEWS === "true" || !path.includes("/(preview)/")) &&
      !path.startsWith("/_"),
  )
  .map((path) => path.replace(/\/\([^/]+\)/g, "").replace(/\/page$/, "") || "/")
  .sort();
const matchTemplate = createRouteMatcher(pages);
const inventory = pages.map((template) => {
  return {
    template,
    cases: [
      ...new Set(
        successful
          .filter((row) => {
            const requested = new URL(row.route, "http://localhost").pathname;
            if (matchTemplate(requested) !== template) return false;
            // A setup guard can redirect to /welcome while the requested screen never renders.
            // Only routes that exist solely as compatibility redirects count that as coverage.
            return (
              redirectOnly.has(template) ||
              template.startsWith("/runs/") ||
              (row.url && matchTemplate(new URL(row.url, "http://localhost").pathname) === template)
            );
          })
          .map((row) => row.route),
      ),
    ],
  };
});
const uncovered = inventory.filter((row) => !row.cases.length).map((row) => row.template);
await writeFile(
  `${output}/route-inventory.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      pages: inventory.length,
      covered: inventory.length - uncovered.length,
      screenVisits: visits.length,
      uncovered,
      inventory,
    },
    null,
    2,
  ),
);
console.log(
  `${inventory.length - uncovered.length}/${inventory.length} page templates have successful screen cases.`,
);
if (uncovered.length) {
  console.error(`Missing: ${uncovered.join(", ")}`);
  process.exitCode = 1;
}
