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
