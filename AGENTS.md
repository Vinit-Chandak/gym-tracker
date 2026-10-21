<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Testing: only what changed

The full suite takes about ten minutes. Do not run it as a routine check, and never run the same
tests twice when nothing they cover has changed since they passed.

- After a change, run the tests for what changed: `npx vitest related --run <changed files>` runs
  every test that imports them (`git diff --name-only` lists the files). Add a test file you edited
  by its own path.
- Typecheck with `npm run typecheck`, and lint and format only the changed files
  (`npx eslint <files>`, `npx prettier --check <files>`).
- Re-run a test only after changing the code it covers. A test that passed and whose code has not
  changed since is not run again.
- The whole suite (`npm run test`, or `npm run check`, which includes it) runs at most once per set
  of changes, just before pushing, and only when the change reaches shared code (`src/components/ui`,
  `src/lib`, `src/db`, `src/server`, `next.config.ts`) or many areas at once. CI runs it on every
  push.
- When several agents work at once, none of them runs the whole suite; whoever pushes runs it once.
