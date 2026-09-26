import assert from "node:assert/strict";
import { scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium, webkit, devices, expect } from "@playwright/test";
import postgres from "postgres";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3101";
const database =
  process.env.AUDIT_DATABASE_URL ??
  "postgres://postgres:postgres@127.0.0.1:5432/overload_audit_56months";
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(database).hostname) ||
  new URL(database).search !== "" ||
  new URL(database).hash !== "" ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(new URL(database).pathname)
)
  throw new Error("Local audit only.");
const output = `${process.env.AUDIT_OUTPUT_DIR ?? "output/audit-56-months"}/accounts`;
await mkdir(output, { recursive: true });
const sql = postgres(database, { max: 1 });
const results = [];
const runtimeErrors = [];
const password = "AuditAccount123!";
const newPassword = "UpdatedAudit123!";
const requests = new WeakMap();
async function settle(page) {
  const network = requests.get(page);
  const deadline = Date.now() + 20_000;
  while (network.active.size || Date.now() - network.changedAt < 750) {
    if (Date.now() > deadline)
      throw new Error(
        `Page requests did not settle: ${[...network.active].map((request) => request.url()).join(", ")}`,
      );
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const go = async (page, route) => {
  // A hard navigation must not cancel the previous page's in-flight RSC prefetches in WebKit.
  await settle(page);
  await page.waitForLoadState("networkidle");
  await page.goto(route, { waitUntil: "networkidle" });
};
const reload = async (page) => {
  await settle(page);
  await page.reload({ waitUntil: "networkidle" });
};
const button = (page, name) => page.getByRole("button", { name, exact: true });
const choose = async (page, name, value) => {
  const radio = page.locator(`input[name="${name}"][value="${value}"]`);
  await radio.locator("..").click();
  await expect(radio).toBeChecked();
};
const checkWidth = async (page) => {
  const width = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
  }));
  assert.ok(width.document <= width.viewport + 1, `Page overflows: ${JSON.stringify(width)}`);
};
async function signup(page, account, gym = true) {
  await go(page, "/signup");
  await page.getByLabel("Name", { exact: true }).fill(account.name);
  await page.getByLabel("Username", { exact: true }).fill(account.username);
  await page.getByLabel("Email", { exact: true }).fill(account.email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await button(page, "Create account").click();
  await page.waitForURL(/\/welcome$/);
  await expect(page.getByLabel("What should we call you?")).toHaveValue(account.name);
  await page.getByLabel("Weight units").selectOption("lb");
  await page.getByLabel("Time zone", { exact: true }).fill("America/New_York");
  await button(page, "Continue").click();
  await page.waitForURL(/\/welcome\/sports$/);
  if (!gym) await button(page, "Strength").click();
  await button(page, "Continue").click();
  if (gym) {
    await page.waitForURL(/\/welcome\/gym$/);
    await page.getByLabel("Name", { exact: true }).fill(`${account.username} first gym`);
    await button(page, "Add gym").click();
    await page.waitForURL(/\/welcome\/equipment\?gym=/);
    await page.getByRole("checkbox", { name: "Chest press machine", exact: true }).check();
    await button(page, "Add and continue").click();
  }
  await page.waitForURL(/\/welcome\/programme$/);
  await button(page, "I'll train without a programme").click();
  await page.waitForURL(/\/today$/);
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
}
async function deleteInUi(page) {
  await go(page, "/profile/delete-account");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await button(page, "Delete everything").scrollIntoViewIfNeeded();
  await settle(page);
  await button(page, "Delete everything").click();
  await page.waitForURL(/\/login\?deleted=1$/);
}

async function runDevice(device) {
  const browser = await (device === "iphone" ? webkit : chromium).launch({
    executablePath: device === "iphone" ? undefined : process.env.AUDIT_CHROMIUM_PATH,
  });
  const contexts = [];
  const accounts = [];
  const freshPage = async () => {
    const context = await browser.newContext({
      ...devices[device === "iphone" ? "iPhone 13" : "Pixel 7"],
      baseURL,
      timezoneId: "America/New_York",
    });
    contexts.push(context);
    const page = await context.newPage();
    const network = { active: new Set(), changedAt: 0 };
    requests.set(page, network);
    page.on("request", (request) => {
      network.active.add(request);
      network.changedAt = Date.now();
    });
    const finished = (request) => {
      network.active.delete(request);
      network.changedAt = Date.now();
    };
    page.on("requestfinished", finished);
    page.on("requestfailed", finished);
    page.setDefaultTimeout(20_000);
    page.on("pageerror", (error) =>
      runtimeErrors.push({ device, url: page.url(), message: error.message }),
    );
    return page;
  };
  const makeAccount = (suffix) => {
    const username = `auditac${device[0]}${Date.now().toString(36)}${suffix}`;
    const account = {
      username,
      email: `${username}@local.test`,
      name: `Alexandra ${suffix} — strength, swimming and everyday wellbeing`,
    };
    accounts.push(account);
    return account;
  };
  const page = await freshPage();
  const account = makeAccount("a");
  const step = async (name, work, current = page) => {
    try {
      await work();
      await settle(current);
      await checkWidth(current);
      await current.screenshot({ path: `${output}/${device}-${name}.png`, fullPage: true });
      results.push({ device, name, passed: true });
      console.log(`PASS ${device} ${name}`);
    } catch (error) {
      const failure = {
        device,
        name,
        passed: false,
        message: error.stack,
        url: current.url(),
        text: await current
          .locator("body")
          .innerText()
          .catch(() => ""),
      };
      results.push(failure);
      await current
        .screenshot({ path: `${output}/${device}-${name}-failure.png`, fullPage: true })
        .catch(() => {});
      console.error(`FAIL ${device} ${name}: ${error.message.split("\n")[0]}`);
      throw error;
    }
  };
  try {
    await step("signup-onboarding-imperial", async () => {
      await signup(page, account);
      const [profile] =
        await sql`select id, preferred_unit, time_zone, onboarded_at from profiles where username = ${account.username}`;
      assert.equal(profile.preferred_unit, "lb");
      assert.equal(profile.time_zone, "America/New_York");
      assert.ok(profile.onboarded_at);
      account.id = profile.id;
      const [machine] =
        await sql`select unit from equipment_instances where user_id = ${account.id}`;
      assert.equal(machine.unit, "lb");
    });
    await step("profile-validation-conversion-and-save", async () => {
      await go(page, "/profile/edit");
      await page.getByLabel("Body weight (lb)", { exact: true }).fill("170");
      await page.getByLabel("Feet", { exact: true }).fill("5");
      await page.getByLabel("Inches", { exact: true }).fill("10");
      await page.getByLabel("Date of birth", { exact: true }).fill("1994-06-15");
      await page.getByLabel("Training goal", { exact: true }).selectOption("get_stronger");
      await page.getByLabel("Time zone", { exact: true }).fill("Invalid/Time_Zone");
      await button(page, "Save").click();
      await expect(page.getByRole("alert").first()).toBeVisible();
      await expect(page.getByLabel("Body weight (lb)", { exact: true })).toHaveValue("170");
      await expect(page.getByLabel("Date of birth", { exact: true })).toHaveValue("1994-06-15");
      await page.getByLabel("Time zone", { exact: true }).fill("America/New_York");
      await choose(page, "preferredUnit", "kg");
      assert.ok(
        Math.abs(
          Number(await page.getByLabel("Body weight (kg)", { exact: true }).inputValue()) - 77.1,
        ) < 0.1,
      );
      assert.ok(
        Math.abs(
          Number(await page.getByLabel("Height (cm)", { exact: true }).inputValue()) - 177.8,
        ) < 0.1,
      );
      await choose(page, "preferredUnit", "lb");
      await button(page, "Save").click();
      await expect(page.getByRole("status").filter({ hasText: "Profile saved" })).toHaveCount(1);
      await reload(page);
      assert.ok(
        Math.abs(
          Number(await page.getByLabel("Body weight (lb)", { exact: true }).inputValue()) - 170,
        ) < 0.2,
      );
      const [profile] =
        await sql`select body_weight_kg, height_cm, training_goal from profiles where id = ${account.id}`;
      assert.ok(Math.abs(Number(profile.body_weight_kg) - 77.11) < 0.05);
      assert.equal(Number(profile.height_cm), 177.8);
      assert.equal(profile.training_goal, "get_stronger");
    });
    let gymPath;
    await step("gym-create-edit-and-default", async () => {
      await go(page, "/gyms/new");
      await page
        .getByLabel("Name", { exact: true })
        .fill("Long neighbourhood gym name with room for strength and recovery");
      await page
        .getByLabel("Address", { exact: true })
        .fill("Unit 12, Second Floor, Community Sports Centre");
      await page
        .getByLabel("Notes", { exact: true })
        .fill("Weekend access; entrance beside the swimming pool.");
      await button(page, "Create gym").click();
      await page.waitForURL(/\/gyms\/[0-9a-f-]{36}$/);
      gymPath = new URL(page.url()).pathname;
      await page.getByRole("link", { name: "Edit", exact: true }).click();
      await page
        .getByLabel("Name", { exact: true })
        .fill("Updated neighbourhood gym for strength and recovery");
      await button(page, "Save changes").click();
      await page.waitForURL((url) => url.pathname === gymPath);
      await button(page, "Make default gym").click();
      await expect(page.getByText("Default gym", { exact: true })).toBeVisible();
      const [count] =
        await sql`select count(*)::int as count from gyms where user_id = ${account.id} and is_default`;
      assert.equal(count.count, 1);
    });
    await step("equipment-create-edit-archive-restore", async () => {
      await page.getByRole("link", { name: "Add machine", exact: true }).click();
      await page
        .getByLabel("Equipment type", { exact: true })
        .selectOption({ label: "Chest press machine" });
      await expect(page.locator('input[name="unit"][value="lb"]')).toBeChecked();
      await page
        .getByLabel("Name", { exact: true })
        .fill("Audit chest press — left side of the main training floor");
      await page.getByLabel("Available loads", { exact: true }).fill("20, 30, 40, 50, 60");
      await button(page, "Add machine").click();
      await page.waitForURL((url) => url.pathname === gymPath);
      await page.getByRole("link", { name: /Audit chest press/ }).click();
      await page.waitForURL(/\/gyms\/[0-9a-f-]{36}\/equipment\/[0-9a-f-]{36}$/);
      const equipmentPath = new URL(page.url()).pathname;
      await page.getByLabel("Name", { exact: true }).fill("Audit chest press — revised label");
      await button(page, "Save changes").click();
      await page.waitForURL((url) => url.pathname === gymPath);
      await go(page, equipmentPath);
      await expect(page.getByLabel("Name", { exact: true })).toHaveValue(
        "Audit chest press — revised label",
      );
      await button(page, "Archive").click();
      await expect(button(page, "Restore")).toBeVisible();
      await go(page, equipmentPath);
      await expect(page.getByText("Archived", { exact: true })).toBeVisible();
      await button(page, "Restore").click();
      await expect(button(page, "Archive")).toBeVisible();
      await go(page, equipmentPath);
      await expect(button(page, "Archive")).toBeVisible();
    });
    await step("gym-archive-and-restore", async () => {
      await go(page, gymPath);
      await page.locator("summary").filter({ hasText: "Gym options" }).click();
      await button(page, "Archive").click();
      await expect(button(page, "Restore gym")).toBeVisible();
      await go(page, gymPath);
      await expect(button(page, "Restore gym")).toBeVisible();
      await button(page, "Restore gym").click();
      await expect(page.getByRole("link", { name: "Add machine", exact: true })).toBeVisible();
    });
    await step("privacy-switches-persist", async () => {
      await go(page, "/profile/privacy");
      for (const label of [
        "Share training with followers",
        "Let people find me by email",
        "Share body weight for relative strength",
        "Share cycling with followers",
        "Share swimming with followers",
      ]) {
        const control = page.getByRole("switch", { name: label, exact: true });
        const before = await control.getAttribute("aria-checked");
        await control.click();
        await expect(control).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
        await expect(control).toBeEnabled();
        await reload(page);
        await expect(page.getByRole("switch", { name: label, exact: true })).toHaveAttribute(
          "aria-checked",
          before === "true" ? "false" : "true",
        );
      }
    });
    const friendPage = await freshPage();
    const friend = makeAccount("b");
    await step("endurance-only-onboarding", () => signup(friendPage, friend, false), friendPage);
    await step("follow-request-cancel-accept-and-remove", async () => {
      await go(page, "/profile/friends/find");
      await page.getByLabel("Find people", { exact: true }).fill(friend.username);
      await button(page, "Request").click();
      await expect(button(page, "Requested")).toBeVisible();
      await button(page, "Requested").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await button(page, "Cancel request").click();
      await expect(button(page, "Request")).toBeVisible();
      await button(page, "Request").click();
      await expect(button(page, "Requested")).toBeVisible();
      await go(friendPage, "/profile/friends/people");
      await button(friendPage, "Accept").click();
      await expect(button(friendPage, "Accept")).toHaveCount(0);
      await go(page, "/profile/friends/people");
      await expect(button(page, "Unfollow")).toBeVisible();
      await button(page, "Unfollow").click();
      await page.getByRole("dialog").getByRole("button", { name: "Unfollow", exact: true }).click();
      await expect(page.getByText("You follow nobody yet.", { exact: true })).toBeVisible();
      await deleteInUi(friendPage);
    });
    await step("password-change-signout-and-login", async () => {
      await go(page, "/profile/password");
      await page.getByLabel("New password", { exact: true }).fill(newPassword);
      await page.getByLabel("Confirm new password", { exact: true }).fill(newPassword);
      await button(page, "Save password").click();
      await expect(page.getByText("Password updated.", { exact: true })).toBeVisible();
      const [stored] =
        await sql`select encrypted_password from auth.users where id = ${account.id}`;
      const [salt, digest] = stored.encrypted_password.split(":");
      assert.ok(
        timingSafeEqual(scryptSync(newPassword, salt, 32), Buffer.from(digest, "hex")),
        "The changed password is stored by local auth",
      );
      await go(page, "/profile");
      await button(page, "Sign out").scrollIntoViewIfNeeded();
      await settle(page);
      await button(page, "Sign out").click();
      await page.waitForURL(/\/login$/);
      await page.getByLabel("Email", { exact: true }).fill(account.email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await button(page, "Sign in").click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(button(page, "Sign in")).toBeEnabled();
      await expect(page.getByLabel("Password", { exact: true })).toHaveValue("");
      await expect(page.getByLabel("Email", { exact: true })).toHaveValue(account.email);
      await page.getByLabel("Password", { exact: true }).fill(newPassword);
      await button(page, "Sign in").click();
      await page.waitForURL(/\/today$/);
    });
    await step("delete-account-cascades-owned-data", async () => {
      await deleteInUi(page);
      const [remaining] =
        await sql`select (select count(*)::int from profiles where id = ${account.id}) as profiles,
        (select count(*)::int from gyms where user_id = ${account.id}) as gyms,
        (select count(*)::int from equipment_instances where user_id = ${account.id}) as equipment,
        (select count(*)::int from body_weight_logs where user_id = ${account.id}) as weights`;
      assert.deepEqual(remaining, { profiles: 0, gyms: 0, equipment: 0, weights: 0 });
    });
  } catch {
    // A failed step records its page and screenshot; the next engine still gets a fresh run.
  } finally {
    for (const context of contexts) await context.close();
    await browser.close();
    // Only this run's unique disposable accounts, including ones whose browser flow stopped early.
    for (const account of accounts)
      await sql`delete from auth.users where email = ${account.email}`;
  }
}

try {
  for (const device of process.env.AUDIT_DEVICE
    ? [process.env.AUDIT_DEVICE]
    : ["android", "iphone"])
    await runDevice(device);
  const passed = results.every((result) => result.passed) && runtimeErrors.length === 0;
  await writeFile(
    `${output}/results.json`,
    JSON.stringify({ passed, results, runtimeErrors }, null, 2),
  );
  console.log(
    JSON.stringify({
      passed,
      checks: results.length,
      failed: results.filter((result) => !result.passed).length,
      runtimeErrors: runtimeErrors.length,
    }),
  );
  if (!passed) process.exitCode = 1;
} finally {
  await sql.end();
}
