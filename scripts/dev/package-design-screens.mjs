// Build an offline, portable screenshot catalogue. Capture scripts run separately.
import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";

const root = resolve(process.env.AUDIT_OUTPUT_DIR ?? "output/design-revamp-iphone17-2026-09-30");
const bundle = join(root, "bundle");
const records = [];
const notes = [];
const sourceCommit = execFileSync(
  "git",
  ["-c", "safe.directory=" + process.cwd().replaceAll("\\", "/"), "rev-parse", "HEAD"],
  { encoding: "utf8" },
).trim();
const parse = async (path) => JSON.parse(await readFile(join(root, path), "utf8"));
const badScreen = (row) =>
  row.error ||
  row.status >= 400 ||
  row.unexpectedDestination ||
  row.unexpectedNotFound ||
  row.overflow ||
  row.errors?.length ||
  row.accessibility?.length;

for (const [theme, file] of [
  ["light", "screens-iphone17.json"],
  ["dark", "screens-iphone17-dark.json"],
]) {
  const rows = await parse(file);
  assert.ok(rows.length > 0, "No screens in " + file);
  for (const row of rows) {
    assert.ok(!badScreen(row), "Screen capture failed: " + JSON.stringify(row));
    assert.ok(row.screenshots?.viewport && row.screenshots?.page, "Missing screenshot paths");
    records.push({
      kind: "Page",
      theme,
      persona: row.persona,
      title: row.title,
      route: row.route,
      actualRoute: new URL(row.url).pathname + new URL(row.url).search,
      sourceViewport: row.screenshots.viewport,
      sourcePage: row.screenshots.page,
      fullPage: row.screenshotFullPage,
    });
  }
}
for (const [kind, file] of [
  ["Overlay", "overlays/manifest.json"],
  ["State", "states/manifest.json"],
]) {
  const manifest = await parse(file);
  const rows = Array.isArray(manifest) ? manifest : (manifest.results ?? manifest.captures);
  assert.ok(Array.isArray(rows), "Missing results in " + file);
  if (manifest.notes)
    notes.push(...[].concat(manifest.notes).map((note) => kind + " captures: " + note));
  for (const row of rows) {
    if (!row.screenshot) {
      assert.ok(
        !row.error || row.unavailable || row.skipped,
        "Failed state: " + JSON.stringify(row),
      );
      notes.push(row.title + ": " + (row.notes ?? row.reason ?? "Unavailable on this build"));
      continue;
    }
    assert.ok(row.passed !== false && !row.error, "Failed state: " + JSON.stringify(row));
    records.push({
      kind,
      theme: row.theme,
      persona: row.persona,
      title: row.title ?? row.name,
      route: row.route,
      actualRoute: row.actualRoute ?? row.route,
      sourceViewport: row.screenshot,
      sourcePage: row.fullPageScreenshot,
      fullPage: Boolean(row.fullPageScreenshot),
      notes: row.notes,
    });
  }
}
// Refuse to mix an earlier package with this one. A failed partial package can be inspected.
await mkdir(bundle);
function category(route) {
  const path = String(route ?? "");
  if (/^\/(profile\/friends|u\/)/.test(path)) return "People";
  if (/^\/(profile\/programme|training\/programme)/.test(path)) return "Programme";
  if (path.startsWith("/welcome")) return "Onboarding";
  if (path.startsWith("/food")) return "Food";
  if (path.startsWith("/progress")) return "Progress";
  if (path.startsWith("/workouts")) return "Workout";
  if (path.startsWith("/training")) return "Training";
  if (/^\/(gyms|exercises)/.test(path)) return "Gyms and exercises";
  if (path.startsWith("/profile")) return "Profile";
  if (/^\/(login|signup|forgot|reset)/.test(path)) return "Account";
  if (path.startsWith("/runs")) return "Legacy links";
  return "Today and other";
}
const slug = (text) =>
  String(text ?? "screen")
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70)
    .toLowerCase();
