# Preferences + Tools

This repo has two parts:

1. **Preferences** (root-level `.md` files) — intent-first descriptions of my dev environment. Describe *what I want*, not how to configure it. Portable across OS/shell versions.
2. **Tools** (`tools/<name>/`) — self-contained personal tools and utilities. Each tool is its own project with its own build/run instructions.

## Structure

```
preferences/
  shell.md, git.md, editor.md, ...   # Intent-first preference files
  tools/
    screenshot-pdf/                    # Chrome extension: screenshots → PDF
    <future-tool>/                     # Each tool is self-contained
  .claude/
    CLAUDE.md                          # This file
    settings.json                      # Project-level permissions
```

## Conventions

- Preference files are plain Markdown — describe intent, not syntax
- Each tool under `tools/` manages its own dependencies and build process
- No build system or package manager at the repo root
- Tools should include a README.md with usage instructions
