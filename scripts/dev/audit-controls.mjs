import { expect } from "@playwright/test";

/** Press the visible label of native radios; the input itself is visually hidden. */
export async function chooseRadio(page, name, value) {
  const input = page.locator(`input[type="radio"][name="${name}"][value="${value}"]`);
  await input.locator("..").click();
  await expect(input).toBeChecked();
}

/**
 * Sign up as the shorter setup asks (ADR 0053): a name, an email and a password, once. There is
 * no username field: the app makes one from the name, so a caller reads it back by the email.
 */
export async function signUp(page, { name, email, password }) {
  await page.getByLabel("Name", { exact: true }).fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.waitForURL(/\/welcome$/);
}

/**
 * Setup's first step (ADR 0053): which sounds like you and what you train, then the units and
 * the time zone the phone proposed, changed in their sheet. A lifter goes on to where they train;
 * an athlete who only runs, rides or swims finishes here, on Today.
 */
export async function answerFirstStep(
  page,
  { experience = "experienced", sports, weight, distance, timeZone },
) {
  await chooseRadio(page, "trainingExperience", experience);
  for (const sport of sports) {
    const input = page.getByRole("checkbox", { name: sport, exact: true });
    await input.locator("..").click();
    await expect(input).toBeChecked();
  }
  await page.getByRole("button", { name: "Change units and time zone", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Units and time zone" });
  if (weight) await chooseRadio(sheet, "sheet-weight", weight);
  if (distance) await chooseRadio(sheet, "sheet-distance", distance);
  if (timeZone) await sheet.getByLabel("Time zone", { exact: true }).selectOption(timeZone);
  await sheet.getByRole("button", { name: "Done", exact: true }).click();
  await expect(sheet).toBeHidden();
  const lifts = sports.includes("Strength");
  await page.getByRole("button", { name: lifts ? "Continue" : "Finish", exact: true }).click();
  await page.waitForURL(lifts ? /\/welcome\/gym$/ : /\/today$/);
}

/** Setup's second step for a lifter (board Where you train): the kind of place, and its name. */
export async function choosePlace(page, { kind = "gym", name }) {
  await chooseRadio(page, "kind", kind);
  await page.getByLabel(kind === "gym" ? "Gym name" : "Name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.waitForURL(/\/welcome\/(?:equipment|programme)$/);
}

/** The equipment step's search, which finds a machine and registers it on the way on. */
export async function addStarterChestPress(page) {
  await page.getByLabel("Find equipment", { exact: true }).fill("Chest press machine");
  const input = page.getByRole("checkbox", { name: /^Chest press machine\b/ }).first();
  await input.locator("..").click();
  await expect(input).toBeChecked();
  await page.getByRole("button", { name: "Add 1 and continue", exact: true }).click();
}

/** Optional activity details are behind a visible disclosure; durations use a clock field. */
export async function fillActivityField(page, name, value) {
  const control =
    name === "minutes"
      ? page.getByRole("textbox", { name: /^(Duration|Elapsed time)$/ })
      : page.locator(`[name="${name}"]`);
  if (!(await control.isVisible())) {
    const details = control.locator("xpath=ancestor::details[1]");
    await details.locator("summary").click();
  }
  await control.fill(String(value));
}

/** Hold the destination response after a real save and verify that a second tap is blocked. */
export async function clickWithSlowNavigation(page, button, destination) {
  const source = await button.elementHandle();
  let release, requested, timeout;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const started = new Promise((resolve) => {
    requested = resolve;
  });
  await page.route(destination, async (route) => {
    requested();
    await gate;
    await route.continue();
  });
  try {
    await button.click();
    await Promise.race([
      started,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("No destination request after save")), 10_000);
      }),
    ]);
    await page.waitForTimeout(200);
    // Capture the element before its label changes to Starting/Saving; it is still the same control.
    if (await source.isVisible()) expect(await source.isDisabled()).toBe(true);
  } finally {
    clearTimeout(timeout);
    release();
    await page.unrouteAll({ behavior: "wait" });
    await source.dispose();
  }
}
