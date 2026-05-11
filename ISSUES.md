# Known Issues

## ISSUE-001 — E2E port leak: WebKitWebDriver subprocess tree survives SIGTERM

**Status:** Fixed (2026-04-25)

**Symptom:** After a test run, ports 4444 and 4445 remain in use. The next
`npm run test:e2e` invocation hangs or fails to connect until the stale
processes are manually killed (`fuser -k 4444/tcp 4445/tcp`). During
development, Claude ran this cleanup command 18 times in a single session as
a workaround.

**Root cause:** `onComplete` in both `wdio.conf.ts` and `wdio-env.conf.ts`
called `.kill()` (SIGTERM) on the `webkitDriver` and `appProcess` handles.
On Linux, WebKitWebDriver and WebKitGTK spawn child processes
(`WebKitNetworkProcess`, `WebKitWebProcess`, etc.) that may be in a separate
process group and do not receive the SIGTERM sent to the parent. These
survivors keep holding the inspection port (4445) and WebDriver port (4444).

**Fix:** Add an explicit `fuser -k 4445/tcp 4444/tcp` call at the end of
`onComplete` in both wdio config files, mirroring the existing cleanup at
the start of `onPrepare`. Also refactored `spawnSync` to a static import so
the dynamic `await import(...)` inside the `async onPrepare` was no longer
needed.

---

## ISSUE-002 — `npm run typecheck` (tsc --noEmit) does not check referenced projects

**Status:** Fixed (2026-04-25)

**Symptom:** CI failed at "Build release binary" with `Cannot find name 'window'`
in `wdio.conf.ts` and `wdio-env.conf.ts` despite `npm run typecheck` and the
pre-commit hook both reporting clean locally.

**Root cause:** Two compounding problems:

1. `tsconfig.wdio.json` had `"lib": ["ES2023"]` with no `"DOM"`. The `window`
   global appears inside `browser.execute(() => { ... window ... })` callbacks;
   TypeScript type-checks those bodies in Node context where `window` is unknown
   without the DOM lib.

