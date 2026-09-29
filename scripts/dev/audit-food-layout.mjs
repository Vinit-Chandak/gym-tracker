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
      const minimum = Math.min(
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
  const markers = scope.locator("ol li > :is(a, span) > span:first-child");
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
        square: Math.abs(marker.width - marker.height) <= 1,
        textContained: number.left >= marker.left - 1 && number.right <= marker.right + 1,
        marker: marker.toJSON(),
        cell: cell.toJSON(),
      };
    }),
  );
  for (const item of measured)
    assert.ok(
      item.contained && item.square && item.textContained,
      `${surface}: day leaves its grid cell ${JSON.stringify(item)}`,
    );
}

/** Read-only coverage used by the interactive UI audit after logging into Vinit. */
export async function checkFoodLayout({ page, visit, folder, device, day }) {
  await page.setViewportSize({ width: 320, height: 640 });
  const selectedDay = day ? `?day=${encodeURIComponent(day)}` : "";
  for (const textSize of [16, 32]) {
    for (const theme of ["light", "dark"]) {
      const label = `${device}-food-layout-${textSize}-${theme}`;
      await visit(`/food${selectedDay}`, textSize);
      await page.evaluate(
        (mode) => document.documentElement.setAttribute("data-overload-mode", mode),
        theme,
      );
      await containedDayMarkers(page.getByRole("navigation", { name: "Days" }), "Week strip");
      const meals = page.getByRole("list", { name: "Meals", exact: true });
      await readableNames(meals.locator("a > span:first-child > span.font-medium"), "Meal titles");
      const summaries = meals.locator(".line-clamp-2");
      await readableNames(summaries, "Meal food summaries");
      const heights = await summaries.evaluateAll((elements) =>
        elements.map((element) => {
          const style = getComputedStyle(element);
          return {
            text: element.textContent,
            height: element.getBoundingClientRect().height,
            lineHeight: parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5,
          };
        }),
      );
      for (const item of heights)
        assert.ok(
          item.height <= item.lineHeight * 2 + 1,
          `Summary exceeds two lines: ${JSON.stringify(item)}`,
        );
      await contained(page, "Food summary");
      await page.screenshot({
        path: `${folder}/${label}-day.png`,
        fullPage: true,
        animations: "disabled",
      });
      await meals
        .getByRole("link")
        .first()
        .screenshot({
          path: `${folder}/${label}-meal-row.png`,
          animations: "disabled",
        });

      await page.getByRole("button", { name: /, calendar$/ }).click();
      const calendar = page.getByRole("dialog", { name: "Calendar", exact: true });
      await containedDayMarkers(calendar, "Month calendar");
      await page.screenshot({ path: `${folder}/${label}-calendar.png`, animations: "disabled" });
      await calendar.getByRole("button", { name: "Close sheet", exact: true }).click();

      await page.getByRole("button", { name: /^Protein:/ }).click();
      const breakdown = page.getByRole("list", { name: "Protein by food", exact: true });
      await readableNames(
        breakdown.locator("li > span:first-child > span.font-medium"),
        "Macro breakdown",
      );
      await page.screenshot({ path: `${folder}/${label}-macro.png`, animations: "disabled" });
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Close sheet", exact: true })
        .click();

      await visit(`/food/breakfast${selectedDay}`, textSize);
      await page.evaluate(
        (mode) => document.documentElement.setAttribute("data-overload-mode", mode),
        theme,
      );
      const entries = page.getByRole("list", { name: "In breakfast", exact: true });
      await readableNames(
        entries.locator("button > span:first-child > span.font-medium"),
        "Logged foods",
      );
      const library = page.getByRole("list", { name: "Your foods and meals", exact: true });
      await readableNames(
        library.locator("button span.font-medium"),
        "Food and saved-meal choices",
      );
      await contained(page, "Meal editor");
      await page.screenshot({
        path: `${folder}/${label}-entries.png`,
        fullPage: true,
        animations: "disabled",
      });
      await entries
        .locator("li")
        .first()
        .screenshot({
          path: `${folder}/${label}-entry-row.png`,
          animations: "disabled",
        });

      await visit("/food/my-foods", textSize);
      await page.evaluate(
        (mode) => document.documentElement.setAttribute("data-overload-mode", mode),
        theme,
      );
      const savedMeals = page.getByRole("list", { name: "Meals", exact: true });
      await readableNames(savedMeals.locator("a span.font-medium"), "Saved meals");
      await savedMeals
        .getByRole("link")
        .first()
        .screenshot({
          path: `${folder}/${label}-library-row.png`,
          animations: "disabled",
        });
      const savedPath = await savedMeals.getByRole("link").first().getAttribute("href");
      await visit(savedPath, textSize);
      await page.evaluate(
        (mode) => document.documentElement.setAttribute("data-overload-mode", mode),
        theme,
      );
      const savedItems = page.getByRole("list", { name: "In this meal", exact: true });
      await readableNames(
        savedItems.locator("button > span:first-child > span.font-medium"),
        "Saved meal items",
      );
      await contained(page, "Saved meal editor");
      await page.screenshot({
        path: `${folder}/${label}-saved.png`,
        fullPage: true,
        animations: "disabled",
      });
      await savedItems
        .locator("li")
        .first()
        .screenshot({
          path: `${folder}/${label}-saved-row.png`,
          animations: "disabled",
        });
    }
  }
}
