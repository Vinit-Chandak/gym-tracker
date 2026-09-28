import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** The coach simulation (`npm run sim:coach`): minutes, not seconds, so apart from `npm test`. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.sim.ts"],
    testTimeout: 3_600_000,
    hookTimeout: 600_000,
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