let imageCount = 0;
let imageBytes = 0;
async function asset(source, destination, viewport) {
  const input = resolve(root, source);
  const inside = relative(root, input);
  assert.ok(
    inside &&
      !isAbsolute(inside) &&
      !inside.startsWith(".." + sep) &&
      inside !== ".." &&
      !resolve(input).startsWith(bundle + sep),
    "Unsafe screenshot path",
  );
  const bytes = await readFile(input);
  assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a", "Not a PNG: " + source);
  const dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (viewport)
    assert.deepEqual(
      dimensions,
      { width: 1206, height: 2622 },
      "Wrong phone dimensions: " + source,
    );
  const target = join(bundle, destination);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(input, target);
  imageCount += 1;
  imageBytes += bytes.length;
  return dimensions;
}
for (const [index, record] of records.entries()) {
  record.id = index + 1;
  record.category = category(record.route);
  const name =
    String(record.id).padStart(3, "0") + "-" + slug(record.title) + "-" + slug(record.persona);
  const folder = "images/" + record.theme + "/" + record.kind.toLowerCase();
  record.viewport = folder + "/" + name + "-phone.png";
  record.dimensions = await asset(record.sourceViewport, record.viewport, true);
  if (record.sourcePage) {
    record.page = folder + "/" + name + "-page.png";
    record.pageDimensions = await asset(record.sourcePage, record.page, false);
  }
  delete record.sourceViewport;
  delete record.sourcePage;
}
const metadata = {
  createdAt: new Date().toISOString(),
  sourceCommit,
  device: "iPhone 17 — edge-to-edge app canvas",
  browser: "Playwright WebKit",
  cssViewport: { width: 402, height: 874 },
  devicePixelRatio: 3,
  pngViewport: { width: 1206, height: 2622 },
  fontSize: 16,
  captures: records.length,
  imageCount,
  imageBytes,
  notes: [
    ...new Set(notes.map((note) => (typeof note === "string" ? note : JSON.stringify(note)))),
  ],
  records,
};
await writeFile(join(bundle, "manifest.json"), JSON.stringify(metadata, null, 2));
const csv = (values) =>
  values.map((value) => '"' + String(value ?? "").replaceAll('"', '""') + '"').join(",");
await writeFile(
  join(bundle, "screens.csv"),
  [
    csv([
      "ID",
      "Theme",
      "Category",
      "Type",
      "Persona",
      "Title",
      "Requested route",
      "Actual route",
      "Phone PNG",
      "Page PNG",
    ]),
    ...records.map((r) =>
      csv([
        r.id,
        r.theme,
        r.category,
        r.kind,
        r.persona,
        r.title,
        r.route,
        r.actualRoute,
        r.viewport,
        r.page,
      ]),
    ),
  ].join("\r\n"),
);
const escape = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const options = (values) =>
  values
    .map((value) => '<option value="' + escape(value) + '">' + escape(value) + "</option>")
    .join("");
const cards = records
  .map((r) =>
    [
      '<article data-theme="' +
        r.theme +
        '" data-category="' +
        escape(r.category) +
        '" data-kind="' +
        r.kind +
        '" data-search="' +
        escape([r.title, r.route, r.persona, r.category].join(" ").toLowerCase()) +
        '">',
      '<a class="preview" href="' +
        r.viewport +
        '" target="_blank" rel="noopener"><img loading="lazy" width="402" height="874" src="' +
        r.viewport +
        '" data-phone="' +
        r.viewport +
        '" data-page="' +
        (r.page ?? r.viewport) +
        '" alt="' +
        escape(r.title) +
        '"></a>',
      "<h2>" + r.id + ". " + escape(r.title) + "</h2>",
      '<p class="meta">' + escape(r.theme + " · " + r.persona + " · " + r.kind) + "</p>",
      "<p>" + escape(r.route) + "</p>",
      '<p><a href="' +
        r.viewport +
        '">Phone PNG</a>' +
        (r.page
          ? ' · <a href="' + r.page + '">' + (r.fullPage ? "Full page" : "Page capture") + "</a>"
          : "") +
        "</p>",
      r.notes ? '<p class="meta">' + escape([].concat(r.notes).join(" ")) + "</p>" : "",
      "</article>",
    ].join("\n"),
  )
  .join("\n");
