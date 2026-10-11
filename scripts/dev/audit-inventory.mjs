// Compare the actual production page manifest with successful screen visits.
import { existsSync } from "node:fs";
import { glob, readFile, readdir, writeFile } from "node:fs/promises";

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
const successful = visits.filter(
  (row) => !row.error && row.status < 400 && !row.unexpectedNotFound && !row.unexpectedDestination,
);
const pages = Object.keys(manifest)
  .filter(
    (path) => path.endsWith("/page") && !path.includes("/(preview)/") && !path.startsWith("/_"),
  )
  .map((path) => path.replace(/\/\([^/]+\)/g, "").replace(/\/page$/, "") || "/")
  .sort();
const inventory = pages.map((template) => {
  const matcher = new RegExp(
    `^${template
      .split("/")
      .map((part) =>
        part.startsWith("[...")
          ? ".+"
          : part.startsWith("[")
            ? "[^/]+"
            : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      )
      .join("/")}$`,
  );
  return {
    template,
    cases: [
      ...new Set(
        successful
          .filter((row) => matcher.test(new URL(row.route, "http://localhost").pathname))
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
