#!/bin/bash
# Installs dependencies in Claude Code cloud sessions (routines included) when they are
# missing, so the coach scripts can run. Does nothing on a laptop or when already installed.
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
if [ -d node_modules ] && [ node_modules/.package-lock.json -nt package-lock.json ]; then
  exit 0
fi
npm ci --no-audit --no-fund --prefer-offline >/tmp/npm-ci.log 2>&1 ||
  echo "npm ci failed; see /tmp/npm-ci.log"
exit 0
