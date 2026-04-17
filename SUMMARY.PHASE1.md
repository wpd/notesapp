# Phase 1 Summary — What Works

Phase 1 delivers a running Tauri v2 app where a user can open a project directory,
create and edit markdown notes, see a live rendered preview, and tile/split panes
freely. All three test layers are established and passing.

**Test counts:** Rust 15, Vitest 84 (9 files), E2E 26 — all green.

---

## App Launch & Project Loading

- App reads `NOTESAPP_PROJECT_DIR` env var or shows a directory chooser dialog
- Creates `.notesapp/` scaffold (project.toml, notes/, references/, attachments/) if missing
- On relaunch, restores the saved layout from `.notesapp/layout.json`
- If `.tmp` crash-recovery files exist, shows a dialog offering Recover or Discard

## Tiling Layout

- Default layout: Editor + Preview side by side
- **C-x h** splits horizontally, **C-x v** splits vertically
- **C-x 0** closes a pane, **C-x z** maximizes/restores
- **C-x o** cycles focus between panes
- **C-x p** pins an editor tile (only one at a time; pin icon in title bar)
- **Ctrl+Shift+B** toggles the activity sidebar
- Every structural change auto-persists to disk (250ms debounce)

## Activity Sidebar

- Left-edge collapsible panel showing all notes sorted by modification time
- Browse-only — drag a file from sidebar onto a pane to open it

## Editor (CodeMirror 6)

- Full markdown syntax highlighting including fenced code blocks
- LaTeX (`$...$`, `$$...$$`) recognized in the pipeline
- Mermaid fenced blocks rendered as SVG in preview (plain code in editor)
- Line numbers, word wrap toggle (in status bar), word + character count
- Emacs keybindings via `@replit/codemirror-emacs` (C-f/b/n/p, M-f/b, C-a/e, C-k, C-y, kill ring, incremental search, M-</M->)
- **C-x b** buffer switcher (fuzzy filter, Enter loads, Esc cancels)
- **C-x C-f** find-file picker (same UI, but offers "Create new note" when query has no match)
- **C-x C-s** saves; dirty indicator (•) in title bar when unsaved
- Autosave to `.tmp` every 30 seconds
- Native OS spellcheck enabled
- If a file referenced by a tile is missing on disk, shows ⚠ File not found card

## Preview Pane

- Renders the same note as the focused/pinned editor
- Full remark/rehype pipeline: CommonMark + GFM (tables, strikethrough)
- KaTeX: inline and display math
- Mermaid.js: fenced blocks rendered as SVG diagrams
- ~150ms debounced re-render
- Best-effort scroll-sync (editor cursor → preview scroll position)

## Yjs CRDT

- Each note backed by a Y.Doc; CodeMirror binds via y-codemirror.next
- Multiple editor tiles for the same file share one Y.Doc (edits sync instantly)

## Error Handling

- Each tile wrapped in React Error Boundary (shows error card, not crash)
- Mermaid/KaTeX parse errors shown inline
- No unwrap()/panic!() on Rust user-facing paths

## Known Deferrals

- **Word-wrap toggle location:** Currently in the editor status bar; should move to the tile title bar. Tracked as a Phase 2 deliverable (requires lifting local state to store).
- **Spellcheck suppression in code blocks:** Relies on browser native behavior for monospace/pre elements rather than explicit `spellcheck="false"` attributes.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
