import { expect } from "@playwright/test";

/** Press the visible label of native radios; the input itself is visually hidden. */
export async function chooseRadio(page, name, value) {
  const input = page.locator(`input[type="radio"][name="${name}"][value="${value}"]`);
  await input.locator("..").click();
  await expect(input).toBeChecked();
}

/** Onboarding now records experience and uses the illustrated equipment catalogue. */
export async function chooseOnboardingUnits(page, unit) {
  await chooseRadio(page, "preferredUnit", unit);
  await chooseRadio(page, "trainingExperience", "experienced");
}

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
