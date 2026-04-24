// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import React from "react";
import ReactDOM from "react-dom/client";
import { flushSync } from "react-dom";
import App from "./App";
import useProjectStore from "./stores/projectStore";
import useLayoutStore from "./stores/layoutStore";
import "./styles/tokens.css";
import "./styles/app.css";
import "katex/dist/katex.min.css";

interface PreloadedData {
  /** Set on success; null on error (env var pointed at an invalid path). */
  dir: string | null;
  notes?: Array<{ path: string; name: string; modified_at: number }>;
  /** Set when dir is null — the reason open_project rejected the path. */
  error?: string;
}

// ---------------------------------------------------------------------------
// Shared render logic
// ---------------------------------------------------------------------------

/**
 * Get the #root element, creating and appending it if WebKit automation
 * removed it from document.body as part of its DOM reset.
 */
function getOrCreateRootElement(): HTMLElement {
  let el = document.getElementById("root") as HTMLElement | null;
  if (!el) {
    el = document.createElement("div");
    el.id = "root";
    document.body.appendChild(el);
  }
  return el;
}

let reactRoot: ReactDOM.Root | null = null;

/**
 * Pre-hydrate Zustand (if __NOTESAPP_PRELOADED__ is available) then do a
 * fresh synchronous render into #root.  Safe to call at any time — creates
 * a new ReactDOM root each time so there is no stale fiber state.
 *
 * Exposed as window.__notesapp_boot__ so the wdio.conf.ts before hook can
 * call it directly via browser.execute(), bypassing any passive-effects /
 * MessageChannel issues in WebKit automation mode.
 */
function boot() {
  const preloaded = (
    window as Window & { __NOTESAPP_PRELOADED__?: PreloadedData }
  ).__NOTESAPP_PRELOADED__;

  // Pre-hydrate Zustand before creating the React root.  No React fiber tree
  // exists at this point, so setState() is a pure mutation with no side
  // effects.
  if (preloaded?.dir) {
    // Success path (cases B/C/D): pre-hydrate with isLoaded=true so AppShell
    // renders immediately without any IPC round-trips.
    useProjectStore.setState({
      projectDir: preloaded.dir,
      notes: preloaded.notes ?? [],
      isLoaded: true,
      error: null,
    });
  } else if (preloaded) {
    // Error path (cases E/F/G/H/I): env var was set but open_project rejected
    // the path.  Pre-hydrate the error so ProjectLoader skips tryAutoLoad()
    // and shows the chooser immediately.
    useProjectStore.setState({
      projectDir: null,
      notes: [],
      isLoaded: false,
      error: preloaded.error ?? "Unable to open project directory",
    });
  }

  // Unmount any previous root so React can clean up its fiber tree.
  if (reactRoot) {
    try {
      reactRoot.unmount();
    } catch {
      // Ignore — proceed with a fresh root regardless.
    }
    reactRoot = null;
  }

  const rootEl = getOrCreateRootElement();
  reactRoot = ReactDOM.createRoot(rootEl);

  // flushSync bypasses the concurrent scheduler (which may be blocked after
  // a DOM reset) and forces a synchronous render.
  flushSync(() => {
    reactRoot!.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>,
    );
  });
}

// Expose boot() globally so wdio.conf.ts can call it via browser.execute().
(window as Window & { __notesapp_boot__?: () => void }).__notesapp_boot__ = boot;

// Expose store getters for E2E test introspection (read-only by convention).
(
  window as Window & {
    __notesapp_layout__?: () => ReturnType<typeof useLayoutStore.getState>;
  }
).__notesapp_layout__ = () => useLayoutStore.getState();

// ---------------------------------------------------------------------------
// Initial render (non-automation normal path)
// ---------------------------------------------------------------------------

// Use flushSync to force a synchronous initial render so the DOM is populated
// immediately.  This is important for WebKit WebDriver automation, where the
// concurrent-mode scheduler's MessageChannel-based queue may not be processed
// before the first WebDriver command checks the DOM.
//
// In automation mode (navigator.webdriver === true) the before hook in
// wdio.conf.ts calls window.__notesapp_boot__() explicitly after
// __NOTESAPP_PRELOADED__ is set, so the initial render here may be stale
// (it runs before on_page_load sets the preloaded data).  That is acceptable —
// the before hook's explicit boot() call re-renders into a fresh root with the
// correct data, and its waitForExist("app-shell") ensures the test suite only
// starts once AppShell is live.
boot();

// ---------------------------------------------------------------------------
// WebKit automation DOM-reset recovery (belt-and-suspenders)
// ---------------------------------------------------------------------------
//
// WebKit automation mode may clear document.body (removing #root entirely) or
// clear #root.children after page load.  We detect the latter via a
// MutationObserver on #root.childList.  When detected, we immediately call
// boot() again — by this point on_page_load(Finished) has already fired and
// set __NOTESAPP_PRELOADED__, so boot() renders AppShell directly.
//
// NOTE: If WebKit removes #root from document.body (not just clears its
// children), this observer will NOT fire — in that case the before hook's
// explicit browser.execute(() => window.__notesapp_boot__()) is the primary
// recovery path.

const rootElementForObserver = document.getElementById("root");
if (rootElementForObserver) {
  const automationResetObserver = new MutationObserver(() => {
    if (rootElementForObserver.childElementCount === 0) {
      automationResetObserver.disconnect();
      // __NOTESAPP_PRELOADED__ is already set (on_page_load fires before the
      // reset).  boot() will pre-hydrate Zustand and render AppShell.
      boot();
    }
  });
  automationResetObserver.observe(rootElementForObserver, { childList: true });
}
