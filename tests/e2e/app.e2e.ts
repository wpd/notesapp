// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * E2E smoke tests — Phase 1 infrastructure baseline.
 *
 * These tests require:
 *  - webkit2gtk-driver installed (provides WebKitWebDriver)
 *  - App compiled: npm run tauri:build
 *  - tauri-driver on PATH
 *
 * Run via: npm run test:e2e
 */

describe("App launch", () => {
  it("should display the main window", async () => {
    // Verify the app root element is rendered
    const appRoot = await $('[data-testid="app-root"]');
    await expect(appRoot).toBeDisplayed();
  });

  it("should show the NotesApp title in the window", async () => {
    const title = await browser.getTitle();
    expect(title).toBe("NotesApp");
  });
});
