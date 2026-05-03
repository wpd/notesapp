# NotesApp — Spec-vs-Code Audit

This document is the **single authoritative gate** between SPEC.md and
the running application. Every spec'd behavior from SPEC.md §4.1 (tile
and layout shortcuts), §5.1 (editor-internal Emacs bindings), and §5.5
(Missing tile) must appear here with one of three statuses:

- **IMPLEMENTED** — coded and verified in the running app; cite the
  handler location and the unit test that covers it.
- **DEFERRED** — explicitly postponed in ROADMAP.md; cite the phase and
  line.
- **MISSING** — not yet implemented and not explicitly deferred; this
  is a bug against the current phase (see ISSUES.md).

**Rules:**
- Before declaring any phase complete, reconcile this document against
  `SPEC.md` and update every row to reflect current code.
- An `IMPLEMENTED` entry without a passing smoke-check result (bottom
  of this file) means the phase is not complete.
- A `DEFERRED` entry without a ROADMAP.md citation is invalid — track
  down the deferral or reclassify as `MISSING`.
- A `MISSING` entry that is not in ISSUES.md must be filed there.

---

## §4.1 — Tile and Layout Shortcuts

| Shortcut | Spec'd behavior | Status | Evidence |
|---|---|---|---|
| `C-x o` | Focus next tile (cycle) | IMPLEMENTED | `useKeyboardShortcuts.ts:193`; `useKeyboardShortcuts.test.ts:96` |
| `C-x O` | Focus previous tile | IMPLEMENTED | `useKeyboardShortcuts.ts:201`; `useKeyboardShortcuts.test.ts:108` |
| `C-x h` | Split current tile horizontally | IMPLEMENTED | `useKeyboardShortcuts.ts:209` |
| `C-x v` | Split current tile vertically | IMPLEMENTED | `useKeyboardShortcuts.ts:216` |
| `C-x 0` / `C-x w` | Close current tile | IMPLEMENTED | `useKeyboardShortcuts.ts:223` |
| `C-x z` | Maximize / restore current tile | IMPLEMENTED | `useKeyboardShortcuts.ts:230` |
| `C-x b` | Buffer switcher (modal by tile mode) | IMPLEMENTED | `useKeyboardShortcuts.ts:237` |
| `C-x n n` | Mode → Editor | IMPLEMENTED | `useKeyboardShortcuts.ts:155` |
| `C-x n p` | Mode → Preview (no-op on non-.md) | IMPLEMENTED | `useKeyboardShortcuts.ts:159` |
| `C-x n r` | Mode → Reference | IMPLEMENTED (Phase 1 stub picker) | `useKeyboardShortcuts.ts:172`; full picker DEFERRED: ROADMAP.md Phase 3 |
| `C-x n c` | Mode → AI Chat | IMPLEMENTED (Phase 1 stub picker) | `useKeyboardShortcuts.ts:176`; full picker DEFERRED: ROADMAP.md Phase 4 |
| `C-x C-s` | Save current note | IMPLEMENTED | `useKeyboardShortcuts.ts:272`; `EditorPane.tsx:209` |
| `C-x C-f` | Open note by name | IMPLEMENTED | `useKeyboardShortcuts.ts:291` |
| `C-x C-r` | Open reference by name | MISSING | No handler. Tracked in ISSUES.md. |
| `C-x p` | Toggle pin on Editor tile | IMPLEMENTED | `useKeyboardShortcuts.ts:258` |
| `Cmd+B` / `Ctrl+Shift+B` | Toggle activity sidebar | IMPLEMENTED (`Ctrl+Shift+B` only on Linux/Windows) | `useKeyboardShortcuts.ts:123`; `Cmd+B` is macOS-only and untested on current dev platform |
| `Ctrl/Cmd+Shift+F` | Global project search | DEFERRED | ROADMAP.md Phase 3 |
| `C-x N` (1–9) | Focus tile by reading-order index | IMPLEMENTED | `useKeyboardShortcuts.ts:298`; `useKeyboardShortcuts.test.ts:96` |
| `Ctrl/Cmd+=` | Increase font size of focused tile | IMPLEMENTED | `useKeyboardShortcuts.ts:131`; `layoutStore.ts:incrementTileFontScale`; `useKeyboardShortcuts.test.ts:368` |
| `Ctrl/Cmd+-` | Decrease font size of focused tile | IMPLEMENTED | `useKeyboardShortcuts.ts:136`; `layoutStore.ts:decrementTileFontScale`; `useKeyboardShortcuts.test.ts:373` |
| `Ctrl/Cmd+0` | Reset font size of focused tile | IMPLEMENTED | `useKeyboardShortcuts.ts:141`; `layoutStore.ts:resetTileFontScale`; `useKeyboardShortcuts.test.ts:378` |

## §5.1 — Editor-Internal Emacs Bindings

