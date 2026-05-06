# Keyboard Shortcuts — NotesApp

The canonical and complete keyboard shortcut list is **SPEC.md §4.1**.
This document is a quick reference for the shortcuts most relevant to
day-to-day development on the app. When this list and SPEC.md disagree,
SPEC.md wins.

The Emacs motion and editing bindings listed below apply in both the
**Editor tile** (CodeMirror, via `@replit/codemirror-emacs`) and the
**WYSIWYG editor of the Preview tile** (Tiptap, via `EmacsKeymap`).
See SPEC.md §5.2 and `docs/SPEC_NOTES.md` §8 for the scope boundary
(TAB folding, org-mode table nav, macros, rectangles, and incremental
search are Editor-tile only).

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
| `C-x C-c` | Quit application (prompts to save any unsaved buffers — Emacs convention, not in SPEC.md §4.1) |
| `C-x C-f` | Open note by name (in a focused Editor tile) |
| `C-x C-r` | Open reference by name (in a focused Reference tile) — Phase 3 |
| `C-x n n` | Set current tile mode to **Editor** and open a note |
| `C-x n p` | Set current tile mode to **Preview** and open a note (no-op on non-`.md` files) |
| `C-x n r` | Set current tile mode to **Reference** and open a reference document |
| `C-x n c` | Set current tile mode to **AI Chat** and open (or create) a session |
| `C-x p` | Toggle pin on current Editor tile |
| `Cmd+B` / `Ctrl+Shift+B` | Toggle activity sidebar |
| `Ctrl/Cmd+Shift+F` | Global project search (Phase 3) |
| `Ctrl/Cmd+=` | Increase font size of focused tile |
| `Ctrl/Cmd+-` | Decrease font size of focused tile |
| `Ctrl/Cmd+0` | Reset font size of focused tile to default |
| `C-c C-n` | Move cursor to next visible Markdown header in Editor tile |
| `C-c C-p` | Move cursor to previous visible Markdown header in Editor tile |
| `C-c d` | Insert a new Excalidraw drawing block in focused Preview tile (Phase 2) |

The Editor↔Preview toggle in the tile title bar is a one-click
equivalent of `C-x n n` / `C-x n p` on markdown-bound tiles.

Emacs bindings inside the CodeMirror editor are implemented via
`@replit/codemirror-emacs` or equivalent. See SPEC.md §5.1 for the
full list of editor-internal bindings.

`Esc` acts as a Meta-prefix: pressing `Esc` followed by a key is
equivalent to `Alt+<key>` (the Meta modifier in Emacs). For example,
`Esc >` (end of buffer) and `Esc <` (beginning of buffer) are
explicitly required by SPEC.md §5.1. All Meta-bindings registered by
the emacs extension are available via this prefix.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
