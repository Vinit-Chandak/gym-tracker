import { expect, it } from "vitest";
import { safeAppPath } from "./safe-app-path";

it("preserves internal return paths and rejects URLs that normalize to another origin", () => {
  expect(safeAppPath("/history?from=2026-09-01#results")).toBe("/history?from=2026-09-01#results");
  for (const path of [
    "https://outside.test",
    "//outside.test",
    "/\\outside.test",
    "/\t/outside.test",
    "javascript:alert(1)",
    "",
    null,
  ]) {
    expect(safeAppPath(path)).toBeNull();
  }
});
