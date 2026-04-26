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

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
