import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium, webkit, devices } from "@playwright/test";
import { assertReadableText } from "./audit-text-readability.mjs";
import { checkFoodLayout } from "./audit-food-layout.mjs";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname))
  throw new Error("Local audit only.");
const output = process.env.AUDIT_OUTPUT_DIR ?? "output/flow-audit";
const fixtures = JSON.parse(await readFile(`${output}/fixtures.json`, "utf8"));
const folder = `${output}/ui-controls`;
await mkdir(folder, { recursive: true });
const results = [];

for (const config of [
  { name: "android", engine: chromium, options: devices["Pixel 7"] },
  { name: "iphone", engine: webkit, options: devices["iPhone 13"] },
].filter((item) => !process.env.AUDIT_DEVICE || item.name === process.env.AUDIT_DEVICE)) {
  const browser = await config.engine.launch({
    executablePath: config.engine === chromium ? process.env.AUDIT_CHROMIUM_PATH : undefined,
  });
  // Keep forced document loads deterministic; food/endurance suites exercise the real SW.
  const context = await browser.newContext({ ...config.options, baseURL, serviceWorkers: "block" });
  let page = await context.newPage();
  page.setDefaultTimeout(15_000);
  let errors = [];
  const recordError = (error) => errors.push(error.message);
  page.on("pageerror", recordError);

  async function visit(path, textSize = 16) {
    if (page.url() !== "about:blank") {
      // A screen sweep needs a fresh document, not cancellation errors from an old
      // document's late prefetch. Check that document before disposing of it, and
      // observe every error on the new page from before its first request.
      assert.deepEqual(errors, [], "Uncaught browser errors before leaving the screen");
      const previous = page;
      const viewport = previous.viewportSize();
      previous.off("pageerror", recordError);
      page = await context.newPage();
      page.setDefaultTimeout(15_000);
      page.on("pageerror", recordError);
      await page.setViewportSize(viewport);
      await previous.close();
    }
    await page.goto(path, { waitUntil: "networkidle" });
    await page.evaluate((size) => {
      document.documentElement.style.fontSize = `${size}px`;
    }, textSize);
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    return page;
  }
  async function login(username) {
    await context.clearCookies();
    await visit("/login");
    await page.getByLabel("Email", { exact: true }).fill(`${username}@local.test`);
    await page.getByLabel("Password", { exact: true }).fill("password123");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/login"));
    await page.waitForLoadState("networkidle");
  }
  async function check(name, run) {
    if (
      process.env.AUDIT_UI_CHECK_FILTER &&
      !new RegExp(process.env.AUDIT_UI_CHECK_FILTER).test(name)
    )
      return;
    errors = [];
    try {
      await run();
      assert.deepEqual(errors, [], "Uncaught browser errors");
      results.push({ device: config.name, name, ok: true });
    } catch (error) {
      results.push({ device: config.name, name, ok: false, error: String(error), errors });
      await page.screenshot({
        animations: "disabled",
        path: `${folder}/${config.name}-${name}-failure.png`,
      });
    }
    console.log(`${config.name}: ${name}: ${results.at(-1).ok ? "PASS" : "FAIL"}`);
  }
  async function noteBounds() {
    const note = page.getByRole("note");
    await note.waitFor();
    return note.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const viewport = visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      return {
        fits:
          rect.left >= left - 1 &&
          rect.right <= left + (viewport?.width ?? innerWidth) + 1 &&
          rect.top >= top - 1 &&
          rect.bottom <= top + (viewport?.height ?? innerHeight) + 1,
        painted: [
          [rect.left + rect.width / 2, rect.top + 5],
          [rect.left + rect.width / 2, rect.bottom - 5],
          [rect.left + 5, rect.top + rect.height / 2],
          [rect.right - 5, rect.top + rect.height / 2],
          [rect.left + rect.width / 2, rect.top + rect.height / 2],
        ].every(([x, y]) => element.contains(document.elementFromPoint(x, y))),
        rect: rect.toJSON(),
      };
    });
  }
  async function chooseAppearance(mode) {
    await page.getByRole("button", { name: /^Appearance/ }).click();
    await page
      .getByRole("dialog", { name: "Appearance", exact: true })
      .getByRole("radio", { name: mode, exact: true })
      .click();
  }

  try {
    await login("vinit");
    await check("headers-and-links-narrow-large-text", async () => {
      await page.setViewportSize({ width: 320, height: 640 });
      await visit("/food", 32);
      await assertReadableText(page.getByRole("heading", { name: "Food", exact: true }));
      await assertReadableText(page.getByText("My foods", { exact: true }));
      await page.screenshot({
        animations: "disabled",
        path: `${folder}/${config.name}-food-header-narrow.png`,
      });
      await visit("/profile/ai-coach", 32);
      await assertReadableText(page.getByRole("heading", { level: 1 }));
      await page
        .getByRole("button", {
          name: "Goals, availability and reports; programme changes and requests",
          exact: true,
        })
        .click();
      for (const title of ["Goals, availability and reports", "Programme changes and requests"]) {
        await assertReadableText(page.getByText(title, { exact: true }));
      }
      await page.screenshot({
        animations: "disabled",
        path: `${folder}/${config.name}-coach-narrow.png`,
      });
      await page
        .getByText("Programme changes and requests", { exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({
        animations: "disabled",
        path: `${folder}/${config.name}-coach-links-narrow.png`,
      });
    });
    await check("programme-narrow-large-text", async () => {
      await page.setViewportSize({ width: 320, height: 640 });
      await visit("/profile/programme", 32);
      await page.locator("details").evaluateAll((elements) =>
        elements.forEach((element) => {
          element.open = true;
        }),
      );
      await assertReadableText(page.getByRole("heading", { level: 1 }));
      await assertReadableText(page.locator("main summary p.font-medium, main a p.font-medium"));
      await page.screenshot({
        animations: "disabled",
        path: `${folder}/${config.name}-programme-top-narrow.png`,
      });
      await page.locator("main summary p.font-medium").first().scrollIntoViewIfNeeded();
      await page.screenshot({
        animations: "disabled",
        path: `${folder}/${config.name}-programme-cycle-narrow.png`,
      });
    });
    await check("food-rows-narrow-large-text", async () => {
      await page.setViewportSize({ width: 320, height: 640 });
      await checkFoodLayout({
        page,
        visit,
        folder,
        device: config.name,
        day: fixtures.populatedFoodDay ?? fixtures.history.to,
      });
    });
    await page.setViewportSize(config.options.viewport);
    await check("coach-heading-large-text", async () => {
      await visit("/profile/ai-coach", 32);
      const lines = await page
        .getByRole("button", { name: "About the AI coach", exact: true })
        .evaluate((button) => {
          const title = button.parentElement.parentElement;
          const text = [...title.childNodes].find(
            (node) => node.nodeType === Node.TEXT_NODE && node.textContent.includes("AI coach"),
          );
          if (!text) throw new Error("AI coach heading not found");
          const range = document.createRange();
          range.selectNode(text);
          return range.getClientRects().length;
        });
      assert.ok(lines <= 2, `AI coach heading broken across ${lines} lines`);
    });
    await check("long-help-large-text", async () => {
      await visit("/profile/ai-coach", 32);
      await page.getByRole("button", { name: "About the AI coach", exact: true }).click();
      const bounds = await noteBounds();
      assert.ok(bounds.fits && bounds.painted, JSON.stringify(bounds));
      await page.screenshot({
        animations: "disabled",
        path: `${folder}/${config.name}-help-large-text.png`,
      });
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("note").count(), 0);
    });
    await check("long-help-short-viewport", async () => {
      await page.setViewportSize({ width: 320, height: 360 });
      await visit("/profile/ai-coach", 32);
      await page.getByRole("button", { name: "About the AI coach", exact: true }).click();
      const bounds = await noteBounds();
      assert.ok(bounds.fits && bounds.painted, JSON.stringify(bounds));
      const scroll = await page.getByRole("note").evaluate((element) => {
        element.scrollTop = element.scrollHeight;
        return {
          scrollable: element.scrollHeight > element.clientHeight,
          scrolled: element.scrollTop > 0,
        };
      });
      assert.ok(!scroll.scrollable || scroll.scrolled, "Long help cannot be scrolled");
      await page.screenshot({
        animations: "disabled",
        path: `${folder}/${config.name}-help-short.png`,
      });
    });
    await page.setViewportSize(config.options.viewport);
    await check("chart-values-large-text", async () => {
      // The body map's figures are named images, on a section of their own (ADR 0046); a graph's
      // plot is hidden from assistive technology, which reads its readout instead. Body weight's
      // graph comes last, for its values.
      for (const route of ["/progress?view=muscles", "/progress?view=body"]) {
        await visit(route, 32);
        const charts = page.locator('svg[role="img"], .graph-plot svg');
        assert.ok((await charts.count()) > 0);
        for (const chart of await charts.all()) {
          await chart.scrollIntoViewIfNeeded();
          const rect = await chart.boundingBox();
          assert.ok(
            rect.x >= -1 &&
              rect.x + rect.width <=
                1 + (await page.evaluate(() => document.documentElement.clientWidth)),
            `Chart leaves viewport on ${route}: ${JSON.stringify(rect)}`,
          );
        }
      }
      const values = page.getByRole("button", { name: /^View values/ }).first();
      await values.click();
      assert.equal(await values.getAttribute("aria-expanded"), "true");
      assert.ok((await page.locator(".graph-values-list li").count()) > 0);
      await assertReadableText(page.locator(".graph-values-list .graph-value-row > span"));
      await page.screenshot({
        animations: "disabled",
        path: `${folder}/${config.name}-chart-values.png`,
      });
    });
    await check("exercise-charts-fit-during-text-size-changes", async () => {
      const exercise = fixtures.exercises.find((entry) => entry.slug === "barbell-bench-press");
      await visit(`/exercises/${exercise.id}`);
      for (const width of [config.options.viewport.width, 320]) {
        await page.setViewportSize({ width, height: 740 });
        for (const size of [32, 16, 24, 32]) {
          // Inspect in the same task as the style change, before ResizeObserver can update.
          const bounds = await page.evaluate((fontSize) => {
            document.documentElement.style.fontSize = `${fontSize}px`;
            return [...document.querySelectorAll('svg[role="img"][width][height]')].map((chart) => {
              const svg = chart.getBoundingClientRect();
              const holder = chart.parentElement.getBoundingClientRect();
              return {
                fits: svg.width <= holder.width + 1 && svg.right <= holder.right + 1,
                width: svg.width,
                available: holder.width,
              };
            });
          }, size);
          assert.ok(bounds.length >= 2, "Expected both the lifetime bars and the session line");
          assert.ok(
            bounds.every((chart) => chart.fits),
            `${width}px/${size}px: ${JSON.stringify(bounds)}`,
          );
        }
      }
    });
    await check("leaderboard-names-at-large-text", async () => {
      const exercise = fixtures.exercises.find((entry) => entry.slug === "barbell-bench-press");
      for (const width of [config.options.viewport.width, 320]) {
        await page.setViewportSize({ width, height: 740 });
        await visit(`/exercises/${exercise.id}`, 32);
        await assertReadableText(
          page.locator('main a[href^="/u/"] > span:first-child > span:last-child > span'),
        );
      }
    });
    await check("native-select-controls", async () => {
      await page.setViewportSize({ width: 320, height: 640 });
      await visit("/training/schedule?sport=swimming", 32);
      const selects = page.locator("select");
      assert.ok((await selects.count()) > 0, "No native select present");
      for (const select of await selects.all()) {
        const data = await select.evaluate((element) => {
          const rect = element.getBoundingClientRect();
          return {
            width: rect.width,
            right: rect.right,
            font: parseFloat(getComputedStyle(element).fontSize),
            viewport: document.documentElement.clientWidth,
            named: element.labels.length > 0 || !!element.getAttribute("aria-label"),
          };
        });
        assert.ok(
          data.named && data.font >= 16 && data.width > 0 && data.right <= data.viewport + 1,
          JSON.stringify(data),
        );
      }
    });
    await check("filter-sheet-short-large-text", async () => {
      await page.setViewportSize({ width: 320, height: 360 });
      await visit("/progress/history", 32);
      await page.getByRole("button", { name: /^Filters:/ }).click();
      const dialog = page.getByRole("dialog", { name: "Filters", exact: true });
      await dialog.waitFor();
      const rect = await dialog.boundingBox();
      assert.ok(
        rect.x >= -1 && rect.x + rect.width <= 321 && rect.y >= -1 && rect.y + rect.height <= 361,
        JSON.stringify(rect),
      );
      for (let index = 0; index < 12; index++) {
        await page.keyboard.press("Tab");
        assert.ok(
          // WebKit can move keyboard focus to browser chrome between cycles, represented
          // by body. No control on the inert page may receive focus behind the modal.
          await dialog.evaluate(
            (element) =>
              document.activeElement === document.body || element.contains(document.activeElement),
          ),
          `Focus escaped to ${await page.evaluate(() => document.activeElement?.outerHTML)}`,
        );
      }
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.getByRole("button", { name: /^Filters:/ }).click();
      await dialog.getByRole("button", { name: "Close sheet", exact: true }).click();
      assert.equal(await page.getByRole("dialog").count(), 0);
    });
    await page.setViewportSize(config.options.viewport);
    await check("appearance-between-tabs", async () => {
      await visit("/profile");
      await chooseAppearance("Light");
      const other = await context.newPage();
      try {
        await other.goto("/profile", { waitUntil: "networkidle" });
        await other.evaluate(() => localStorage.setItem("overload:appearance", "dark"));
        await page.waitForFunction(
          () => document.documentElement.getAttribute("data-overload-mode") === "dark",
        );
        assert.match(await page.getByRole("button", { name: /^Appearance/ }).innerText(), /Dark/);
      } finally {
        await other.close();
      }
      await chooseAppearance("System");
    });
    await check("appearance-with-blocked-storage", async () => {
      await visit("/profile");
      await chooseAppearance("Light");
      await page.evaluate(() => {
        const setItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "overload:appearance")
            throw new DOMException("Storage blocked", "QuotaExceededError");
          return setItem.call(this, key, value);
        };
      });
      await chooseAppearance("Dark");
      assert.match(await page.getByRole("button", { name: /^Appearance/ }).innerText(), /Dark/);
      await page.getByRole("link", { name: "Progress", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/progress");
      await page.getByRole("link", { name: "Profile", exact: true }).click();
      await page.waitForURL((url) => url.pathname === "/profile");
      assert.equal(await page.locator("html").getAttribute("data-overload-mode"), "dark");
      assert.match(await page.getByRole("button", { name: /^Appearance/ }).innerText(), /Dark/);
      await visit("/profile"); // A fresh document restores the original Storage prototype.
    });

    await login("alex");
    await check("resume-touch-target", async () => {
      await visit("/profile");
      const rect = await page.getByRole("link", { name: "Resume", exact: true }).boundingBox();
      assert.ok(rect.width >= 44 && rect.height >= 44, JSON.stringify(rect));
    });
    const alex = fixtures.people.find((person) => person.username === "alex").id;
    const active = fixtures.workouts.find(
      (workout) => workout.userId === alex && !workout.completedAt,
    ).id;
    await check("sheet-help-not-clipped", async () => {
      await visit(`/workouts/${active}`, 32);
      await page.getByRole("button", { name: /^Supersets?$/ }).click();
      await page.getByRole("button", { name: "About supersets", exact: true }).click();
      const bounds = await noteBounds();
      assert.ok(bounds.fits && bounds.painted, JSON.stringify(bounds));
      assert.ok(
        await page.getByRole("note").evaluate((element) => !!element.closest("dialog[open]")),
        "Modal help is outside the active dialog",
      );
      await page.screenshot({
        animations: "disabled",
        path: `${folder}/${config.name}-sheet-help.png`,
      });
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("note").count(), 0);
      assert.equal(await page.getByRole("dialog").count(), 1);
      await page.keyboard.press("Escape");
      assert.equal(await page.getByRole("dialog").count(), 0);
    });
  } finally {
    await browser.close();
  }
}
await writeFile(
  `${folder}/results${process.env.AUDIT_DEVICE ? `-${process.env.AUDIT_DEVICE}` : ""}.json`,
  JSON.stringify(results, null, 2),
);
console.log(
  JSON.stringify({
    passed: results.filter((result) => result.ok).length,
    failed: results.filter((result) => !result.ok).length,
  }),
);
if (results.some((result) => !result.ok)) process.exitCode = 1;
