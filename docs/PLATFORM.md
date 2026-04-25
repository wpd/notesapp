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

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
