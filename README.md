# Preferences

Intent-first configuration for my development environment.

Instead of maintaining brittle dotfiles full of cryptic syntax, this repo describes
**what I want** in natural language. When setting up a new machine, hand these files
to an AI coding assistant (e.g., Claude Code) and say "apply these preferences" --
it generates or updates the right config files for whatever OS, shell version, and
tools are actually installed.

## Structure

```
preferences/
  shell.md        # Shell behavior, prompt, completion, aliases, history
  git.md          # Git identity, editor, aliases, merge/diff strategy
  editor.md       # Vim/Neovim settings and keybindings
  terminal.md     # Tmux prefix, panes, mouse, splits
  ssh.md          # SSH hosts and connection shortcuts
  tools.md        # CLI tools and packages to install
```

## Usage

1. Clone this repo on a new machine
2. Open a terminal with an AI coding assistant
3. Say: "Read the preference files in this repo and apply them to this machine"
4. The assistant reads the intent, checks what's installed, and generates or updates
   appropriate config files (`.zshrc`, `.gitconfig`, `.tmux.conf`, etc.)

## Philosophy

- **Intent over syntax** -- describe what you want, not how to configure it
- **Portable** -- not tied to a specific shell version or OS
- **Adaptive** -- the AI handles edge cases and tool-specific quirks
- **Maintainable** -- add or remove preferences in plain English
