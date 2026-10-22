<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Testing: only what changed

The full suite takes about ten minutes. Run the tests relevant to the change, and only those:
after a change, before a commit, before a push and before a merge alike (owner, 22 October 2026).
Never run the same tests twice when nothing they cover has changed since they passed.

- Relevant means the tests of the code you changed: its own test file and the tests of what calls
  it. `npx vitest related --run <changed files>` finds every test that imports them
  (`git diff --name-only` lists the files); when a changed file is imported nearly everywhere and
  that would be most of the suite, run the changed code's own tests and its direct callers'
  instead. Add a test file you edited by its own path.
- Typecheck with `npm run typecheck`, and lint and format only the changed files
  (`npx eslint <files>`, `npx prettier --check <files>`).
- Re-run a test only after changing the code it covers. A test that passed and whose code has not
  changed since is not run again; a small fix is followed by its own tests, not the suite.
- The whole suite (`npm run test`, or `npm run check`, which includes it) runs only for a change
  that spans most of the app at once (hundreds of screens: the app shell, a component every screen
  uses, a framework or dependency upgrade), and then once, just before pushing. Reaching shared
  code (`src/lib`, `src/server`, `src/domain`) is not by itself a reason: run the tests related to
  the change. Nothing runs the suite on push: Vercel builds the app and runs no tests.
- When several agents work at once, none of them runs the whole suite; whoever pushes a change
  that spans the app runs it once.