2. `npm run typecheck` was `tsc --noEmit`, which checks only files in the root
   `tsconfig.json`'s `include` (`["src"]`). **TypeScript project references are
   only processed by `tsc -b`, not by `tsc --noEmit`.** So `tsconfig.wdio.json`
   (and `tsconfig.node.json`) were invisible to every local check including the
   pre-commit hook. CI's `tauri:build` step runs `npm run build` = `tsc -b &&
   vite build`, which processes all references — and caught the error.

**Fix:**
- Added `"DOM"` to `lib` in `tsconfig.wdio.json`.
- Changed `package.json` `typecheck` script from `tsc --noEmit` to `tsc -b` so
  local checks and the pre-commit hook are equivalent to what CI's build step
  runs.
- Added `/wdio-env.conf.{d.ts,js}` to `.gitignore` (the composite build emits
  these; `wdio.conf.{d.ts,js}` was already covered).

**Lesson:** Whenever a project uses TypeScript project references
(`tsconfig.json` → `"references": [...]`), the `typecheck` script must use
`tsc -b`, not `tsc --noEmit`. The `--noEmit` flag operates only on the root
project's files.

---

## ISSUE-003 — macOS E2E infrastructure not yet available

**Status:** Open

**Symptom:** `npm run test:e2e` exits 0 on macOS with "⚠️ E2E TESTS SKIPPED —
WebKitWebDriver not found." The E2E test suite (including the macOS-specific
"Spellcheck load trigger" test in `tests/e2e/app.e2e.ts`) does not run on
macOS.

**Root cause:** The E2E infrastructure (`check-e2e-deps.js`, `wdio.conf.ts`)
was written for Linux (WebKitGTK + `WebKitWebDriver`). The expected macOS path
was `safaridriver` wrapped by `tauri-driver`, but `tauri-driver` reports "not
supported on this platform" on macOS (Apple Silicon, 2026-04-27).

**Workaround:** macOS-specific DOM-observable behaviours (spell-check trigger,
smart-substitution prevention) are covered by unit tests and manual acceptance
tests in `MACOS_ACCEPTANCE_TESTS.md`. The macOS-guarded E2E tests added to
`app.e2e.ts` are `this.skip()`-ed on Linux and ready to run when a working
macOS WebDriver path is established.

**Unblocking:** investigate whether a newer `tauri-driver` release or an
alternative approach (direct `safaridriver` with `TAURI_WEBVIEW_AUTOMATION`,
custom WKWebView WebDriver bridge) supports Apple Silicon macOS. Track in
`docs/PLATFORM.md` §4 when resolved.

---

## ISSUE-004 — Spellcheck right-click "Suggestions" menu not implemented

**Status:** Open

**Symptom:** SPEC.md §4.4 originally called for right-clicking a misspelled
word to show OS spell-check suggestions. No such context menu exists.

**Background:** The spellcheck implementation shifted from the webview native
checker (which would have provided this for free) to a Rust-side
NSSpellChecker / spellbook approach that renders CodeMirror decorations.
The suggestion menu was not part of that change.

**Workaround:** None. The red underline marks misspelled words but offers no
correction UI.

**Resolution path:** Add a CodeMirror context-menu extension that (a) detects
a click on a `.cm-spelling-error` span, (b) invokes a new Tauri command
`suggest_spellings(word)` backed by `NSSpellChecker.guesses` on macOS and
`spellbook::Suggester` on Linux, and (c) renders suggestions in a floating
menu.

---

## ISSUE-005 — Process note: b42371e deviated from SPEC §4.4 without flagging

**Status:** Closed (retrospective record)

**Background:** Commit `b42371e` ("Fix macOS spell-check for pre-loaded content
via NSSpellChecker + CodeMirror decorations") replaced the "OS/webview native
spellcheck" called for in SPEC.md §4.4 with a Rust-side implementation.  The
engineering trade-off was sound (WKWebView's native checker fires only on
keyboard events, not on yCollab's programmatic content load), but the commit
did not update SPEC.md or flag the deviation per CLAUDE.md §6/§7.  This was
caught and corrected when Linux spell-check was later found never to have
worked, prompting a review.

**Fix applied:** SPEC.md §4.4 and ROADMAP.md updated to reflect the in-process
Rust implementation. Linux spellcheck restored via `spellbook` + the same
CodeMirror decoration pipeline already used on macOS.

**Lesson:** Any commit that deviates from SPEC.md must update the spec and/or
call out the deviation in the commit message and ISSUES.md, per CLAUDE.md §7.

---

## ISSUE-006 — `C-x C-r` (open reference by name) shortcut not implemented

**Status:** Open

**Symptom:** SPEC.md §4.1 lists `C-x C-r` as "Open reference by name (focused
Reference tile)". The shortcut is listed in `docs/SHORTCUTS.md:22` as if it
exists, but there is no handler in `src/hooks/useKeyboardShortcuts.ts` — the
chord falls through to the default `e.preventDefault()` branch and silently
does nothing.

**Root cause:** Phase 1 tiling-layout implementation did not include the
Reference tile infrastructure. The `C-x n r` mode-switch uses a stub picker
(per the Phase 1 substitution), and `C-x C-r` was never wired.

**Resolution path:** Implement in Phase 3 alongside the Reference tile and its
buffer picker. Update `docs/SHORTCUTS.md` and `docs/SPEC_AUDIT.md` when done.

---

## ISSUE-007 — Mermaid click-to-navigate-source not implemented (SPEC.md §5.2 line 498)

**Status:** Deferred — Phase 3

**Symptom:** SPEC.md §5.2 describes clicking a Mermaid diagram in a Preview tile
navigating to the corresponding code block in the sibling Editor tile. This
is not implemented.

**Root cause:** Requires cross-tile communication (WYSIWYG → Editor cursor jump)
and the ability to resolve a Mermaid node's source position in Y.Text. Deferred
in ROADMAP.md Phase 2 substitutions.

**Resolution path:** Implement in Phase 3.

---

## ISSUE-008 — SPEC.md §5.2 drawing fence example mismatches §3.2 form

**Status:** Fixed (2026-05-07)

**Symptom:** SPEC.md §5.2 showed a drawing fence example that used a full path,
while §3.2 uses the canonical `<stem>.NNNN.drawing` basename. The implementation
follows §3.2.

**Fix:** Updated SPEC.md §5.2 fence example to `my-diagram.0001.drawing` and
updated the prose description to use `<stem>.NNNN.drawing` language consistent
with §3.2.

---

## ISSUE-009 — SPEC.md §4.1 master shortcut table missing `C-c d`

**Status:** Fixed (2026-05-07)

**Symptom:** The `C-c d` shortcut (insert drawing block in Preview tile, Phase 2 M4)
was implemented in `useKeyboardShortcuts.ts` and documented in `docs/SHORTCUTS.md`
but missing from the SPEC.md §4.1 master table.

**Fix:** Added `C-c d` row to the SPEC.md §4.1 keyboard shortcut table.

---

## ISSUE-010 — No unit test for `C-c d` shortcut and `ccPrefixActive` state machine

**Status:** Fixed (2026-05-07)

**Symptom:** The `C-c d` chord (insert drawing block in the focused Preview tile)
was wired in `src/hooks/useKeyboardShortcuts.ts:194–224` but had no unit-test
coverage.

**Fix:** Added a "C-c d drawing insertion" describe block to
`tests/unit/useKeyboardShortcuts.test.ts` covering: (a) Ctrl+C does NOT arm prefix
in editor tiles; (b) Ctrl+C + d calls `next_drawing_number` and inserts `drawingBlock`
in preview tiles; (c) missing filePath short-circuits cleanly; (d) non-d key clears
the prefix and calls `preventDefault`.

---

## ISSUE-011 — No unit/component test for `WysiwygToolbar`

**Status:** Fixed (2026-05-07)

**Symptom:** All buttons in `src/components/WysiwygToolbar.tsx` were exercised
only by the smoke checklist.

**Fix:** Created `tests/unit/WysiwygToolbar.test.tsx` covering: null-editor
placeholder, button render assertions for all 13+ buttons, each inline mark /
heading / block button calls the expected `chain()` command, Insert-Drawing calls
`invoke("next_drawing_number")` and inserts `drawingBlock`, and Link button handles
URL/empty/cancel prompt results.

---

## ISSUE-012 — No test for paste (rich content into Preview tile)

**Status:** Fixed (2026-05-07)

**Symptom:** The `transformPastedText` logic had no automated test coverage.

**Fix:** Extracted the paste-transform logic from `WysiwygPane.tsx` into
`src/utils/pasteTransform.ts` (exporting `transformPastedText` and
`MARKDOWN_PASTE_RE`). Created `tests/unit/pasteTransform.test.ts` covering the
detection regex against 12 markdown patterns plus plain-text pass-through, and
asserting that markdown inputs produce HTML output (headings, bold, lists,
blockquotes, code blocks). `WysiwygPane.tsx` now imports from `pasteTransform.ts`.

---

## ISSUE-013 — No unit/component test for `DrawingNodeView` lifecycle

**Status:** Fixed (2026-05-07)

**Symptom:** `src/editor/nodes/DrawingNode.tsx` lifecycle behaviours were
uncovered.

**Fix:** Exported `DrawingNodeView` from `DrawingNode.tsx`. Created
`tests/unit/DrawingNode.test.tsx` with mocks for `@tiptap/react`,
`@excalidraw/excalidraw`, and `@tauri-apps/api/core`. Tests cover: `read_drawing`
called on mount with the correct sidecar path; loading indicator shown/hidden;
fallback to EMPTY_DRAWING on `read_drawing` rejection; double-click enters edit
mode; Escape exits edit mode; click-outside exits edit mode; autosave not called
before 30s when no changes are pending; no read_drawing when inputs are missing.

---

## ISSUE-014 — No E2E coverage for table insertion or drawing insertion

**Status:** Fixed (2026-05-07)

**Symptom:** No E2E tests covered WYSIWYG table or drawing block insertion.

**Fix:** Added two new describe blocks to `tests/e2e/app.e2e.ts`:
(1) "WYSIWYG toolbar — table insertion": clicks Insert-Table button and asserts
`<table>` appears in the ProseMirror DOM.
(2) "WYSIWYG drawing block insertion (C-c d)": sends Ctrl+C then d and asserts
`[data-testid="drawing-block"]` appears in the Preview tile.
Both suites follow the same setup pattern as the existing Emacs-keybindings suite
and are skipped on macOS (ISSUE-003).

---

## ISSUE-015 — PDF.js worker hosting: WKWebView vs WebKitGTK verification needed

**Status:** Open (2026-05-09)

**Symptom:** The PDF.js worker is hosted at `/pdfjs/pdf.worker.min.mjs` under
`public/`. On WebKitGTK (Linux dev) the `asset://localhost/pdfjs/...` URL is
served correctly via Tauri's asset protocol. On WKWebView (macOS production) the
URL may need a different path prefix depending on Tauri v2 asset configuration.

