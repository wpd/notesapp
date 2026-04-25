# Keyboard Shortcuts — NotesApp

The canonical and complete keyboard shortcut list is **SPEC.md §4.1**.
This document is a quick reference for the shortcuts most relevant to
day-to-day development on the app. When this list and SPEC.md disagree,
SPEC.md wins.

---

| Shortcut | Action |
|---|---|
| `C-x o` | Focus next tile |
| `C-x O` | Focus previous tile |
| `C-x h` | Split current tile horizontally (halves inherit mode/buffer) |
| `C-x v` | Split current tile vertically (halves inherit mode/buffer) |
| `C-x 0` / `C-x w` | Close current tile (with Save/Discard/Cancel on last-tile release of a modified buffer) |
| `C-x z` | Maximize / restore current tile |
| `C-x b` | Buffer switcher for the focused tile's mode (Editor picker in a Missing tile) |
| `C-x C-s` | Save current note |
| `C-x C-f` | Open note by name (in a focused Editor tile) |
| `C-x C-r` | Open reference by name (in a focused Reference tile) |
| `C-x n n` | Set current tile mode to **Editor** and open a note |
| `C-x n p` | Set current tile mode to **Preview** and open a note (no-op on non-`.md` files) |
| `C-x n r` | Set current tile mode to **Reference** and open a reference document |
| `C-x n c` | Set current tile mode to **AI Chat** and open (or create) a session |
| `C-x p` | Toggle pin on current Editor tile |
| `Cmd+B` / `Ctrl+Shift+B` | Toggle activity sidebar |
| `Ctrl/Cmd+Shift+F` | Global project search |

The Editor↔Preview toggle in the tile title bar is a one-click
equivalent of `C-x n n` / `C-x n p` on markdown-bound tiles.

Emacs bindings inside the CodeMirror editor are implemented via
`@replit/codemirror-emacs` or equivalent. See SPEC.md §5.1 for the
full list of editor-internal bindings.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
