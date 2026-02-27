# Git Preferences

## Identity

- Name: `<ask user>`
- Email: `<ask user>`

## Editor

- Use vim for commit messages and interactive operations

## Behavior

- Default branch name: `main`
- Pull strategy: rebase (not merge)
- Push: auto-setup remote tracking branch on first push
- Diff algorithm: histogram (better than default Myers for moved code)
- Merge conflict style: zdiff3 (shows base version alongside ours/theirs)

## Global Ignore

- Use `~/.gitignore_global` for system-wide ignore patterns (e.g., `.DS_Store`, `*.swp`)

## Aliases

| Alias    | Command |
|----------|---------|
| `st`     | `status` |
| `co`     | `checkout` |
| `br`     | `branch` |
| `ci`     | `commit` |
| `lg`     | `log --oneline --graph --decorate --all` (visual branch graph) |
| `last`   | `log -1 HEAD` (show last commit) |
| `unstage`| `reset HEAD --` (unstage files) |
