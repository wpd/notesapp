// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Parametric E2E spec for restart-with-deleted-note relay.
 *
 * Phase 1 (setup):    app starts normally, tiles are bound to existing notes.
 * Phase 2 (missing):  alpha.md was deleted between launches → tile is Missing.
 * Phase 3 (restored): alpha.md was restored → tile is normal editor again.
 */

const phase = process.env.NOTESAPP_TEST_PHASE ?? "?";

describe(`Restart with deleted note — phase ${phase}`, () => {
  if (phase === "setup") {
    it("the app loads with tiles bound to notes", async () => {
      const shell = await $('//*[@data-testid="app-shell"]');
      await shell.waitForExist({ timeout: 10000 });
      await expect(shell).toBeDisplayed();

      // initDefaultLayout() runs in a useEffect after AppShell mounts.
      // Poll until at least one tile is bound to alpha.md.
      await browser.waitUntil(
        () =>
          browser.execute(() => {
            const fn = (
              window as Window & {
                __notesapp_layout__?: () => {
                  tiles: Record<string, { filePath: string | null }>;
                };
              }
            ).__notesapp_layout__;
            if (!fn) return false;
            const tiles = fn().tiles;
            return Object.values(tiles).some((t) =>
              t.filePath?.endsWith("alpha.md"),
            );
          }),
        { timeout: 5000, interval: 200, timeoutMsg: "No tile bound to alpha.md after 5s" },
      );
    });
  } else if (phase === "missing") {
    it("the tile bound to deleted alpha.md reopens in Missing mode", async () => {
      const shell = await $('//*[@data-testid="app-shell"]');
      await shell.waitForExist({ timeout: 10000 });

      // loadLayout() runs in a useEffect; file-existence checks are async.
      // Poll until a tile in Missing mode with missingPath alpha.md appears.
      await browser.waitUntil(
        () =>
          browser.execute(() => {
            const fn = (
              window as Window & {
                __notesapp_layout__?: () => {
                  tiles: Record<string, { mode: string; missingPath?: string }>;
                };
              }
            ).__notesapp_layout__;
            if (!fn) return false;
            const tiles = fn().tiles;
            return Object.values(tiles).some(
              (t) =>
                t.mode === "missing" &&
                (t.missingPath?.endsWith("alpha.md") ?? false),
            );
          }),
        { timeout: 5000, interval: 200, timeoutMsg: "No Missing tile for alpha.md after 5s" },
      );
    });
  } else if (phase === "restored") {
    it("the tile bound to restored alpha.md reopens normally", async () => {
      const shell = await $('//*[@data-testid="app-shell"]');
      await shell.waitForExist({ timeout: 10000 });

      // Wait for the layout to settle (loadLayout + file-existence checks).
      // Then verify: no Missing tile for alpha.md AND at least one editor tile.
      await browser.waitUntil(
        () =>
          browser.execute(() => {
            const fn = (
              window as Window & {
                __notesapp_layout__?: () => {
                  tiles: Record<
                    string,
                    { mode: string; filePath: string | null; missingPath?: string }
                  >;
                };
              }
            ).__notesapp_layout__;
            if (!fn) return false;
            const tiles = fn().tiles;
            const vals = Object.values(tiles);
            if (vals.length === 0) return false; // layout not yet initialized
            const hasMissingAlpha = vals.some(
              (t) =>
                t.mode === "missing" &&
                (t.missingPath?.endsWith("alpha.md") ?? false),
            );
            const hasAlphaEditor = vals.some(
              (t) =>
                t.mode === "editor" &&
                (t.filePath?.endsWith("alpha.md") ?? false),
            );
            return !hasMissingAlpha && hasAlphaEditor;
          }),
        { timeout: 5000, interval: 200, timeoutMsg: "Restored alpha.md not in editor mode after 5s" },
      );
    });
  }
});
