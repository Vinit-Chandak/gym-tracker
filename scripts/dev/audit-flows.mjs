import { chromium, webkit, devices, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import postgres from "postgres";
import { createServer } from "node:http";
import { Readable } from "node:stream";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const database =
  process.env.AUDIT_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:5432/overload_audit";
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(database).hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(new URL(database).pathname)
)
  throw new Error("Local audit only.");
const fixtures = JSON.parse(await readFile("output/flow-audit/fixtures.json", "utf8"));
const device = process.env.AUDIT_DEVICE ?? "android";
const browser = await (device === "iphone" ? webkit : chromium).launch();
const context = await browser.newContext({
  ...devices[device === "iphone" ? "iPhone 13" : "Pixel 7"],
  baseURL,
});
const page = await context.newPage();
page.setDefaultTimeout(12_000);
const sql = postgres(database, { max: 1 });
const results = [];
const prefix = `Browser audit ${device} ${Date.now()}`;
const userId = fixtures.people.find((p) => p.username === "sam").id;
const path = () => new URL(page.url()).pathname;
const fill = (name, value) => page.locator(`[name="${name}"]`).fill(String(value));
const choose = async (name, value) => {
  const input = page.locator(`input[name="${name}"][value="${value}"]`);
  await input.locator("..").click();
  await expect(input).toBeChecked();
};
// WebKit's offline emulation can reject before a service worker handles navigation.
// Break a real loopback connection instead, while leaving the app server available.
async function offlineNavigation() {
  let disconnected = false;
  const proxy = createServer(async (request, response) => {
    if (disconnected) {
      request.socket.destroy();
      return;
    }
    try {
      const upstream = await fetch(`${baseURL}${request.url}`, { redirect: "manual" });
      const headers = Object.fromEntries(upstream.headers);
      delete headers["content-encoding"];
      delete headers["content-length"];
      delete headers["transfer-encoding"];
      response.writeHead(upstream.status, headers);
      if (upstream.body) Readable.fromWeb(upstream.body).pipe(response);
      else response.end();
    } catch {
      request.socket.destroy();
    }
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${proxy.address().port}`;
  const probeContext = await browser.newContext({
    ...devices[device === "iphone" ? "iPhone 13" : "Pixel 7"],
  });
  try {
    const probe = await probeContext.newPage();
    await probe.goto(`${origin}/login`, { waitUntil: "networkidle" });
    await probe.evaluate(() => navigator.serviceWorker.ready);
    await probe.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    disconnected = true;
    proxy.closeAllConnections();
    await probe.goto(`${origin}/history`, { waitUntil: "domcontentloaded" });
    await expect(probe.getByText(/offline/i).first()).toBeVisible();
    await probe.screenshot({ path: `output/flow-audit/${device}-offline.png` });
    disconnected = false;
    await probe.goto(`${origin}/login`, { waitUntil: "networkidle" });
    await expect(probe.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  } finally {
    await probeContext.close();
    proxy.closeAllConnections();
    await new Promise((resolve) => proxy.close(resolve));
  }
}
async function go(route) {
  await page.goto(route, { waitUntil: "networkidle" });
}
async function login(name) {
  await context.clearCookies();
  await go("/login");
  await page.getByLabel("Email", { exact: true }).fill(`${name}@local.test`);
  await page.getByLabel("Password", { exact: true }).fill("password123");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((url) => url.pathname !== "/login");
}
async function save(label = "Save activity") {
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForURL(/\/training\/activities\/[^/]+$/);
  await page.getByRole("link", { name: "Correct this activity" }).waitFor();
  return path().split("/").at(-1);
}
async function check(name, work) {
  try {
    await work();
    results.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      error: error.stack,
      url: page.url(),
      text: await page
        .locator("body")
        .innerText()
        .catch(() => ""),
    });
    console.log(`FAIL ${name}: ${error.message.split("\n")[0]}`);
    await page
      .screenshot({ path: `output/flow-audit/flow-failure-${device}-${results.length}.png` })
      .catch(() => {});
    await context.setOffline(false);
  }
  await writeFile(`output/flow-audit/flows-${device}.json`, JSON.stringify(results, null, 2));
}
await mkdir("output/flow-audit", { recursive: true });
try {
  await login("sam");
  const ids = {};
  for (const sport of ["running", "cycling", "swimming"]) {
    await check(`${sport}: create an ad hoc activity`, async () => {
      await go(`/training/new?sport=${sport}`);
      await fill("minutes", 30);
      if (sport === "running") await fill("distanceValue", 5);
      if (sport === "cycling") await choose("environment", "indoor");
      if (sport === "swimming") {
        await choose("distanceMethod", "lengths");
        await fill("poolLengthValue", 25);
        await choose("poolLengthUnit", "yd");
        await fill("lengths", 40);
      }
      await fill("title", `${prefix} ${sport}`);
      if (sport === "running") {
        await page.getByRole("button", { name: "Save activity" }).click();
        await expect(
          page.getByText("Rate the effort from 1 to 5, or choose Not sure."),
        ).toBeVisible();
      }
      await choose("effort", "3");
      const id = (ids[sport] = await save());
      const [row] = await sql`select * from activities where id=${id}`;
      expect(row).toMatchObject({
        sport,
        effort_status: "reported",
        occurrence_id: null,
        revision: 1,
      });
      if (sport === "cycling")
        expect(
          (
            await sql`select distance_metres from cycling_activity_details where activity_id=${id}`
          )[0].distance_metres,
        ).toBeNull();
      if (sport === "swimming") await expect(page.getByText(/Elapsed time only/)).toBeVisible();
    });
    await check(`${sport}: edit measurements and notes on the same record`, async () => {
      const id = ids[sport];
      if (!id) throw new Error("Creation did not succeed");
      await go(`/training/activities/${id}/edit`);
      await expect(page.getByRole("button", { name: "Save changes" })).toBeVisible();
      await fill("minutes", 35);
      await fill("notes", "Corrected through the browser");
      if (sport === "cycling") await fill("distanceValue", 0);
      if (sport === "swimming")
        await expect(page.locator('[name="poolLengthUnit"][value="yd"]')).toBeChecked();
      expect(await save("Save changes")).toBe(id);
      const [row] = await sql`select * from activities where id=${id}`;
      expect(row).toMatchObject({
        revision: 2,
        notes: "Corrected through the browser",
        duration_ms: 2100000,
      });
      if (sport === "cycling")
        expect(
          Number(
            (
              await sql`select distance_metres from cycling_activity_details where activity_id=${id}`
            )[0].distance_metres,
          ),
        ).toBe(0);
    });
  }
  await check("Concurrent activity edits reject the stale version", async () => {
    const id = ids.cycling;
    const other = await context.newPage();
    try {
      await go(`/training/activities/${id}/edit`);
      await other.goto(`${baseURL}/training/activities/${id}/edit`, { waitUntil: "networkidle" });
      await fill("minutes", 36);
      await save("Save changes");
      await other.locator('[name="minutes"]').fill("99");
      await other.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(other.getByText(/changed somewhere else/)).toBeVisible();
      expect((await sql`select duration_ms from activities where id=${id}`)[0].duration_ms).toBe(
        2160000,
      );
    } finally {
      await other.close();
    }
  });
  await check(
    "Back follows History → activity → editor, including reload and browser Forward",
    async () => {
      await go("/history?kind=run");
      await page.locator(`a[href="/training/activities/${ids.running}"]`).click();
      await page.waitForURL(`**/training/activities/${ids.running}`);
      await page.getByRole("link", { name: "Correct this activity" }).click();
      await page.waitForURL("**/edit");
      await page.reload({ waitUntil: "networkidle" });
      await page.getByRole("link", { name: /^Back/ }).click();
      await page.waitForURL(`**/training/activities/${ids.running}`);
      await page.getByRole("link", { name: /^Back/ }).click();
      await page.waitForURL("**/history?kind=run");
      await page.goForward();
      await page.waitForURL(`**/training/activities/${ids.running}`);
      expect(await page.evaluate(() => history.state.overloadPreviousPage)).toBe(
        "/history?kind=run",
      );
    },
  );
  await check("Direct entry Back uses a safe parent fallback", async () => {
    const direct = await context.newPage();
    await direct.goto(`${baseURL}/training/activities/${ids.cycling}/edit`, {
      waitUntil: "networkidle",
    });
    await direct.getByRole("link", { name: /^Back/ }).click();
    await expect(direct).toHaveURL(`${baseURL}/training/activities/${ids.cycling}`);
    await direct.close();
  });
  await check(
    "Offline activity survives reconnect and reload, then saves exactly once",
    async () => {
      await go("/training/new?sport=running");
      await fill("minutes", 42);
      await fill("distanceValue", 6);
      await choose("effort", "2");
      await fill("title", `${prefix} offline`);
      const key = await page.locator('[name="submissionKey"]').inputValue();
      await context.setOffline(true);
      await page.getByRole("button", { name: "Save activity" }).click();
      await expect(page.getByText(/could not confirm the save/)).toBeVisible();
      await context.setOffline(false);
      await page.reload({ waitUntil: "networkidle" });
      await expect(page.locator('[name="minutes"]')).toHaveValue("42");
      await expect(page.locator('[name="submissionKey"]')).toHaveValue(key);
      const id = await save();
      expect(
        await sql`select id from activities where user_id=${userId} and title=${`${prefix} offline`}`,
      ).toHaveLength(1);
      expect(
        await page.evaluate(() =>
          Object.keys(localStorage)
            .filter((key) => key.startsWith("overload:activity-draft:"))
            .map((key) => JSON.parse(localStorage.getItem(key)))
            .some((draft) => draft.values.title.endsWith(" offline")),
        ),
      ).toBe(false);
      ids.offline = id;
    },
  );
  let template, occurrence;
  await check(
    "Template sport switch, create, and schedule with the selected revision",
    async () => {
      await go("/training/templates/new");
      await choose("sport", "swimming");
      await expect(page.locator('[name="distanceUnit"][value="m"]')).toBeChecked();
      await fill("name", `${prefix} template`);
      await fill("durationMinMinutes", 30);
      await fill("durationMaxMinutes", 30);
      await fill("distanceMin", 800);
      await fill("distanceMax", 800);
      await page.getByRole("button", { name: "Save template" }).click();
      await page.waitForURL(/\/training\/templates(?:\?|$)/);
      [template] =
        await sql`select * from activity_templates where user_id=${userId} and name=${`${prefix} template`}`;
      expect(template.sport).toBe("swimming");
      await go("/training/schedule");
      await choose("sport", "swimming");
      await page.locator('[name="templateId"]').selectOption(template.id);
      await fill("scheduledOn", "2026-10-01");
      await fill("scheduledLocalTime", "07:15");
      await page.getByRole("button", { name: "Schedule it" }).click();
      await page.waitForURL("**/training/scheduled");
      [occurrence] =
        await sql`select o.*,v.template_revision_id,v.prescription from planned_occurrences o join occurrence_versions v on v.id=o.current_revision_id where o.user_id=${userId} and v.template_revision_id=${template.current_revision_id} order by o.created_at desc limit 1`;
      expect(occurrence.sport).toBe("swimming");
    },
  );
  await check("Editing a template keeps already scheduled targets unchanged", async () => {
    if (!template || !occurrence) throw new Error("Missing scheduled template");
    await go(`/training/templates/${template.id}/edit`);
    await fill("durationMinMinutes", 40);
    await fill("durationMaxMinutes", 40);
    await page.getByRole("button", { name: "Save changes" }).click();
    await page.waitForURL(/\/training\/templates(?:\?|$)/);
    const [current] =
      await sql`select current_revision_id from activity_templates where id=${template.id}`;
    expect(current.current_revision_id).not.toBe(template.current_revision_id);
    const [version] =
      await sql`select v.prescription from planned_occurrences o join occurrence_versions v on v.id=o.current_revision_id where o.id=${occurrence.id}`;
    expect(version.prescription).toEqual(occurrence.prescription);
  });
  await check("Scheduled session skips, reopens and moves without changing identity", async () => {
    if (!occurrence) throw new Error("Missing occurrence");
    await go(`/training/programme/occurrences/${occurrence.id}`);
    await page.getByRole("button", { name: "Skip this session" }).click();
    await page.getByRole("button", { name: "Put it back" }).click();
    await expect(page.getByRole("button", { name: "Skip this session" })).toBeVisible();
    await fill("scheduledOn", "2026-10-02");
    await page.getByRole("button", { name: "Move it", exact: true }).click();
    await expect(page.getByText(/Moved from/)).toBeVisible();
    const [row] =
      await sql`select o.*,v.scheduled_on from planned_occurrences o join occurrence_versions v on v.id=o.current_revision_id where o.id=${occurrence.id}`;
    expect(row.disposition).toBe("pending");
    expect(new Date(row.scheduled_on).toISOString().slice(0, 10)).toBe("2026-10-02");
  });
  await check(
    "Ad hoc log leaves a scheduled session pending; linked log settles only it",
    async () => {
      if (!occurrence) throw new Error("Missing occurrence");
      await go("/training/new?sport=swimming");
      await fill("minutes", 20);
      await choose("effort", "unsure");
      await save();
      expect(
        await sql`select id from activities where occurrence_id=${occurrence.id}`,
      ).toHaveLength(0);
      await go(`/training/new?occurrence=${occurrence.id}`);
      await expect(page.locator('[name="minutes"]')).toHaveValue("");
      await fill("minutes", 30);
      await choose("effort", "3");
      ids.scheduled = await save();
      expect(
        (await sql`select occurrence_id from activities where id=${ids.scheduled}`)[0]
          .occurrence_id,
      ).toBe(occurrence.id);
      await go(`/training/new?occurrence=${occurrence.id}`);
      await expect(page.getByText(/already logged/i).first()).toBeVisible();
    },
  );
  await check(
    "Deleting a linked activity removes projections and makes the same session loggable",
    async () => {
      if (!ids.scheduled) throw new Error("Missing linked log");
      await go(`/training/activities/${ids.scheduled}`);
      await page.getByRole("button", { name: "Delete activity", exact: true }).click();
      await page.getByRole("button", { name: "Tap again to delete" }).click();
      await page.waitForURL("**/history");
      expect(await sql`select id from activities where id=${ids.scheduled}`).toHaveLength(0);
      await go(`/training/new?occurrence=${occurrence.id}`);
      await expect(page.getByRole("button", { name: "Save activity" })).toBeVisible();
    },
  );
  await check("Foreign records, templates and occurrences are not exposed", async () => {
    const owner = fixtures.people.find((p) => p.username === "vinit").id;
    const activity = fixtures.activities.find((a) => a.userId === owner && a.sport === "cycling");
    const foreignTemplate = fixtures.templates.find((a) => a.userId === owner);
    const foreignOccurrence = fixtures.occurrences.find((a) => a.userId === owner);
    for (const route of [
      `/training/activities/${activity.id}`,
      `/training/activities/${activity.id}/edit`,
      `/training/templates/${foreignTemplate.id}/edit`,
      `/training/programme/occurrences/${foreignOccurrence.id}`,
      `/training/new?occurrence=${foreignOccurrence.id}`,
    ]) {
      await go(route);
      await expect(page.getByRole("heading", { name: "Nothing here", exact: true })).toBeVisible();
    }
  });
  await check("Malformed dates and occurrence links fail safely", async () => {
    await go("/progress?week=9999-99-99");
    await expect(page.getByRole("heading", { name: "Progress", exact: true })).toBeVisible();
    await expect(page.getByText(/That week is not a valid date/)).toBeVisible();
    await go("/training/new?occurrence=not-a-uuid&sport=running");
    await expect(page.getByRole("heading", { name: "Nothing here", exact: true })).toBeVisible();
  });
  await check(
    "Sport sharing removes projections immediately and restores only consented history",
    async () => {
      await go("/profile/privacy");
      const cycling = page.getByRole("switch", {
        name: "Share cycling with followers",
        exact: true,
      });
      const global = page.getByRole("switch", {
        name: "Share training with followers",
        exact: true,
      });
      const originallyShared = (await cycling.getAttribute("aria-checked")) === "true";
      const set = async (control, value) => {
        if ((await control.getAttribute("aria-checked")) !== String(value)) {
          await control.click();
          await expect(control).toBeEnabled();
          await expect(control).toHaveAttribute("aria-checked", String(value));
        }
      };
      const sharedCount = async () =>
        Number(
          (
            await sql`select count(*)::int count from shared_session_stats where user_id=${userId} and sport='cycle'`
          )[0].count,
        );
      try {
        await set(global, true);
        await set(cycling, false);
        expect(await sharedCount()).toBe(0);
        await set(cycling, true);
        expect(await sharedCount()).toBeGreaterThan(0);
        await set(global, false);
        expect(await sharedCount()).toBe(0);
        await set(global, true);
        expect(await sharedCount()).toBeGreaterThan(0);
      } finally {
        await set(global, true);
        await set(cycling, originallyShared);
      }
    },
  );
  await check("Install prompt captured on Today remains available in Profile", async () => {
    await go("/today");
    await page.evaluate(() => {
      window.__auditPrompted = false;
      const event = new Event("beforeinstallprompt", { cancelable: true });
      event.prompt = async () => {
        window.__auditPrompted = true;
      };
      window.dispatchEvent(event);
    });
    await page.getByRole("link", { name: "Profile", exact: true }).click();
    await page.waitForURL("**/profile");
    await page.getByRole("button", { name: /^Install / }).click();
    expect(await page.evaluate(() => window.__auditPrompted)).toBe(true);
    await page.getByRole("button", { name: /^Install / }).click();
    await expect(page.getByText("iPhone and iPad", { exact: true })).toBeVisible();
  });
  await check(
    "PWA manifest, icon assets, private cache boundary and offline navigation",
    async () => {
      await go("/profile");
      const manifest = await (await context.request.get("/manifest.webmanifest")).json();
      expect(manifest.display).toBe("standalone");
      expect(manifest.start_url).toBe("/today");
      for (const icon of manifest.icons)
        expect((await context.request.get(icon.src)).ok()).toBe(true);
      await page.evaluate(() => navigator.serviceWorker.ready);
      const cached = await page.evaluate(async () =>
        (
          await Promise.all(
            (await caches.keys()).map(async (key) =>
              (await (await caches.open(key)).keys()).map(
                (request) => new URL(request.url).pathname,
              ),
            ),
          )
        ).flat(),
      );
      expect(
        cached.every(
          (entry) =>
            entry.startsWith("/_next/static/") ||
            entry.startsWith("/icons/") ||
            entry === "/offline.html",
        ),
      ).toBe(true);
      if (device === "iphone") await offlineNavigation();
      else {
        await context.setOffline(true);
        await page.goto("/history", { waitUntil: "domcontentloaded" });
        await expect(page.getByText(/offline/i).first()).toBeVisible();
        await context.setOffline(false);
        await page.reload({ waitUntil: "networkidle" });
        await expect(page.getByRole("heading", { name: "History", exact: true })).toBeVisible();
      }
    },
  );
} finally {
  await browser.close();
  await sql.end();
}
const failed = results.filter((result) => !result.passed);
console.log(`${results.length - failed.length}/${results.length} flows passed.`);
if (failed.length) process.exitCode = 1;
