# Editor Preferences

Primary editor: Vim (also use VS Code occasionally)

## Appearance

- Syntax highlighting enabled
- Colorscheme: desert
- Dark background in terminal, light in GUI
- Always show status bar with: filename, file type, read-only flag, modified flag, line/total lines, column, percentage

## General

- C-style auto-indentation
- Backspace works across indent, end-of-line, and start-of-line
- Incremental search (highlight as you type)
- Highlight all search matches
- Encoding: UTF-8 (fallback to GBK for legacy Chinese files)
- File type detection with per-filetype plugins and indentation

## Language-Specific Indentation

| Language | Indent | Tab Width | Extras |
|----------|--------|-----------|--------|
| C / C++ / CUDA | spaces | 4 | syntax folding, line numbers, cindent |
| Python | spaces | 4 | syntax folding, line numbers |
| Matlab | spaces | 2 | syntax folding, line numbers |

## Key Bindings

- F2: toggle paste mode (use temporarily when pasting from clipboard to avoid auto-indent mangling)
