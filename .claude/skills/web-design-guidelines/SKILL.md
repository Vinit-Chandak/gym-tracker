---
name: web-design-guidelines
description: Review UI code for Web Interface Guidelines compliance. Use when asked to "review my UI", "check accessibility", "audit design", "review UX", or "check my site against best practices".
metadata:
  author: vercel
  version: "1.0.0"
  argument-hint: <file-or-pattern>
---

# Web Interface Guidelines

Review files for compliance with Web Interface Guidelines.

## How It Works

1. Read the guidelines in [reference/web-interface-guidelines.md](reference/web-interface-guidelines.md)
2. Read the specified files (or prompt user for files/pattern)
3. Check against all rules in the guidelines
4. Output findings in the terse `file:line` format

## Guidelines Source

The rules are a pinned, reviewed snapshot of:

```
https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md
```

Use the local snapshot. Refresh it from that URL only when the user asks for the latest rules, and review the new text before relying on it.

## Project override

Overload writes headings and buttons in sentence case ("Start workout", "Finish session"). Do not flag sentence case under the guidelines' Title Case rule.

## Usage

When a user provides a file or pattern argument:
1. Read the guidelines snapshot
2. Read the specified files
3. Apply all rules from the guidelines
4. Output findings using the format specified in the guidelines

If no files specified, ask the user which files to review.
