import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import eslintConfigPrettier from "eslint-config-prettier";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Underscore-prefixed names mark intentionally unused values (e.g. useActionState's prevState).
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  // Must come last: turns off stylistic rules that conflict with Prettier.
  eslintConfigPrettier,
  globalIgnores([
    ".next/**",
    ".next-*/**",
    "output/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
    // Third-party agent skills ship their own scripts; they are not app code.
    ".claude/skills/**",
  ]),
]);

export default eslintConfig;
