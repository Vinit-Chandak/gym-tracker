import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** The year simulation (`npm run year:seed`): a year of six accounts, minutes long. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/dev/year/*.sim.ts"],
    testTimeout: 7_200_000,
    hookTimeout: 600_000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
