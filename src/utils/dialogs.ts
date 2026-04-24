// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Thin wrapper around @tauri-apps/plugin-dialog that supports a
 * test-mode override. In E2E tests, the WebDriver script sets
 * `window.__notesapp_test_chooser__` to a string path (or a function
 * returning one) so that tests can exercise dialog-driven flows
 * without triggering the native OS file chooser, which blocks WebDriver.
 *
 * Test escape hatch — the window property is never set in production.
 */

import { open as nativeOpen } from "@tauri-apps/plugin-dialog";

interface OpenDialogOptions {
  directory?: boolean;
  multiple?: boolean;
  defaultPath?: string;
}

// Augment window for the test override
declare global {
  interface Window {
    __notesapp_test_chooser__?:
      | string
      | null
      | ((opts: OpenDialogOptions) => string | null | Promise<string | null>);
  }
}

export async function openFileDialog(
  opts: OpenDialogOptions,
): Promise<string | null> {
  const override = window.__notesapp_test_chooser__;
  if (override !== undefined) {
    if (typeof override === "function") {
      return override(opts);
    }
    // string | null — consume and clear (one-shot)
    window.__notesapp_test_chooser__ = undefined;
    return override;
  }
  const result = await nativeOpen(opts);
  if (result === null || result === undefined) return null;
  return typeof result === "string" ? result : result[0] ?? null;
}
