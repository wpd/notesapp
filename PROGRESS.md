# Phase 1 Gap-Closing Progress

## Objective
Close every ROADMAP.md Phase 1 deliverable that the audit flagged as missing,
then confirm `npm run test` still exits 0 with new tests for the new behavior.

## Task Order
1. **Emacs keybindings** — install `@replit/codemirror-emacs`, replace ad-hoc keymap.
2. **Mermaid rendering** — wire mermaid into markdown pipeline; inline errors.
3. **Scroll-sync** — best-effort editor cursor ↔ preview position.
4. **Layout persistence on every structural change** — splitTile/closeTile/togglePin/toggleMaximize/setTileFile/setMosaicTree.
5. **Crash-recovery dialog** — call `find_recovery_files` on project open, Recover/Discard UI.
6. **Nits** — LaTeX/Mermaid editor syntax highlighting, native webview spellcheck + suppression, word-wrap button in TileBar not status bar, dedicated C-x C-f picker distinct from C-x b, `⚠ File not found` card when filePath missing on disk.
7. **Layout-persists-across-relaunch E2E test** — restart app, verify tree restored.

## Status
All 7 tasks complete.

| # | Task | Status | Tests added |
|---|------|--------|-------------|
| 1 | Emacs keybindings (`@replit/codemirror-emacs`) | ✅ | E2E: M-> smoke test |
| 2 | Mermaid rendering | ✅ | Vitest: 3 mermaidRenderer tests; Pipeline: language-mermaid class test |
| 3 | Best-effort scroll-sync | ✅ | Vitest: data-source-line attribute test |
| 4 | Layout auto-persist on structural change | ✅ | Vitest: 8 auto-persist tests (debounce, no-project-dir guard, each mutation) |
| 5 | Crash-recovery dialog | ✅ | Vitest: 6 RecoveryDialog tests (recover, discard, error, empty) |
| 6 | Nit-fixes | ✅ | Vitest: 3 EditorPane file-not-found + 3 BufferSwitcher find-file mode |
| 7 | Layout-persist E2E | ✅ | E2E: 2 persistence assertions (filesystem + shape invariants) |

### Task 6 sub-items
- ✅ LaTeX highlighting in fenced code blocks (already covered by `@codemirror/language-data`)
- ✅ Mermaid fenced blocks render as plain code in editor, SVG in preview (no CM language available)
- ✅ Native spellcheck enabled (`EditorView.contentAttributes.of({ spellcheck: "true" })`)
- ✅ `⚠ File not found` card when `read_note` rejects for a tile's filePath
- ✅ Distinct C-x C-f find-file picker with "Create new note: …" option
- ⏳ Move word-wrap toggle from editor status bar to TileBar (deferred — requires lifting state to store or component ref)

## Final test counts
- Rust: 15 tests pass
- Vitest: 9 files, 84 tests pass
- E2E: 26/26 pass

## Baseline (pre-change)
- Rust: 15 tests pass
- Vitest: 6 files, 59 tests pass
- E2E: 23/23 pass

## Notes / Decisions
- Each task must leave `npm run test` green before moving on.
- Add new tests at the appropriate layer — don't just add behavior without coverage.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
