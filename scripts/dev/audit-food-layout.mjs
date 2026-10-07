import assert from "node:assert/strict";

/** Check actual text geometry: a row can avoid page overflow while still crushing its name. */
async function readableNames(names, surface) {
  assert.ok((await names.count()) > 0, `${surface}: no food names found`);
  const measured = await names.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      const row = element.closest("li");
      const rowStyle = getComputedStyle(row);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const longestWord = Math.max(
        0,
        ...[...element.textContent.matchAll(/[\p{L}\p{N}]+/gu)].map(
          (word) => context.measureText(word[0]).width,
        ),
      );
      const minimum = Math.min(
        longestWord,
        context.measureText("00000000").width,
        row.clientWidth - parseFloat(rowStyle.paddingLeft) - parseFloat(rowStyle.paddingRight),
      );
      return { name: element.textContent.trim(), width: rect.width, minimum };
    }),
  );
  for (const item of measured)
    assert.ok(
      item.width + 1 >= item.minimum,
      `${surface}: unreadable text column ${JSON.stringify(item)}`,
    );
}

async function contained(page, surface) {
  const dimensions = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }));
  assert.ok(
    dimensions.page <= dimensions.viewport + 1,
    `${surface}: ${JSON.stringify(dimensions)}`,
  );
}

async function containedDayMarkers(scope, surface) {
  const markers = scope.locator(".food-day > .type-figure");
  assert.ok((await markers.count()) >= 7, `${surface}: no calendar week found`);
  const measured = await markers.evaluateAll((elements) =>
    elements.map((element) => {
      const marker = element.getBoundingClientRect();
      const cell = element.parentElement.getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(element);
      const number = text.getBoundingClientRect();
      return {
        day: element.textContent.trim(),
        contained: marker.left >= cell.left - 1 && marker.right <= cell.right + 1,
        textContained: number.left >= marker.left - 1 && number.right <= marker.right + 1,
        marker: marker.toJSON(),
        cell: cell.toJSON(),
      };
    }),
  );
  for (const item of measured)
    assert.ok(
      item.contained && item.textContained,
      `${surface}: day leaves its grid cell ${JSON.stringify(item)}`,
    );
}

async function chooseStoredAppearance(page, mode) {
  await page.evaluate((value) => {
    const key = "overload:appearance";
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    // Storage events normally notify the other tabs. Notify this tab too so its existing
    // appearance subscriber applies the same preference that navigation will restore.
    window.dispatchEvent(
      new StorageEvent("storage", { key, newValue: value, storageArea: localStorage }),
    );
  }, mode);
}

/** Read-only coverage used by the interactive UI audit after logging into Vinit. */
export async function checkFoodLayout({ page, visit, folder, device, day }) {
  await page.setViewportSize({ width: 320, height: 640 });
  const selectedDay = day ? `?day=${encodeURIComponent(day)}` : "";
  const originalAppearance = await page.evaluate(() => localStorage.getItem("overload:appearance"));
  try {
    for (const textSize of [16, 32]) {
      for (const theme of ["light", "dark"]) {
        const label = `${device}-food-layout-${textSize}-${theme}`;
        await chooseStoredAppearance(page, theme);
        const assertPalette = () =>
          page.waitForFunction(
            (mode) => document.documentElement.getAttribute("data-overload-mode") === mode,
            theme,
          );
        const navigate = async (path) => {
          page = (await visit(path, textSize)) ?? page;
          await assertPalette();
        };
        const capture = async (name, fullPage = false) => {
          await assertPalette();
          await page.screenshot({
            path: `${folder}/${label}-${name}.png`,
            fullPage,
            animations: "disabled",
          });
        };
        const captureRow = async (row, name) => {
          await row.evaluate((element) =>
            element.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }),
          );
          await assertPalette();
          await row.screenshot({ path: `${folder}/${label}-${name}.png`, animations: "disabled" });
        };
        await navigate(`/food${selectedDay}`);
        await containedDayMarkers(page.getByRole("navigation", { name: "Days" }), "Week strip");
        const meals = page.getByRole("list", { name: "Meals", exact: true });
        await readableNames(meals.locator(".meal-row-name"), "Meal titles");
        const summaries = meals.locator(".meal-row-foods");
        await readableNames(summaries, "Meal food summaries");
        const textBounds = await summaries.evaluateAll((elements) =>
          elements.map((element) => {
            const bounds = element.getBoundingClientRect();
            const range = document.createRange();
            range.selectNodeContents(element);
            const text = range.getBoundingClientRect();
            return {
              text: element.textContent,
              contained: text.top >= bounds.top - 2 && text.bottom <= bounds.bottom + 2,
            };
          }),
        );
        for (const item of textBounds)
          assert.ok(item.contained, `Meal summary text is clipped: ${JSON.stringify(item)}`);
        await contained(page, "Food summary");
        await capture("day", true);
        await captureRow(meals.getByRole("link").first(), "meal-row");

        await page.getByRole("button", { name: /, calendar$/ }).click();
        const calendar = page.getByRole("dialog", { name: "Calendar", exact: true });
        await containedDayMarkers(calendar, "Month calendar");
        await capture("calendar");
        await calendar.getByRole("button", { name: "Close sheet", exact: true }).click();

        await page.getByRole("button", { name: /^Protein:/ }).click();
        const breakdown = page.getByRole("list", { name: "Protein by food", exact: true });
        await readableNames(
          breakdown.locator("li > span:first-child > span.font-bold"),
          "Macro breakdown",
        );
        await capture("macro");
        await page
          .getByRole("dialog")
          .getByRole("button", { name: "Close sheet", exact: true })
          .click();

        await navigate(`/food/breakfast${selectedDay}`);
        const entries = page.getByRole("list", { name: "In breakfast", exact: true });
        await readableNames(entries.locator(".food-row-name"), "Logged foods");
        const library = page.getByRole("list", { name: "Your foods and meals", exact: true });
        await readableNames(library.locator(".food-row-name"), "Food and saved-meal choices");
        await contained(page, "Meal editor");
        await capture("entries", true);
        await captureRow(entries.locator("li").first(), "entry-row");

        await navigate("/food/my-foods");
        const savedMeals = page.getByRole("list", { name: "Meals", exact: true });
        await readableNames(savedMeals.locator(".food-row-name"), "Saved meals");
        await captureRow(savedMeals.getByRole("link").first(), "library-row");
        const savedPath = await savedMeals.getByRole("link").first().getAttribute("href");
        await navigate(savedPath);
        const savedItems = page.getByRole("list", { name: "In this meal", exact: true });
        await readableNames(savedItems.locator(".food-row-name"), "Saved meal items");
        await contained(page, "Saved meal editor");
        await capture("saved", true);
        await captureRow(savedItems.locator("li").first(), "saved-row");
      }
    }
  } finally {
    await chooseStoredAppearance(page, originalAppearance);
  }
}
