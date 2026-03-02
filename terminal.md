# Terminal Multiplexer Preferences

Multiplexer: tmux

## Prefix Key

- Remap prefix from `Ctrl-b` to `Ctrl-q`

## Pane Navigation

- Prefix + Arrow keys to switch panes

## Mouse

- Mouse enabled: click to select panes/windows, drag to resize
- Mouse selection should copy to system clipboard (note: tmux intentionally clears the highlight on mouse release, but the text is still copied)

## Windows and Splits

- New splits and windows inherit the current pane's working directory
- Horizontal split: `prefix + "`
- Vertical split: `prefix + |`
- New window: `prefix + c`
- Don't auto-rename windows

## Config Reload

- `prefix + r` to reload tmux config without restarting

## Display

- 256-color terminal support
- Status bar shows current pane's path

## ANSI Color Compatibility

tmux with `TERM=screen-256color` (common over SSH) only reliably supports a subset of ANSI escapes for PS1 prompts:

| Range | Name | Example | Works? |
|-------|------|---------|--------|
| 30-37 | Standard colors | `33m` (yellow), `32m` (green), `34m` (blue) | Yes |
| 01;30-37 | Bold + standard | `01;32m` (bold green) | No — bold attribute stripped/ignored |
| 90-97 | Bright colors | `92m` (bright green) | No — not in screen-256color terminfo |
| 38;5;N | 256-color extended | `38;5;82m` (bright green) | Yes |

**Rule of thumb:** stick to plain 30-37 codes for prompt colors. If you need brighter shades, use the 256-color format (`\033[38;5;Nm`) — never the 90-97 bright range or bold prefix.
