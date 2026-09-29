import assert from "node:assert/strict";

/** Overflow alone misses flex rows that fit the screen by breaking every word into letters. */
export async function assertReadableText(locator) {
  const measurements = await locator.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      const letterSpacing = parseFloat(style.letterSpacing) || 0;
      const textWidth = (value) => context.measureText(value).width + value.length * letterSpacing;
      const rect = element.getBoundingClientRect();
      const text = element.textContent.trim();
      const minimumWidth = Math.min(textWidth(text), textWidth("00000000"));
      const brokenWords = [];
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        for (const match of node.textContent.matchAll(/[\p{L}\p{N}]+/gu)) {
          if (textWidth(match[0]) > rect.width + 2) continue;
          const range = document.createRange();
          range.setStart(node, match.index);
          range.setEnd(node, match.index + match[0].length);
          const lines = new Set([...range.getClientRects()].map((part) => Math.round(part.top)));
          if (lines.size > 1) brokenWords.push(match[0]);
        }
      }
      return { text, width: rect.width, minimumWidth, brokenWords };
    }),
  );
  assert.ok(measurements.length > 0, "No text found for readability check");
  for (const measurement of measurements) {
    assert.ok(
      measurement.width + 2 >= measurement.minimumWidth && !measurement.brokenWords.length,
      `Text squeezed into a narrow column: ${JSON.stringify(measurement)}`,
    );
  }
}
