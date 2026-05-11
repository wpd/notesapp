# macOS Acceptance Tests

This document tracks acceptance tests for NotesApp behaviour that cannot
be verified in the Linux development environment because it depends on
macOS-specific OS features. Run these on a Mac after any change that
touches the relevant code paths.

Until the new-project wizard lands (ROADMAP.md Phase 6), the scaffolded
`notes/untitled.md` starter file is populated from this document via
`include_str!` in `src-tauri/src/fs.rs`. Opening a fresh project on a
Mac therefore drops you straight into the checklist below.

---

## Test 1 — Smart Dashes (em-dash collapse)

**Why it matters:** macOS WKWebView's NSTextInputContext substitutes
consecutive hyphens followed by a space with an em-dash (`—`, U+2014).
This corrupts Markdown table separators such as `| --- |`.

**Input:** type the following line exactly, including the trailing space
after the last hyphen:

    | --- | --- |

**Expected:** three literal ASCII hyphens (`-`) on each side of the
pipe. The em-dash character (`—`) **must not** appear.

---

## Test 2 — Smart Quotes

**Why it matters:** macOS WKWebView substitutes ASCII apostrophes and
double-quote characters with curly typographic quotes when typed in
context. This breaks code fences, inline code, link syntax, and any
other literal-character Markdown syntax.

**Input:**

    It's "fine".

**Expected:** ASCII apostrophe (`'`, U+0027) and ASCII double quotes
(`"`, U+0022). Curly quotes — `'` U+2018, `'` U+2019, `"` U+201C, `"`
U+201D — **must not** appear.

---

## Test 3 — Smart Periods (ellipsis collapse)

**Why it matters:** macOS WKWebView substitutes three consecutive ASCII
periods with a single ellipsis character (`…`, U+2026).

**Input:**

    Wait...

**Expected:** three literal ASCII period characters (`.`). The ellipsis
character (`…`) **must not** appear.

---

## Test 4 — Spell-check still works

**Why it matters:** while we disable the macOS auto-substitutions above
(via NSUserDefaults keys in `src-tauri/src/macos.rs`), spell-check —
red wavy underlines under misspelled words — must remain functional.

**Implementation note:** spellcheck is no longer handled by WKWebView's
native checker. Instead, `spellcheckTrigger` (`src/utils/spellcheckTrigger.ts`)
invokes `check_spelling` (a Rust Tauri command) on the empty→non-empty
document-load transition and after each edit (debounced). On macOS the Rust
backend calls `NSSpellChecker`; on Linux it uses `spellbook` (Hunspell).
Results are rendered as CodeMirror `.cm-spelling-error` decorations. This
approach was necessary because WKWebView's native checker fires only on
keyboard input events, not on the programmatic content load that yCollab
performs for every document open.

**Automated coverage:**
- `tests/unit/spellcheckTrigger.test.ts` — verifies `invoke("check_spelling")`
  is called on the empty→non-empty load transition and is debounced on
  subsequent edits.
- `tests/e2e/app.e2e.ts` — "Spellcheck DOM attribute" — verifies
  `spellcheck="true"` is set on the CodeMirror `contenteditable`.
- `tests/e2e/app.e2e.ts` — "Spelling decorations render on misspelled
  words" — opens `spellcheck.md` (fixture with deliberate misspellings),
  waits for the async IPC round-trip, and asserts that `.cm-spelling-error`
  spans appear in the DOM. Runs on both Linux and macOS (blocked on macOS
  by ISSUE-003 until E2E infrastructure is available there).

**Test 4 — manual macOS check (visual confirmation only):**

The automated tests above verify the mechanics. This manual step
confirms that NSSpellChecker is returning correct ranges for real content.

**Input:** type a sentence with deliberate misspellings:

    teh quikc brown fox

**Expected:** red wavy underlines appear beneath `teh` and `quikc`.
Note: words in NSSpellChecker's autocorrect database (e.g. `teh`) may
not be underlined if NSSpellChecker auto-corrects them before flagging —
this is a known NSSpellChecker API limitation. Use `quikc` as the
primary test word.

---

## Test 5 — Excalidraw Canvas Renders (Phase 2 M4)

**Why it matters:** Excalidraw uses `<canvas>` elements whose pixel
output is outside WebDriver's reach. Visual correctness must be checked
manually on the target platform.

**Steps:**

1. Open a note in Preview mode.
2. Press `C-c d` (or click the ✏ toolbar button) — a drawing block appears.
3. Double-click the drawing block — Excalidraw opens in edit mode with an empty canvas.
4. Draw a simple shape (e.g. a rectangle).
5. Press `Escape` — edit mode exits, drawing block returns to view mode.
6. Verify the shape is visible in the read-only canvas.
7. Save the note (`C-x C-s`) and reopen it — the drawing must still be visible.

**Expected:** Canvas renders at each step; no blank white box or error.

**Automated coverage:** `tests/unit/drawingSidecar.test.ts` and
`src-tauri/src/commands/drawings.rs` unit tests cover sidecar path helpers
and Rust I/O. Canvas pixel output is inherently macOS/WebKit-dependent.

---

## Test 6 — Rich Paste Preserves Formatting (Phase 2 M5)

**Why it matters:** The clipboard paste transformation
(`transformPastedText` in `WysiwygPane.tsx`) converts pasted markdown
text into formatted content. Whether the resulting HTML paste is accepted
by WKWebView depends on how WKWebView handles `ClipboardEvent` data.

**Steps:**

1. Open a note in Preview mode.
2. Copy the following markdown text from any source (e.g. a terminal):
   ```
   ## Section Title
   **bold text** and _italic text_
   - Bullet one
   - Bullet two
   ```
3. Paste (`Cmd+V`) into the WYSIWYG editor.
4. Check that the pasted content appears formatted — heading renders as
   a heading, bold/italic apply, bullets appear as a list.

**Expected:** Formatting is preserved. Plain unformatted text must not appear.

**Automated coverage:** `transformPastedText` logic is unit-tested
indirectly via the `renderMarkdownSync` path in `markdownPipeline.test.ts`.
Actual clipboard integration requires macOS/WKWebView.

---

## Phase 3: PDF.js Worker Load Verification

**Goal:** Confirm the PDF.js web worker loads correctly under WKWebView.

**Steps:**
1. Open the app on macOS.
2. Open a Reference tile and bind it to a `.pdf` file.
3. Open Safari's Web Inspector → Console while the PDF loads.

**Expected:** No worker-load errors in the console. The PDF renders with a
page count indicator in the navigation bar.

**Why not automated:** The asset URL resolution for `asset://localhost/...`
may differ between WebKitGTK (Linux) and WKWebView (macOS). The console error
only appears in the real macOS runtime. See ISSUE-015 and `COMPAT.md`.

---

## Phase 3: Real Finder Drag into References Sidebar

**Goal:** Confirm that dragging a PDF or markdown file from the macOS Finder
into the References sidebar section imports it into `references/`.

**Steps:**
1. Open a project in the app.
2. Open the sidebar References section.
3. Drag a PDF file from the Finder and drop it onto the References section.
4. Observe: a) the file appears in the references list; b) the file exists
   in `<project>/references/` in the Finder.

**Expected:** File is imported (copied) to `references/`, list refreshes,
no modal errors.

**Why not automated:** The macOS Finder drag uses the OS-level drag-and-drop
layer (`NSFilePromiseProvider`). WebDriver cannot inject a Finder drag event
reliably. HTML `DataTransfer.files` in the drop handler works only for
browser-originated drops, not Finder drags. Requires physical or
Accessibility-API-driven testing.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
