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

*This document was co-authored with [Claude](https://www.anthropic.com/claude) (Anthropic). Licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).*
