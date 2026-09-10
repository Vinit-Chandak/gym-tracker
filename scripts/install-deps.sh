#!/bin/bash
# Installs dependencies in Claude Code cloud sessions (routines included) when they are
# missing, so the coach scripts can run. Does nothing on a laptop, and nothing at all when
# the environment's cached snapshot already carries node_modules, which is the fast path a
# routine should be taking: put `npm ci` in the environment's setup script so the snapshot
# is built once rather than on every run.
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
# Present and no older than the lockfile means there is nothing to do.
if [ -d node_modules ] && [ ! package-lock.json -nt node_modules ]; then
  exit 0
fi
npm ci --no-audit --no-fund --prefer-offline >/tmp/npm-ci.log 2>&1 ||
  echo "npm ci failed; see /tmp/npm-ci.log"
exit 0