await writeFile(
  join(bundle, "index.html"),
  [
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Overload — iPhone 17 design reference</title>',
    "<style>body{font:16px/1.5 system-ui;margin:0;background:#f3f4f3;color:#17211d}header{position:sticky;top:0;z-index:1;background:#fff;padding:18px 24px;border-bottom:1px solid #ccd2ce}h1{font-size:24px;margin:0}header p{margin:4px 0 12px}.filters{display:flex;flex-wrap:wrap;gap:12px}label{display:flex;align-items:center;gap:6px}input,select{font:inherit;padding:7px;border:1px solid #88968e;border-radius:5px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:22px;padding:24px}article{min-width:0;background:#fff;border:1px solid #cbd4ce;padding:12px;border-radius:10px}article[hidden]{display:none}img{display:block;width:100%;height:390px;object-fit:contain;object-position:top;background:#e5e9e6}h2{font-size:16px;line-height:1.35;margin:12px 0 4px}p{overflow-wrap:anywhere;margin:5px 0;font-size:13px}.meta{color:#53635b}a{color:#285f46}footer{padding:24px}</style></head><body>",
    '<header><h1>Overload · iPhone 17 design reference</h1><p>Normal 16 px text · 402 × 874 CSS canvas · 1206 × 2622 phone PNGs · no Safari or system chrome</p><div class="filters">',
    '<label>Search <input id="search" type="search" placeholder="Screen, route or persona"></label>',
    '<label>Theme <select id="theme"><option value="light">light</option><option value="dark">dark</option><option value="">Both</option></select></label>',
    '<label>Section <select id="category"><option value="">All</option>' +
      options([...new Set(records.map((r) => r.category))].sort()) +
      "</select></label>",
    '<label>Type <select id="kind"><option value="">All</option>' +
      options([...new Set(records.map((r) => r.kind))]) +
      "</select></label>",
    '<label>Image <select id="view"><option value="phone">Phone viewport</option><option value="page">Full page where available</option></select></label>',
    '</div><p id="count" aria-live="polite"></p></header><main>' + cards + "</main>",
    '<footer>See <a href="README.md">README</a>, <a href="screens.csv">screen index CSV</a> and <a href="manifest.json">manifest</a> for scope and metadata. Captures use synthetic local data and WebKit emulation.</footer>',
    "<script>const cards=[...document.querySelectorAll('article')];const ids=['search','theme','category','kind','view'];const controls=Object.fromEntries(ids.map(id=>[id,document.getElementById(id)]));function update(){let count=0;for(const card of cards){const d=card.dataset;card.hidden=Boolean((controls.theme.value&&d.theme!==controls.theme.value)||(controls.category.value&&d.category!==controls.category.value)||(controls.kind.value&&d.kind!==controls.kind.value)||!d.search.includes(controls.search.value.toLowerCase()));if(!card.hidden)count++;const img=card.querySelector('img');const src=img.dataset[controls.view.value];if(img.getAttribute('src')!==src)img.setAttribute('src',src);card.querySelector('.preview').href=src;}document.getElementById('count').textContent=count+' of '+cards.length+' captures shown';}for(const control of Object.values(controls))control.addEventListener('input',update);update();</script></body></html>",
  ].join("\n"),
);
await writeFile(
  join(bundle, "README.md"),
  [
    "# Overload — iPhone 17 design screenshots",
    "",
    "Open index.html after extracting the ZIP. Filter by screen, route, theme, section or capture type. Click an image to open its original PNG.",
    "",
    "- " + records.length + " captured page/overlay/form states; " + imageCount + " PNGs.",
    "- Normal 16 px text. Portrait app canvas: 402 × 874 CSS pixels at 3×, yielding 1206 × 2622 phone images.",
    "- Full-page PNGs are included where supported. Phone PNGs retain a uniform size for importing into a design tool.",
    "- " +
      records.filter((record) => record.kind === "Page" && !record.fullPage).length +
      " very tall list captures keep the first viewport in both files to stay below the 32,000-pixel browser capture limit. These are marked fullPage: false in manifest.json and Page capture in the index.",
    "- Light and dark themes; populated, imperial, minimal-history and onboarding personas.",
    "- WebKit emulation of app content, without Safari controls, status bar, Dynamic Island or physical-device chrome. These are not camera captures of a physical iPhone.",
    "- Apple's iPhone 17 panel specification: https://www.apple.com/iphone-17/specs/ (1206 × 2622 pixels). The 402 × 874 canvas uses a 3× scale.",
    "- Application source checkout: " +
      sourceCommit +
      ". The capture scripts do not change the application's design.",
    "- Screens use the synthetic 56-month local dataset. The first seed was anchored on 29 September 2026; anchored food views preserve populated examples.",
    "- Root and legacy run URLs intentionally capture their destinations. Unavailable previews and native OS popup limits are recorded below.",
    "- screens.csv maps images to routes and personas; manifest.json includes exact dimensions and metadata. No database dump, auth session or fixture credentials are included.",
    "",
    "## Availability notes",
    "",
    ...metadata.notes.map((note) => "- " + note),
    "",
  ].join("\n"),
);
console.log(
  JSON.stringify(
    {
      bundle,
      captures: records.length,
      imageCount,
      imageBytes,
      manifests: [basename("manifest.json"), basename("screens.csv")],
    },
    null,
    2,
  ),
);
