// Compare the actual production page manifest with successful screen visits.
import { readFile, readdir, writeFile } from "node:fs/promises";

const output = process.env.AUDIT_OUTPUT_DIR ?? "output/flow-audit";
const manifest = JSON.parse(await readFile(".next-audit/server/app-paths-manifest.json", "utf8"));
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
