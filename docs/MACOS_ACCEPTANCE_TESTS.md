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
(via NSUserDefaults keys in `src-tauri/src/macos.rs`), visual
spell-check — red underlines under misspelled words — must remain
functional. `WebContinuousSpellCheckingEnabled` and
`NSContinuousSpellCheckingEnabled` are set explicitly to `YES` in
`disable_smart_substitutions()` because WKWebView embedded in a Tauri
app does not enable continuous spell-checking by default.

**Why squiggles only appear on previously-edited lines (now fixed):**
WKWebView's spell checker fires only in response to keyboard input
events, not programmatic DOM updates. CodeMirror loads document content
via a Yjs sync operation (no keyboard events), so pre-existing content
was never checked. The `spellcheckTrigger` extension
(`src/utils/spellcheckTrigger.ts`) fixes this by briefly toggling the
`spellcheck` attribute on the `contenteditable` after the document is
first populated, and again (debounced) when the viewport changes due to
scrolling. This forces WKWebView to rescan the entire visible content.

**Automated coverage:**
- `tests/unit/spellcheckTrigger.test.ts` — verifies the trigger fires
  on document load (empty → non-empty) and on viewport change, and
  debounces rapid scroll events.
- `tests/e2e/app.e2e.ts` — "Spellcheck DOM attribute" — verifies the
  CodeMirror `contenteditable` has `spellcheck="true"`.

The visual red-squiggles checks below remain manual macOS-only steps.

**Test 4a — squiggles appear on document open (not just on edited lines):**

Open a note that already contains misspelled words (or create one,
save it, close the app, and re-open it).

**Expected:** red underlines appear beneath misspelled words immediately
on open, without the user typing anything on those lines.

**Test 4b — squiggles appear after typing:**

**Input:** type a sentence with deliberate misspellings:

    teh quikc brown fox

**Expected:** red underlines appear beneath `teh` and `quikc`. The
underlines are rendered by WKWebView as an overlay and are not part of
the document text.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
