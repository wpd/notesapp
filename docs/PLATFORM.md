# Platform — NotesApp

The NotesApp development workflow spans two platforms with different
roles. This document explains the split, the WebKitGTK ↔ WKWebView
policy, and how user-reported issues from macOS feed back into
development on Linux.

For provisioning the Linux dev VM (system packages, Rust, Node, Tauri
CLI, WebDriver), see `DEV_ENVIRONMENT.md` at the repo root.

---

## 1. Platform Facts

- **Development VM:** x86 Ubuntu 24.04 LTS
- **Production target:** Apple Silicon macOS (M1+)
- **Display:** The VM has a display server. Use `Xvfb` for headless E2E
  test runs.
- **Browser tooling:** Chrome + Claude in Chrome extension are installed
  and available for visual debugging, but all automated tests must run
  without human observation.

---

## 2. Webview Difference — Critical

Tauri on Linux uses **WebKitGTK**. Tauri on macOS uses **WKWebView**.
They are close but not identical. Known risk areas:

- Canvas rendering (Excalidraw)
- Font rendering and subpixel antialiasing
- CSS `backdrop-filter` support

When you observe a rendering difference between Linux dev and macOS
target, document it explicitly in `COMPAT.md` at the repo root and flag
it to the user. Do not silently work around it without noting the
divergence.

The Linux E2E suite is the project's only automated cross-webview test
layer. When a behavior cannot be faithfully exercised in WebKitGTK via
WebDriver (drag-and-drop is the canonical example — see `COMPAT.md`),
the Linux E2E test verifies the React-side wiring with synthetic events
and the actual gesture is verified manually on macOS. Mac-side E2E
infrastructure is deliberately deferred until a concrete divergence
demands it. When that happens, the right response is a single targeted
Mac E2E test for the divergent behavior — not a port of the full suite.

---

## 3. The Mac as Acceptance Environment

The macOS target is the production environment and the user's
daily-driver platform. It is **not** a second test environment for
Claude Code to maintain. Claude Code's testing responsibility ends at
the Linux VM passing all three test layers (`cargo test`, `vitest`,
`wdio`).

The user exercises the built application on macOS as the actual user,
and surfaces issues — usability gaps, spec ambiguities revealed by real
use, rendering discrepancies — back to Claude Code for resolution. The
Mac is where reality intrudes on the spec. That is a feature of the
workflow, not a bug in it.

When the user reports an issue from Mac usage:

1. The user describes the issue and what they observed (screenshot, log
   excerpt, or reproduction steps as appropriate).
2. Claude Code identifies whether the issue is (a) an implementation
   bug, (b) a spec gap revealed by real use, or (c) a Linux/macOS
   divergence.
3. For implementation bugs, fix in code with a regression test at the
   appropriate layer.
4. For spec gaps, update `SPEC.md` first to define the desired behavior,
   then implement against the updated spec. Do not implement first and
   document later.
5. For divergences, update `COMPAT.md` with the specific behavior, the
   Linux E2E coverage strategy (synthetic event, skipped, etc.), and
   the manual macOS verification expectation.

Claude Code does not produce vague diagnoses for Mac-reported issues.
"I don't know, try restarting" is not an acceptable response — every
report gets a specific, actionable diagnosis or an explicit statement
of what additional information would be needed to produce one.

---

## 4. The macOS-Resident Agent

§3 covers issues that reproduce on Linux. This section covers issues
that **do not** — issues whose root cause lies in macOS-specific code
paths or runtime behaviors that the Linux VM cannot exercise:

- `src-tauri/src/macos.rs` and any `#[cfg(target_os = "macos")]` code
- NSUserDefaults configuration and AppKit text-input behaviors
  (smart dashes, smart quotes, smart periods, autocorrect)
- WKWebView configuration, including spell-check, scrollbar styling,
  and any WKWebView quirk not reproduced by WebKitGTK
- Keychain access and the macOS Security framework
- macOS code signing, notarization, and Gatekeeper interactions
- Finder integration: drag-from-Finder, Quick Look, file-association
  launches
- macOS-specific menu bar items and `Cmd+` shortcut routing
- The macOS app bundle, its `Info.plist`, and entitlements

The VM agent cannot reproduce these and its diagnoses for them are
unreliable. These issues are owned by a **macOS-resident agent** —
Claude Code or the VSCode Claude plugin running on the Mac itself,
inside the cloned repository.

### 4.1 Stop-Early Rule

**Before investing any time diagnosing an issue, the Mac agent must
answer one question: does this bug plausibly reproduce on Linux?**

If the answer is yes — or even "probably" — stop immediately and tell
the user:

> "This issue is not macOS-specific. Route it to the VM agent, which
> has better tooling for cross-platform debugging (E2E suite, WebKit
> DevTools, faster iteration without a full macOS release build)."

Code paths that are almost never macOS-specific and should be escalated
without investigation:

- Frontend TypeScript / React components
- Zustand stores
- The remark / rehype / KaTeX / Mermaid rendering pipeline
- CodeMirror extensions (unless the symptom only appears in WKWebView)
- Rust commands that have no `#[cfg(target_os = "macos")]` gate
- File system operations, layout persistence, project loading