**Fix:** Run the PDF viewer on macOS and verify the worker loads without console
errors. If the worker URL must differ, detect the platform at runtime and choose
the appropriate URL. Track in `COMPAT.md`.

---

## ISSUE-016 — `pdf-extract` is synchronous and can block on large PDFs

**Status:** Open (2026-05-09)

**Symptom:** `pdf_extract::extract_text` is synchronous. For PDFs > 10 MB,
calling it from `SearchIndex::upsert_path` during watcher events or `full_reindex`
blocks the async executor.

**Fix:** Wrap calls to `extract_text` in `tokio::task::spawn_blocking` at the
call site in `search/index.rs`. The method signature already returns `Result` and
can propagate the join error.

---

## ISSUE-017 — WebKit clipboard API requires a user gesture for `writeText`

**Status:** Open (2026-05-09)

**Symptom:** `navigator.clipboard.writeText` requires a trusted user gesture in
WebKit. The `ReferenceContextMenu` "Copy" action fires from a `contextmenu` event
which may be rejected under `xvfb-run` in CI.

**Fix:** If clipboard writes fail in E2E tests, fall back to
`document.execCommand('copy')` (deprecated but functional in WebKit) or skip the
clipboard assertion and only assert the menu dismissed.

---

## ISSUE-018 — Tantivy search-index directory should be in `.gitignore`

**Status:** Open (2026-05-09)

**Symptom:** The Tantivy index (`.notesapp/search-index/`) can grow large. It
is rebuilt automatically if missing, so committing it serves no purpose.

**Fix:** Add a README snippet recommending users add to their project's
`.gitignore`:
```
.notesapp/search-index/
```

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
