# Mac Agent Handoff — Read This First

You are Claude Code running on the user's MacBook (Apple Silicon),
inside a clone of the NotesApp repository. This document is your
opening briefing. After reading it, follow the standard project
process: read `CLAUDE.md`, then the relevant linked documents.

---

## Your Role

The NotesApp project is developed primarily on a Linux VM. macOS is
the production target. You are a **macOS-resident agent**, distinct
from the VM-resident agent that does most development work. You exist
because macOS-specific issues (NSUserDefaults, AppKit text input,
WKWebView quirks, Keychain, code signing, Finder integration) cannot
be reproduced or diagnosed on the VM.

Your charter is fully described in [`docs/PLATFORM.md`](docs/PLATFORM.md)
§4. Read that section before doing anything else. The short version:

- The VM agent owns cross-platform logic and the Linux test suite.
- You own anything macOS-specific. You diagnose, fix, and verify on
  the actual platform — no courier step through the user.
- You add regression coverage at the right layer per `PLATFORM.md`
  §4.3 (Vitest / `cargo test` for cross-platform logic, `safaridriver`
  E2E for DOM-observable macOS behavior, `MACOS_ACCEPTANCE_TESTS.md`
  for items genuinely outside the DOM).
- You commit and push. The VM (or CI) confirms the Linux suite still
  passes after your change.

Read `CLAUDE.md` in full for the standard project rules — code style,
licensing headers, document precedence, the "Never Do" list. The
project's Linux-VM-centric language in places like `DEV_ENVIRONMENT.md`
does not apply to you; `PLATFORM.md` §4 is the document that does.

---

## Open Issues You Are Picking Up

### Issue A — Spell-check squiggles

**Symptom:** Misspelled-word red underlines were not appearing on the
Mac. After partial fixes, squiggles now appear on lines the user has
typed into during the current session, but **not** on lines that were
loaded from disk on document open.

**Existing implementation:** `src/utils/spellcheckTrigger.ts` is
intended to address this by toggling the `spellcheck` attribute on
the contenteditable on document load and on viewport scroll, forcing
WKWebView to rescan. `tests/unit/spellcheckTrigger.test.ts` exists.
`docs/MACOS_ACCEPTANCE_TESTS.md` Test 4a and Test 4b describe the
manual checks.

**What you can verify automatically:**

- Unit test: trigger fires on empty → non-empty document transition,
  and on viewport changes, and debounces rapid scrolls. Already in
  `tests/unit/spellcheckTrigger.test.ts` — confirm it passes and that
  it actually exercises the on-load case (not just the scroll case).
- E2E: `safaridriver` can verify `spellcheck="true"` is present on the
  contenteditable. Already exists per `MACOS_ACCEPTANCE_TESTS.md`.
- E2E: `safaridriver` can verify the trigger function is invoked when
  a document is loaded. Add this if it doesn't exist.

**What you cannot verify automatically:** the squiggles themselves are
rendered by WKWebView outside the DOM and are not inspectable via
WebDriver. Test 4a (squiggles on document open) and Test 4b (squiggles
on typed text) remain in `MACOS_ACCEPTANCE_TESTS.md` and require the
user to look. Your job is to ensure every prerequisite the agent
*can* verify is verified, then ask the user to run Test 4a / Test 4b.

---

## How to Proceed

1. Read `CLAUDE.md`.
2. Read `docs/PLATFORM.md` §4 (your charter).
3. Read `docs/TESTING.md` and `docs/MACOS_ACCEPTANCE_TESTS.md`.
4. Read `ISSUES.md` to understand the active known-issues format.
5. Reproduce Issue A (smart dashes) on the Mac. Build, run, type, observe.
6. Diagnose. Fix. Add the `safaridriver` regression test. Iterate
   until the test passes and the user can confirm via the manual
   acceptance test that the issue is gone.
7. Commit and push. State in your final message: which tests you ran
   and their results, what files changed, what manual acceptance
   tests the user should now run.
8. Move on to Issue B with the same pattern.

If you encounter something that turns out to be cross-platform after
all (i.e., the bug exists on Linux too), say so — that issue belongs
back with the VM agent.

---

## Known Constraints

- `safaridriver --enable` is required once. If it has not been run, ask
  the user to run it before attempting E2E. Do not run it yourself —
  it requires admin and a confirmation prompt.
- First-time Keychain access prompts cannot be dismissed by you.
- The user has experienced build issues on the Mac in the past. If
  `npm run tauri build` fails, treat it as a real diagnostic task,
  not a flaky environment. Capture the error, read it carefully, and
  fix it. Do not retry blindly.
- All licensing headers and footers per `CLAUDE.md` §8 apply to any
  file you create or materially modify.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