The cost of a wrong escalation (user reroutes to VM agent, who confirms
it's cross-platform) is low. The cost of the Mac agent spending an hour
on a frontend rendering bug that the VM agent could fix in ten minutes
is high.

### 4.2 Workflow

1. **User reports the macOS-specific issue to the Mac agent**, with
   reproduction steps and any visible symptoms.
2. **Mac agent reproduces, diagnoses, fixes, and rebuilds** on the
   actual platform. There is no courier step. The agent iterates
   directly: edit, `npm run tauri build`, run, observe.
3. **Mac agent adds regression coverage at the right layer** — see §4.4
   for the layer-selection rules, which differ from §3 because
   automation reaches less of the macOS surface.
4. **Mac agent commits and pushes.**
5. **VM agent (or CI) confirms the Linux test suite still passes**
   after the change. The VM agent does not need to understand the
   macOS-specific fix — only that the rest of the system is intact.

If the user reports something to the **VM** agent that turns out to be
macOS-specific, the right response is "this needs to go to the Mac
agent" — not a speculative diagnosis. The smart-dashes regression that
prompted §4 of this document is the cautionary tale: the VM agent
diagnosed it as a WebKitGTK ↔ WKWebView webview difference. The actual
cause was NSTextInputContext substitution happening in AppKit, before
the keystroke reached the webview at all. The VM cannot reproduce the
cause, observe the cause, or validate a fix for the cause.

### 4.3 What the Mac Agent Can and Cannot Observe

The Mac agent has the following observation mechanisms available:

**Direct, native:**
- Source code, command output, file system state.
- App `stdout` / `stderr` from a launched binary.
- Unified macOS logging via `log stream --predicate 'process == "NotesApp"'`.
- NSUserDefaults state via `defaults read`.
- App bundle contents, `Info.plist`, code signature.

**Programmatic UI inspection (the workhorse):**
- `safaridriver` (one-time `safaridriver --enable` required) drives the
  running app via WebDriver, types into elements, and inspects DOM
  state. This is the macOS analog of `WebKitWebDriver` on Linux.
- WebDriver lets the agent verify "did the right characters end up in
  the document," "is the right CSS class on the focused element," and
  similar DOM-observable invariants — without a human watching the
  screen.

**Awkward but possible:**
- `screencapture -l <window-id>` produces a PNG of the app window,
  which the agent can read. Useful for "show me what the rendered
  preview looks like right now"; not useful for verifying things that
  are visually subtle or hard to detect in a pixel array.

**Not available:**
- Real-time observation of the UI as the user interacts.
- Detection of rendered visuals that are **not in the DOM**: spell-check
  squiggles, native scrollbar styling, native text-substitution preview
  popups, font subpixel antialiasing, system-drawn focus rings. These
  are rendered by AppKit / WKWebView layers below the DOM and are not
  inspectable via WebDriver.
- Trackpad gestures, force touch, and input modalities not reachable
  from WebDriver's Actions API.
- Clicking "Allow" on macOS permission dialogs (Keychain access,
  accessibility, Gatekeeper). These need a human the first time.

### 4.4 Verification Layer Selection on the Mac

Because automation does not reach the full macOS surface, the Mac
agent's regression coverage uses a slightly different layering than
§3 / `TESTING.md`:

- **Logic that reproduces on Linux** → unit test (Vitest or `cargo
  test`). Same as anywhere else. Runs on the VM and the Mac.
- **Behavior observable in the DOM on macOS but not reproducible on
  Linux** → `safaridriver` E2E test guarded by
  `process.platform === "darwin"`. Example: a test that types
  `| --- | --- |` and asserts the resulting CodeMirror document does
  not contain U+2014. This is the right home for smart-dashes,
  smart-quotes, and smart-periods regression coverage. Add the test
  here even if you also keep the manual entry in
  `MACOS_ACCEPTANCE_TESTS.md` — automated coverage is preferred when
  it can be obtained.
- **Behavior visible only outside the DOM** (squiggles, native
  scrollbars, real Finder drag gestures, Keychain prompts, dark-mode
  appearance) → entry in `MACOS_ACCEPTANCE_TESTS.md`. The agent
  produces a precise, narrow checklist item — input, expected output,
  why it can't be automated — and the user runs it.

The `MACOS_ACCEPTANCE_TESTS.md` checklist is a legitimate verification
destination, not a fallback. When the Mac agent decides a check
belongs there, it states the reason explicitly (e.g., "squiggles are
rendered by WKWebView outside the DOM and cannot be inspected via
WebDriver"). The user then runs the listed steps and reports back.

### 4.5 The Achievable Goal

The realistic division of labor on a macOS-specific issue:

> **The Mac agent does all diagnosis, all code changes, all rebuilding,
> and all automatable verification. The user does the final brief
> visual check on items the agent has flagged in
> `MACOS_ACCEPTANCE_TESTS.md` as needing a human eye.**

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
