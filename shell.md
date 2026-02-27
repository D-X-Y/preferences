# Shell Preferences

Applies to both zsh and bash. Use whichever is available on the system.

## Prompt

- Show: username, current directory path, git branch (if in a repo), current time (HH:MM:SS)
- Colors: blue for user@path, yellow for git branch, cyan for time
- End with appropriate prompt symbol (`$` or `%` for normal user, `#` for root)

## Completion

- Tab triggers menu-style completion with arrow key navigation
- Case-insensitive matching (e.g., `ls d` matches `Documents/`)
- Auto-list choices when ambiguous
- Git command completion enabled

## Plugins / Extensions

- Inline suggestions (fish-style, showing completions from history as you type)
- Syntax highlighting (colorize valid/invalid commands as you type)

## History

- Save 10,000 entries
- Share history across all terminal sessions
- Deduplicate: remove all previous instances of a repeated command
- Strip extra whitespace before saving
- Ignore commands that start with a space (for sensitive commands)
- Don't record trivial commands: `ls`, `ll`, `cd`, `pwd`, `history`

## Key Bindings

- Up arrow: search history backward by current prefix
- Down arrow: search history forward by current prefix

## Aliases

Use `eza` as a modern replacement for `ls`, always with icons:

| Alias | Meaning |
|-------|---------|
| `ls`  | List with icons |
| `ll`  | Long list with icons, all files, file-type indicators |
| `la`  | List all (including hidden) with icons |
| `l`   | One entry per line with icons |
| `lt`  | Tree view, 2 levels deep, with icons |

## Environment

- Conda (miniconda3) initialized on shell startup
- Load environment variables from `~/.env` if it exists (for API keys, secrets)
- Deduplicate PATH entries
- Add `~/.local/bin` to PATH
