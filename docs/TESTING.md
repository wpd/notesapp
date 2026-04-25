# Testing — NotesApp

This document is the authoritative testing reference. Read it before
adding tests or claiming a feature is done. The summary in
`CLAUDE.md §4` is intentionally brief; the layer-by-layer responsibilities
and per-feature coverage requirements live here.

---

## 1. Three-Layer Test Strategy

Every feature must be covered at the appropriate layer(s).

### Layer 1 — Rust unit tests (`cargo test`)

Run with `cargo test --manifest-path src-tauri/Cargo.toml`.

- All file I/O logic
- `NOTESAPP_PROJECT_DIR` resolution (SPEC.md §6.1.1) — every case A–I
- Project scaffolding (SPEC.md §6.1.1) — creates `.notesapp/`, `notes/`,
  `references/`, `attachments/`, and the first note; aborts on collision
- File watcher integration (SPEC.md §2.3) — emits expected events on
  delete and rename
- Search index (Tantivy) operations
- AI proxy / streaming logic
- Config parsing, including malformed `project.toml` (case G)
- Markdown front-matter parsing
- Layout JSON serialization including tile mode, buffer binding, and
  unresolvable (Missing) bindings
- Any pure function in the Rust backend

### Layer 2 — Vitest frontend unit tests (`npm run test:unit`)

- React component rendering (React Testing Library)
- Zustand store logic
- Yjs CRDT bridge / markdown↔ProseMirror translation
- CodeMirror extension behavior
- Tile mode model (SPEC.md §4.0.1): split inheritance, mode-switch
  shortcuts, Editor↔Preview title-bar toggle, markdown-only Preview
  restriction, cancel-mode-switch rollback
- Buffer picker contents per mode (SPEC.md §4.0.2)
- Last-tile release of modified buffer (SPEC.md §4.0.1): Save, Discard,
  Cancel, and the consolidated app-quit dialog
- Missing-tile recovery (SPEC.md §5.5): Locate scope derivation,
  Open-a-different-buffer opens Editor picker, Continue/Cancel on
  unsaved changes
- "Insert into note" target resolution (SPEC.md §4.4)
- Utility functions and hooks

### Layer 3 — WebdriverIO E2E tests (`npm run test:e2e`)

- App launches and renders the main window
- Each `NOTESAPP_PROJECT_DIR` resolution case produces the correct
  startup behavior
- Tile splitting (horizontal and vertical) inherits parent mode and
  buffer
- Files open in the correct tile
- Editor keystrokes appear in a Preview tile bound to the same note
- A Preview tile bound to a *different* note is unaffected by edits
  elsewhere
- Keyboard shortcuts function as specified
- Mid-session external file deletion transitions bound tiles to
  `Missing` mode via the file watcher
- Primary note pin/unpin behavior
- Layout persistence across restart
- Any workflow that crosses the Rust/frontend boundary

---

## 2. Test-First Discipline

Write tests before or alongside implementation, not after. If a task is
"implement feature X", the definition of done is: all three test layers
pass for feature X, not just that the feature appears to work.

---

## 3. E2E Test Infrastructure

E2E tests use Tauri's official WebDriver support + WebdriverIO.

- Tests live in `tests/e2e/`.
- The test runner starts the Tauri app binary, drives it via WebDriver,
  and asserts on DOM state and Tauri command results.
- Use `xvfb-run` to run headlessly: `xvfb-run npm run test:e2e`.
  `npm run test:e2e` must invoke `xvfb-run` internally so it works
  without a display environment.
- Every significant user-visible behavior must have at least one E2E
  test.
- E2E tests should be deterministic — no sleeps, use explicit waits.

For known WebKitGTK ↔ WKWebView divergences and the synthetic-event
workaround pattern (drag-and-drop), see `COMPAT.md` and
[`PLATFORM.md`](PLATFORM.md).

---

## 4. Test Naming Convention

```
tests/unit/ComponentName.test.tsx
tests/unit/storeName.test.ts
src-tauri/src/module/tests.rs     (inline Rust tests)
tests/e2e/featureName.e2e.ts
```

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
