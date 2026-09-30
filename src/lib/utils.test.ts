import { expect, test } from "vitest";

import { cn } from "./utils";

test("a display size and a text colour both survive", () => {
  expect(cn("text-display-m", "text-ink")).toBe("text-display-m text-ink");
  expect(cn("text-display-s font-extrabold", "text-ink-muted")).toBe(
    "text-display-s font-extrabold text-ink-muted",
  );
});

test("the later of two sizes or two radii wins", () => {
  expect(cn("text-sm", "text-display-s")).toBe("text-display-s");
  expect(cn("rounded-card", "rounded-hero")).toBe("rounded-hero");
  expect(cn("rounded-chip", "rounded-control")).toBe("rounded-control");
});

test("a sport's colours replace the neutral ones", () => {
  expect(cn("bg-surface-raised text-ink", "bg-run-soft text-run-ink")).toBe(
    "bg-run-soft text-run-ink",
  );
});
