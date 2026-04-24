# Compatibility Notes — Dev (Linux) vs. Production (macOS)

Per `CLAUDE.md §4.2`, this file documents known rendering or behavior
differences between the Linux development VM (WebKitGTK) and the macOS
production target (WKWebView).

## Drag-and-Drop: WebKitGTK WebDriver limitation

**Area:** Explorer sidebar drag → tile drop (SPEC.md §4.2)

**Problem:** WebKitGTK's WebDriver implementation does not reliably
synthesize HTML5 drag-and-drop gestures via the W3C Actions API. The
`dragstart`, `dragover`, and `drop` events are not dispatched by
WebDriver's pointer/touch action sequences — only `mousedown` /
`mouseup` fire.

**E2E workaround:** The E2E test in `tests/e2e/app.e2e.ts`
(`"Drag from Explorer onto tile rebinds"`) uses `browser.execute()` to
dispatch synthetic `DragEvent` objects with a hand-constructed
`DataTransfer`. This verifies that the React `onDrop` handler wiring
is correct, but does **not** exercise the native browser gesture
pipeline.

**Production verification:** macOS WKWebView has better-behaved HTML5
drag-and-drop support than WebKitGTK. Manual verification of the real
drag gesture should be performed on the macOS target before each
release. Automated E2E coverage of the native gesture is not feasible
on the Linux dev VM.

---

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
