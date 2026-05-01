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

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