| Feature | Status | Evidence |
|---|---|---|
| Core Emacs bindings (`C-f/b/n/p`, `M-f/b`, `C-a/e`, `C-k`, `C-y`, `C-space`, `C-w`, `M-w`, `C-/`, `C-g`) | IMPLEMENTED | `EditorPane.tsx` adds `emacs()` extension; `@replit/codemirror-emacs@6.1.0` |
| `M-<` (beginning of buffer) / `M->` (end of buffer) via Esc prefix | IMPLEMENTED | `useKeyboardShortcuts.ts:82`; `useKeyboardShortcuts.test.ts:294` |
| `Esc f/b/d/Backspace` (word move/kill via Esc-Meta prefix) | IMPLEMENTED | `useKeyboardShortcuts.ts:45-52` (META_COMMANDS table) |
| `C-s` / `C-r` incremental search | DEFERRED | ROADMAP.md Phase 5 |
| `M-%` / `M-C-%` query-replace | DEFERRED | ROADMAP.md Phase 5 |
| Keyboard macros (`C-x ( ) e`) | DEFERRED | ROADMAP.md Phase 5 |
| Rectangle operations | DEFERRED | ROADMAP.md Phase 5 |

## §5.5 — Missing Tile

| Feature | Status | Evidence |
|---|---|---|
| Layout restore with missing file → Missing mode | IMPLEMENTED | `layoutStore.ts:loadLayout` |
| File watcher deletion → Missing mode | IMPLEMENTED | `App.tsx` file-watcher handler |
| Missing tile UI (Locate, Open different, Close) | IMPLEMENTED | `MissingTile.tsx` |
| Missing tile serialized in layout.json | IMPLEMENTED | `layoutStore.ts:persistLayout` |

## §4.3 — Fonts and Font Size

| Feature | Status | Evidence |
|---|---|---|
| JetBrains Mono in Editor tiles | IMPLEMENTED | `tokens.css:--font-editor`; `editorTheme.ts:19` |
| Inter in Preview tiles | IMPLEMENTED | `tokens.css:--font-prose`; `PreviewPane.tsx:138` |
| Per-tile font scale (Ctrl+= / Ctrl+- / Ctrl+0) | IMPLEMENTED | `layoutStore.ts:tileFontScale`; `EditorPane.tsx:58`; `PreviewPane.tsx:23`; Phase 1 uses CSS-variable base (14px/16px) per ROADMAP.md Phase 1 Substitutions |
| Font size from project.toml defaults | DEFERRED | ROADMAP.md Phase 6 |

---

## Smoke Checklist — Run Before "Phase N Complete"

These checks exercise the running application via `npm run tauri dev`.
Each maps to an `IMPLEMENTED` row above. Paste a timestamped pass/fail
result here before declaring phase completion.

**Layout shortcuts:**
1. `C-x o` — with two tiles open, cycles focus between them.
2. `C-x O` — with two tiles open, cycles focus in reverse.
3. `C-x h` — focused tile splits horizontally.
4. `C-x v` — focused tile splits vertically.
5. `C-x 0` — closes focused tile; Close button only works when >1 tile.
6. `C-x z` — maximizes focused tile; repeating restores.
7. `C-x b` — opens buffer switcher over focused Editor tile.
8. `C-x n n` / `C-x n p` — mode switches; confirm title-bar indicator updates.
9. `C-x C-s` — saves current note; dirty dot clears.
10. `C-x C-f` — opens note-picker; selecting a note loads it.
11. `C-x p` — pin icon appears on Editor tile; second `C-x p` unpins.
12. `Ctrl+Shift+B` — sidebar collapses and expands.
13. `C-x 1` / `C-x 2` — with two tiles, focus jumps to the named tile.
14. `C-x C-c` — app presents quit dialog (or quits cleanly if no unsaved changes).

**Font size:**
15. `Ctrl+=` five times on a focused Editor tile — text visibly grows.
16. `Ctrl+-` five times — text visibly shrinks.
17. `Ctrl+0` — text returns to default size.
18. Repeat steps 15–17 on a focused Preview tile — rendered markdown font scales.
19. Confirm changes on tile A do NOT affect tile B when both are open.
20. Close project and reopen — font scale is reset to default (not persisted).

**Editor-internal Emacs:**
21. In an Editor tile: `C-a` (line start), `C-e` (line end), `C-k` (kill line), `C-y` (yank).
22. `Esc >` — cursor jumps to end of document.
23. `Esc <` — cursor jumps to beginning.
24. `Esc f` / `Esc b` — cursor moves forward/backward by word.

**Missing tile:**
25. Delete a file that is bound to an open tile — tile transitions to Missing mode.
26. Click Locate… — OS picker scopes to the file's directory.
27. Restart app pointing at a project where a bound file is gone — tile opens in Missing mode.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
