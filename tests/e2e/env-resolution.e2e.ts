// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Parametric E2E spec for NOTESAPP_PROJECT_DIR resolution cases A–I.
 *
 * The driver script (scripts/run-multi-launch-e2e.js) invokes this spec
 * once per case, setting NOTESAPP_TEST_CASE to identify the scenario.
 *
 * Cases B, C, D → app should load successfully (app-shell visible).
 * Cases A, E, F, G, H, I → app shows the chooser (choose-directory-button visible).
 */

const testCase = process.env.NOTESAPP_TEST_CASE ?? "?";

describe(`NOTESAPP_PROJECT_DIR case ${testCase}`, () => {
  if (["B", "C", "D"].includes(testCase)) {
    it(`case ${testCase} loads the app shell`, async () => {
      const shell = await $('//*[@data-testid="app-shell"]');
      await shell.waitForExist({ timeout: 10000 });
      await expect(shell).toBeDisplayed();
    });
  } else {
    // Cases A, E, F, G, H, I → chooser fallback
    it(`case ${testCase} shows the directory chooser`, async () => {
      // The before hook already navigated + booted React.  ProjectLoader
      // should call tryAutoLoad() which invokes open_project(…) → error →
      // setLoading(false) → button appears.  Give it up to 20s to handle
      // the async IPC round-trip and re-render.
      const button = await $('//*[@data-testid="choose-directory-button"]');
      await button.waitForExist({ timeout: 20000 });
      await expect(button).toBeDisplayed();
    });
  }
});
