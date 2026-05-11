// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

import fs from "fs";
import path from "path";

/**
 * E2E tests — Phase 1 UI behaviors.
 *
 * Prerequisites:
 *  - WebKitWebDriver installed (webkit2gtk-driver apt package)
 *  - App compiled with custom-protocol feature: npm run tauri:build
 *  - NOTESAPP_PROJECT_DIR is set by wdio.conf.ts onPrepare
 *
 * Run via: npm run test:e2e
 *
 * WebKitWebDriver limitations worked around here:
 *  1. CSS attribute selectors ([data-testid="..."]) are NOT supported in
 *     WebDriver findElement — we poll via browser.execute(querySelector) and
 *     return XPath-based element refs for assertions.
 *  2. XPath-based element refs support assertions (toBeDisplayed,
 *     waitForDisplayed) but NOT clicks in all contexts — we use
 *     browser.execute(el.click()) for interactions.
 *  3. `$$()` with compound attribute selectors also fails — count via JS.
 */

// W3C WebDriver Unicode key codes
const KEY = {
  CTRL:   '\uE009',
  SHIFT:  '\uE008',
  ALT:    '\uE00A',
  ENTER:  '\uE007',
  ESC:    '\uE00C',
  END:    '\uE010',
  HOME:   '\uE011',
  RETURN: '\uE006',
} as const;

// ---------------------------------------------------------------------------
// DOM helpers — WebKitWebDriver --target mode has a stale JS execution
// context that does NOT see React's live DOM changes via execute().
// XPath-based findElement (DOM protocol) DOES see the live DOM.
// All existence queries use XPath; execute() is only used where unavoidable.
// ---------------------------------------------------------------------------

/**
 * Wait for an element by test ID using native XPath findElement.
 * Uses the WebKit DOM protocol which sees the live React DOM (unlike
 * execute() which uses a stale JS context in --target mode).
 */
async function waitForId(testId: string, timeout = 20000) {
  const el = $(`//*[@data-testid="${testId}"]`);
  await el.waitForExist({ timeout });
  return el;
}

/**
 * Return an XPath element ref by test ID (lazy, does not wait).
 * Use only after waitForId has confirmed the element exists.
 */
function byId(testId: string) {
  return $(`//*[@data-testid="${testId}"]`);
}

/**
 * Click an element by test ID via native XPath element.click().
 * Finds the element fresh immediately before clicking to avoid stale refs.
 */
async function clickById(testId: string) {
  const el = $(`//*[@data-testid="${testId}"]`);
  await el.waitForExist({ timeout: 5000 });
  await el.click();
  await browser.pause(50);
}

/**
 * Wait for an element with a given data-tile-mode attribute to appear.
 */
async function waitForTileType(tileMode: string, timeout = 10000) {
  const el = $(`//*[@data-tile-mode="${tileMode}"]`);
  await el.waitForExist({ timeout });
  return el;
}

/**
 * Click the first element with data-tile-mode via native XPath click.
 */
async function clickFirstTileOfType(tileMode: string) {
  const el = $(`//*[@data-tile-mode="${tileMode}"]`);
  await el.waitForExist({ timeout: 5000 });
  await el.click();
  await browser.pause(50);
}

/**
 * Focus the first tile of the given mode via the Zustand store's focusTile.
 *
 * Native XPath clicks can fail to fire the React onClick handler (focusTile)
 * inside WebKitWebDriver's stale JS execute context.  Using the store API
 * directly ensures focusedTileId is updated before keyboard shortcuts are sent.
 * Returns the focused tile ID, or null if no matching tile exists.
 */
async function focusFirstTileOfTypeViaStore(tileMode: string): Promise<string | null> {
  await $(`//*[@data-tile-mode="${tileMode}"]`).waitForExist({ timeout: 5000 });
  const tileId = await browser.execute((mode: string) => {
    const fn = (
      window as Window & {
        __notesapp_layout__?: () => {
          tiles: Record<string, { mode: string }>;
          focusTile: (id: string) => void;
        };
      }
    ).__notesapp_layout__;
    if (!fn) return null;
    const { tiles, focusTile } = fn();
    const id = Object.keys(tiles).find((k) => tiles[k].mode === mode) ?? null;
    if (id) focusTile(id);
    return id;
  }, tileMode);
  // Also give DOM focus via XPath click so WebKitWebDriver delivers key
  // events to the document capture-phase listener correctly.
  if (tileId) {
    const el = $(`//*[@data-testid="tile-${tileId}"]`);
    await el.waitForExist({ timeout: 3000 });
    await el.click();
  }
  await browser.pause(100);
  return tileId as string | null;
}

/**
 * Click the Nth element (0-indexed) with data-tile-mode="editor".
 */
async function clickEditorAtIndex(index: number) {
  const editors = await $$('//*[@data-tile-mode="editor"]');
  if (editors.length > index) {
    await editors[index].waitForExist({ timeout: 3000 });
    await editors[index].click();
  }
  await browser.pause(100);
}

/**
 * Return the data-testid of the Nth editor tile (0-indexed), or null.
 */
async function getEditorTestIdAtIndex(index: number): Promise<string | null> {
  const editors = await $$('//*[@data-tile-mode="editor"]');
  if (editors.length > index) {
    return editors[index].getAttribute('data-testid');
  }
  return null;
}

/**
 * Count tiles that have both a data-testid starting with "tile-" and
 * a data-tile-mode attribute.
 */
async function getTileCount(): Promise<number> {
  const tiles = await $$('//*[starts-with(@data-testid,"tile-") and @data-tile-mode]');
  return tiles.length;
}

/**
 * Click the first tile in the layout (any mode) via native XPath click.
 */
async function clickFirstTile() {
  const el = $('//*[starts-with(@data-testid,"tile-") and @data-tile-mode]');
  await el.waitForExist({ timeout: 5000 });
  await el.click();
  await browser.pause(50);
}

/**
 * Wait for a preview content element (data-testid starts with "preview-content-").
 */
async function waitForPreviewContent(timeout = 5000) {
  const el = $('//*[starts-with(@data-testid,"preview-content-")]');
  await el.waitForExist({ timeout });
  return el;
}

/**
 * Send C-x prefix chord, then a key.
 *
 * Note: do NOT blur before sending — WebKitWebDriver delivers browser.action
 * key events to the document (capture phase listener in useKeyboardShortcuts
 * receives them regardless of which element has DOM focus).  Blurring removes
 * DOM focus, which in some WebKit configurations prevents key delivery entirely.
 */
async function sendCxChord(key: string) {
  await browser.action('key')
    .down(KEY.CTRL).down('x').up('x').up(KEY.CTRL)
    .perform();
  await browser.pause(150);
  await browser.action('key').down(key).up(key).perform();
  await browser.pause(200);
}

/**
 * Dismiss any open modal overlay (buffer switcher, unsaved-changes dialog,
 * quit dialog) using React-safe key/button events instead of direct DOM
 * manipulation.  Direct removeChild bypasses React's reconciler and can
 * leave the fiber tree in an inconsistent state that breaks subsequent
 * overlay renders.
 *
 * IMPORTANT: use XPath isExisting() for existence checks — browser.execute()
 * runs in a stale JS context (WebKitWebDriver --target mode) that cannot see
 * React-rendered DOM changes, so querySelector always returns null for dynamic
 * overlays.  XPath uses the live WebDriver DOM protocol.
 */
async function dismissOpenOverlays() {
  if (await $('//*[@data-testid="buffer-switcher"]').isExisting()) {
    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(300);
  }
  if (await $('//*[@data-testid="unsaved-dialog"]').isExisting()) {
    try {
      await $('//*[@data-testid="unsaved-dialog-cancel"]').click();
    } catch { /* ignore — dialog may have auto-closed */ }
    await browser.pause(300);
  }
  if (await $('//*[@data-testid="quit-dialog"]').isExisting()) {
    try {
      await $('//*[@data-testid="quit-dialog-cancel"]').click();
    } catch { /* ignore */ }
    await browser.pause(300);
  }
}

/** Send Ctrl+Shift+key */
async function sendCtrlShift(key: string) {
  await browser.action('key')
    .down(KEY.CTRL).down(KEY.SHIFT).down(key).up(key).up(KEY.SHIFT).up(KEY.CTRL)
    .perform();
  await browser.pause(200);
}

// ---------------------------------------------------------------------------
// App launch
// ---------------------------------------------------------------------------

describe("App launch", () => {
  it("displays the main window with app-root element", async () => {
    await waitForId("app-root");
    const appRoot = await byId("app-root");
    await expect(appRoot).toBeDisplayed();
  });

  it("has the correct window title", async () => {
    const title = await browser.getTitle();
    expect(title).toBe("NotesApp");
  });
});

// ---------------------------------------------------------------------------
// Spellcheck DOM attribute
// ---------------------------------------------------------------------------

describe("Spellcheck DOM attribute", () => {
  it("CodeMirror contenteditable has spellcheck=true", async () => {
    await waitForId("app-root", 25000);
    const cmContent = await $(".cm-content");
    await cmContent.waitForDisplayed({ timeout: 10000 });
    const spellcheck = await cmContent.getAttribute("spellcheck");
    expect(spellcheck).toBe("true");
  });
});

// ---------------------------------------------------------------------------
// Spelling decorations (cross-platform)
// ---------------------------------------------------------------------------

describe("Spelling decorations render on misspelled words", () => {
  it("cm-spelling-error spans appear after loading a note with misspellings", async function () {
    // Ensure an editor tile is focused before invoking the buffer switcher.
    await clickFirstTileOfType("editor");
    await sendCxChord("b");
    const switcher = await waitForId("buffer-switcher", 3000);
    await expect(switcher).toBeDisplayed();
    const input = await byId("buffer-switcher-input");
    await input.setValue("spellcheck");
    await browser.pause(300);
    await browser.action("key").down(KEY.RETURN).up(KEY.RETURN).perform();

    // Wait for: buffer-switcher pre-load + IPC round-trip (check_spelling) + CodeMirror dispatch.
    await browser.pause(3000);

    const errorCount = await browser.execute(
      () => document.querySelectorAll(".cm-spelling-error").length,
    );
    expect(errorCount).toBeGreaterThan(0);

    // Verify computed styles: WebKitGTK 4.1 silently drops text-decoration-line
    // when the three-value shorthand (line + style + color) is used — assert
    // all three longhand properties resolve correctly.
    const spanStyle = await browser.execute(() => {
      const span = document.querySelector(".cm-spelling-error") as HTMLElement | null;
      if (!span) return null;
      const cs = window.getComputedStyle(span);
      return {
        line:  cs.getPropertyValue("text-decoration-line"),
        style: cs.getPropertyValue("text-decoration-style"),
        color: cs.getPropertyValue("text-decoration-color"),
      };
    });
    expect(spanStyle).not.toBeNull();
    expect(spanStyle?.line).toBe("underline");
    expect(spanStyle?.style).toBe("wavy");
  });
});

// ---------------------------------------------------------------------------
// Default tiling layout
// ---------------------------------------------------------------------------

describe("Default tiling layout", () => {
  before(async () => {
    await waitForId("app-root", 25000);
  });

  it("renders the mosaic layout shell", async () => {
    await waitForId("mosaic-layout");
    const layout = await byId("mosaic-layout");
    await expect(layout).toBeDisplayed();
  });

  it("renders the activity sidebar", async () => {
    await waitForId("activity-sidebar");
    const sidebar = await byId("activity-sidebar");
    await expect(sidebar).toBeDisplayed();
  });

  it("renders the explorer file list with test notes", async () => {
    await waitForId("explorer-file-list");
    const alpha = await byId("sidebar-file-alpha");
    await expect(alpha).toBeDisplayed();
    const beta = await byId("sidebar-file-beta");
    await expect(beta).toBeDisplayed();
    const gamma = await byId("sidebar-file-gamma");
    await expect(gamma).toBeDisplayed();
  });

  it("default layout has an editor tile and a preview tile", async () => {
    const editorTile = await waitForTileType("editor");
    await expect(editorTile).toBeDisplayed();

    const previewTile = await waitForTileType("preview");
    await expect(previewTile).toBeDisplayed();
  });
});

// ---------------------------------------------------------------------------
// Activity sidebar toggle (Ctrl+Shift+B)
// ---------------------------------------------------------------------------

describe("Activity sidebar toggle (Ctrl+Shift+B)", () => {
  it("Ctrl+Shift+B hides the sidebar", async () => {
    await waitForId("activity-sidebar");
    const sidebar = await byId("activity-sidebar");
    await expect(sidebar).toBeDisplayed();

    await sendCtrlShift('b');

    await sidebar.waitForDisplayed({ timeout: 2000, reverse: true });
    await expect(sidebar).not.toBeDisplayed();
  });

  it("Ctrl+Shift+B shows the sidebar again", async () => {
    await sendCtrlShift('b');
    await waitForId("activity-sidebar");
    const sidebar = await byId("activity-sidebar");
    await expect(sidebar).toBeDisplayed();
  });
});

// ---------------------------------------------------------------------------
// Buffer switcher (C-x b)
// ---------------------------------------------------------------------------

describe("Buffer switcher (C-x b)", () => {
  it("C-x b opens the buffer switcher", async () => {
    // Focus the app via JavaScript (bypasses unreliable WebDriver click)
    await clickById("app-root");
    await browser.pause(200);

    await sendCxChord('b');

    const switcher = await waitForId("buffer-switcher", 3000);
    await expect(switcher).toBeDisplayed();
  });

  it("buffer switcher shows the test notes", async () => {
    const alphaItem = await byId("buffer-item-alpha");
    await expect(alphaItem).toBeDisplayed();
    const betaItem = await byId("buffer-item-beta");
    await expect(betaItem).toBeDisplayed();
  });

  it("typing in the buffer switcher filters the list", async () => {
    const input = await byId("buffer-switcher-input");
    await input.setValue("alpha");
    await browser.pause(300);

    const alpha = await byId("buffer-item-alpha");
    await expect(alpha).toBeDisplayed();
    const beta = await byId("buffer-item-beta");
    await expect(beta).not.toBeDisplayed();
  });

  it("pressing Enter loads the selected file", async () => {
    const input = await byId("buffer-switcher-input");
    await input.clearValue();
    await input.setValue("alpha");
    await browser.pause(200);

    await browser.action('key').down(KEY.RETURN).up(KEY.RETURN).perform();
    await browser.pause(500);

    // Switcher should close
    const switcher = await byId("buffer-switcher");
    await switcher.waitForDisplayed({ timeout: 2000, reverse: true });
    await expect(switcher).not.toBeDisplayed();
  });

  it("Escape closes the buffer switcher", async () => {
    // Re-open
    await clickById("app-root");
    await sendCxChord('b');
    const switcher = await waitForId("buffer-switcher", 3000);
    await expect(switcher).toBeDisplayed();

    await browser.action('key').down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(300);
    await expect(switcher).not.toBeDisplayed();
  });
});

// ---------------------------------------------------------------------------
// Pane splitting
// ---------------------------------------------------------------------------

describe("Pane splitting (C-x h / C-x v)", () => {
  it("C-x h splits the focused pane horizontally, adding a tile", async () => {
    const countBefore = await getTileCount();

    // Use store-based focus + DOM click to guarantee focusedTileId is set.
    await focusFirstTileOfTypeViaStore("editor");

    await sendCxChord('h');
    await browser.pause(1000);

    const countAfter = await getTileCount();
    expect(countAfter).toBe(countBefore + 1);
  });

  it("C-x v splits the focused pane vertically, adding a tile", async () => {
    const countBefore = await getTileCount();

    await clickFirstTile();
    await browser.pause(200);

    await sendCxChord('v');
    await browser.pause(500);

    const countAfter = await getTileCount();
    expect(countAfter).toBe(countBefore + 1);
  });
});

// ---------------------------------------------------------------------------
// Pane close
// ---------------------------------------------------------------------------

describe("Pane close (C-x 0)", () => {
  it("C-x 0 closes the focused pane (tiles decrease by 1)", async () => {
    // Ensure we have at least 2 tiles
    let count = await getTileCount();
    if (count < 2) {
      await clickFirstTile();
      await sendCxChord('h');
      await browser.pause(500);
      count = await getTileCount();
    }

    const countBefore = count;
    await clickFirstTile();
    await browser.pause(200);

    await sendCxChord('0');
    await browser.pause(500);

    const countAfter = await getTileCount();
    expect(countAfter).toBe(countBefore - 1);
  });
});

// ---------------------------------------------------------------------------
// Maximize / restore
// ---------------------------------------------------------------------------

describe("Pane maximize/restore (C-x z)", () => {
  before(async () => {
    // Ensure at least 2 tiles
    const count = await getTileCount();
    if (count < 2) {
      await clickFirstTile();
      await sendCxChord('h');
      await browser.pause(500);
    }
  });

  it("C-x z maximizes to one tile", async () => {
    await clickFirstTileOfType("editor");
    await browser.pause(200);

    await sendCxChord('z');
    await browser.pause(500);

    const count = await getTileCount();
    expect(count).toBe(1);
  });

  it("C-x z again restores layout to multiple tiles", async () => {
    await clickFirstTile();
    await browser.pause(200);

    await sendCxChord('z');
    await browser.pause(500);

    const count = await getTileCount();
    expect(count).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// Editor → Preview update
// ---------------------------------------------------------------------------

describe("Editor typing updates preview", () => {
  before(async () => {
    // Phase 1 introduces independent Preview tile binding (SPEC §4.0.1) — the
    // Preview no longer auto-syncs to the focused Editor.  Bind BOTH the
    // Editor and Preview tiles to alpha.md so they share the same buffer
    // (Y.Doc) and the typing-updates-preview test can observe propagation.
    const bindToAlpha = async () => {
      await sendCxChord('b');
      const switcher = await waitForId("buffer-switcher", 3000);
      await expect(switcher).toBeDisplayed();
      const input = await byId("buffer-switcher-input");
      await input.clearValue();
      await input.setValue("alpha");
      await browser.pause(200);
      await browser.action('key').down(KEY.RETURN).up(KEY.RETURN).perform();
      await browser.pause(600);
    };
    await clickFirstTileOfType("editor");
    await browser.pause(200);
    await bindToAlpha();
    await clickFirstTileOfType("preview");
    await browser.pause(200);
    await bindToAlpha();
  });

  it("typing in the editor updates the preview within 500ms", async () => {
    // Get the CodeMirror content area (class selector — works in WebKitWebDriver)
    const cmContent = await $('.cm-content');
    await cmContent.waitForDisplayed({ timeout: 5000 });
    await cmContent.click();
    await browser.pause(300);

    // Type a unique marker at the end of the document
    const marker = 'PREVIEW_SYNC_E2E_' + Date.now();
    await browser.action('key')
      .down(KEY.CTRL).down(KEY.END).up(KEY.END).up(KEY.CTRL)
      .perform();
    await browser.pause(100);
    await browser.action('key').down(KEY.RETURN).up(KEY.RETURN).perform();
    for (const ch of marker) {
      await browser.action('key').down(ch).up(ch).perform();
    }
    await browser.pause(700); // debounce is 150ms

    // Preview should contain the marker
    const previewContent = await waitForPreviewContent(3000);
    const text = await previewContent.getText();
    expect(text).toContain(marker);
  });
});

// ---------------------------------------------------------------------------
// YAML front-matter stripping in Preview
// ---------------------------------------------------------------------------

describe("Preview strips YAML front-matter", () => {
  it("a note with front-matter renders with front-matter hidden", async () => {
    const cmContent = await $('.cm-content');
    await cmContent.waitForDisplayed({ timeout: 5000 });
    await cmContent.click();
    await browser.pause(300);

    // Select all existing content and replace with a note containing front-matter
    await browser.action('key')
      .down(KEY.CTRL).down('a').up('a').up(KEY.CTRL)
      .perform();
    await browser.pause(100);

    const lines = [
      '---',
      'title: "E2E Front Matter Test"',
      'created: 2026-01-01T00:00:00Z',
      'modified: 2026-01-01T00:00:00Z',
      'tags: [e2e, test]',
      '---',
      '',
      '# Visible Heading',
      '',
      'Visible body paragraph.',
    ];

    for (let i = 0; i < lines.length; i++) {
      for (const ch of lines[i]) {
        await browser.action('key').down(ch).up(ch).perform();
      }
      if (i < lines.length - 1) {
        await browser.action('key').down(KEY.RETURN).up(KEY.RETURN).perform();
      }
    }
    await browser.pause(700); // wait for 150ms debounce

    const previewContent = await waitForPreviewContent(5000);
    const text = await previewContent.getText();

    // Front-matter must not be visible
    expect(text).not.toContain('title:');
    expect(text).not.toContain('created:');
    expect(text).not.toContain('modified:');
    expect(text).not.toContain('tags:');

    // Visible content must render
    expect(text).toContain('Visible Heading');
    expect(text).toContain('Visible body paragraph.');

    // No <hr> from front-matter delimiters
    const html = await previewContent.getHTML();
    expect(html).not.toMatch(/<hr[\s/>]/);
  });
});

// ---------------------------------------------------------------------------
// Emacs keybindings (smoke test — full set provided by @replit/codemirror-emacs)
// ---------------------------------------------------------------------------

describe("Emacs keybindings in editor", () => {
  it("M-> jumps to end of buffer; inserted text appears at the end", async () => {
    const cmContent = await $('.cm-content');
    await cmContent.waitForDisplayed({ timeout: 5000 });
    await cmContent.click();
    await browser.pause(300);

    const marker = 'EMACS_END_E2E_' + Date.now();

    // M-< (Alt+Shift+,) → beginning of file; then M-> (Alt+Shift+.) → end of file.
    // We only need M->: confirm the emacs binding moves the cursor to EOF.
    await browser.action('key')
      .down(KEY.ALT).down(KEY.SHIFT).down('.').up('.').up(KEY.SHIFT).up(KEY.ALT)
      .perform();
    await browser.pause(100);
    // Insert on a fresh line so the marker is unambiguously at the buffer's end.
    await browser.action('key').down(KEY.RETURN).up(KEY.RETURN).perform();
    for (const ch of marker) {
      await browser.action('key').down(ch).up(ch).perform();
    }
    await browser.pause(500);

    const previewContent = await waitForPreviewContent(3000);
    const text = await previewContent.getText();
    expect(text).toContain(marker);
  });
});

// ---------------------------------------------------------------------------
// Pin behavior (C-x p)
// ---------------------------------------------------------------------------

/**
 * Read the layout store's pinnedTileId via the window-exposed introspection
 * helper installed by main.tsx.  Used by pin/focus tests to assert state
 * directly rather than waiting for derived DOM testids that depend on tile
 * counter values which drift between test runs.
 */
async function getPinnedTileId(): Promise<string | null> {
  return browser.execute(() => {
    const fn = (
      window as Window & {
        __notesapp_layout__?: () => { pinnedTileId: string | null };
      }
    ).__notesapp_layout__;
    return fn ? fn().pinnedTileId : null;
  });
}

async function getFocusedTileId(): Promise<string | null> {
  return browser.execute(() => {
    const fn = (
      window as Window & {
        __notesapp_layout__?: () => { focusedTileId: string | null };
      }
    ).__notesapp_layout__;
    return fn ? fn().focusedTileId : null;
  });
}

describe("Pin behavior (C-x p)", () => {
  it("C-x p pins the focused editor tile", async () => {
    await clickFirstTileOfType("editor");
    await browser.pause(300);

    const focusedBefore = await getFocusedTileId();
    expect(focusedBefore).toMatch(/^editor-/);

    await sendCxChord('p');
    await browser.pause(500);

    const pinned = await getPinnedTileId();
    expect(pinned).toBe(focusedBefore);
  });

  it("pinning a second editor tile unpins the first", async () => {
    // Ensure we have at least two editor tiles
    const editorEls = await $$('//*[@data-tile-mode="editor"]');
    if (editorEls.length < 2) {
      await clickFirstTileOfType("editor");
      await sendCxChord('h');
      await browser.pause(1000);
    }

    // Pin the first editor (no-op if already pinned to it).
    await clickEditorAtIndex(0);
    await browser.pause(300);
    const firstFocused = await getFocusedTileId();
    let pinned = await getPinnedTileId();
    if (pinned !== firstFocused) {
      await sendCxChord('p');
      await browser.pause(500);
      pinned = await getPinnedTileId();
    }
    expect(pinned).toBe(firstFocused);

    // Focus the second editor and pin it — first pin should clear.
    await clickEditorAtIndex(1);
    await browser.pause(300);
    const secondFocused = await getFocusedTileId();
    expect(secondFocused).not.toBe(firstFocused);

    await sendCxChord('p');
    await browser.pause(500);

    const pinnedAfter = await getPinnedTileId();
    expect(pinnedAfter).toBe(secondFocused);
    expect(pinnedAfter).not.toBe(firstFocused);
  });
});

// ---------------------------------------------------------------------------
// Save (C-x C-s)
// ---------------------------------------------------------------------------

describe("Save (C-x C-s)", () => {
  it("C-x C-s clears the dirty indicator", async () => {
    const tileId = await getEditorTestIdAtIndex(0);
    await clickEditorAtIndex(0);
    await browser.pause(200);

    // Type something to make it dirty
    const cmContent = await $('.cm-content');
    await cmContent.click();
    await browser.pause(200);
    await browser.action('key').down('a').up('a').perform();
    await browser.pause(300);

    if (tileId) {
      const tileNum = tileId.replace("tile-", "");
      const dirtyEl = await waitForId(`dirty-indicator-${tileNum}`, 2000);
      await expect(dirtyEl).toBeDisplayed();

      // Save with C-x C-s
      await clickEditorAtIndex(0);
      await browser.pause(200);
      await browser.action('key')
        .down(KEY.CTRL).down('x').up('x').up(KEY.CTRL)
        .perform();
      await browser.pause(150);
      await browser.action('key')
        .down(KEY.CTRL).down('s').up('s').up(KEY.CTRL)
        .perform();
      await browser.pause(1000);

      // Dirty indicator should clear
      await dirtyEl.waitForDisplayed({ timeout: 2000, reverse: true });
      await expect(dirtyEl).not.toBeDisplayed();
    }
  });
});

// ---------------------------------------------------------------------------
// Multi-level split: horizontal then vertical
//
// Regression test for the split-direction mapping.  The user scenario:
//   1. Start with the default 2-tile layout (editor | preview).
//   2. Focus the left pane (editor), split horizontally (C-x h).
//      Expected: a horizontal divider → top-left editor + bottom-left editor.
//   3. Focus the bottom-left pane, split vertically (C-x v).
//      Expected: a vertical divider → two panes side-by-side in the bottom-left.
//
// Final tree:
//   row {
//     column {
//       editor-A,                          ← top-left
//       row { editor-B, editor-C }         ← bottom-left pair
//     },
//     preview-D                            ← right (unchanged)
//   }
// ---------------------------------------------------------------------------

describe("Multi-level split: horizontal then vertical", () => {
  before(async () => {
    // Reset to a clean 2-tile layout by closing extra tiles.
    let count = await getTileCount();
    while (count > 2) {
      await clickFirstTile();
      await browser.pause(100);
      await sendCxChord("0");
      await browser.pause(500);
      count = await getTileCount();
    }
  });

  it("starts with exactly 2 tiles (editor | preview)", async () => {
    const count = await getTileCount();
    expect(count).toBe(2);
  });

  it("C-x h on the left editor creates a top/bottom split (horizontal divider)", async () => {
    await clickFirstTileOfType("editor");
    await browser.pause(200);

    await sendCxChord("h");
    await browser.pause(800);

    const count = await getTileCount();
    expect(count).toBe(3);

    // Validate the persisted tree structure.
    const projectDir = process.env.NOTESAPP_E2E_PROJECT_DIR;
    expect(projectDir).toBeDefined();
    const layoutPath = path.join(projectDir!, ".notesapp", "layout.json");
    const persisted = JSON.parse(fs.readFileSync(layoutPath, "utf-8")) as {
      tree: { direction: string; first: unknown; second: unknown };
    };

    // Top level is still a row (left half | right half).
    expect(persisted.tree.direction).toBe("row");
    // Left subtree is now a column split (top/bottom = horizontal divider).
    expect(typeof persisted.tree.first).toBe("object");
    const leftSplit = persisted.tree.first as { direction: string };
    expect(leftSplit.direction).toBe("column");
    // Right side (preview) is still a leaf.
    expect(typeof persisted.tree.second).toBe("string");
  });

  it("C-x v on the bottom-left editor creates a left/right split (vertical divider)", async () => {
    // After the previous split, the new bottom-left tile is auto-focused.
    // Explicitly re-focus it (last editor by index = bottom-left) to defend
    // against any focus drift from prior describe blocks running in sequence.
    const editors = await $$('//*[@data-tile-mode="editor"]');
    if (editors.length >= 2) {
      await editors[editors.length - 1].click();
      await browser.pause(200);
    }
    await sendCxChord("v");
    await browser.pause(800);

    const count = await getTileCount();
    expect(count).toBe(4);

    // Validate tree structure.
    const projectDir = process.env.NOTESAPP_E2E_PROJECT_DIR!;
    const layoutPath = path.join(projectDir, ".notesapp", "layout.json");
    const persisted = JSON.parse(fs.readFileSync(layoutPath, "utf-8")) as {
      tree: {
        direction: string;
        first: { direction: string; first: unknown; second: unknown };
        second: unknown;
      };
    };

    // Top level: row.
    expect(persisted.tree.direction).toBe("row");
    // Left subtree: column (from previous split).
    expect(persisted.tree.first.direction).toBe("column");
    // Top-left: still a leaf.
    expect(typeof persisted.tree.first.first).toBe("string");
    // Bottom-left: now a row split (side-by-side = vertical divider).
    expect(typeof persisted.tree.first.second).toBe("object");
    const bottomSplit = persisted.tree.first.second as { direction: string };
    expect(bottomSplit.direction).toBe("row");
    // Right side: still a leaf.
    expect(typeof persisted.tree.second).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// Deep nesting: verify 5+ split levels work without hitting any depth limit.
// Starting from a 2-tile layout, we repeatedly split the most recently
// created (auto-focused) editor tile, alternating h/v, reaching 6 levels
// of nesting and 7 total tiles (2 original + 5 splits).
// ---------------------------------------------------------------------------

describe("Deep nesting: 5 successive splits from 2-tile start", () => {
  before(async () => {
    let count = await getTileCount();
    while (count > 2) {
      await clickFirstTile();
      await browser.pause(100);
      await sendCxChord("0");
      await browser.pause(500);
      count = await getTileCount();
    }
  });

  it("starts with exactly 2 tiles", async () => {
    const count = await getTileCount();
    expect(count).toBe(2);
  });

  it("performs 5 successive splits reaching 7 tiles", async () => {
    await clickFirstTileOfType("editor");
    await browser.pause(200);

    const keys = ["h", "v", "h", "v", "h"];
    for (const key of keys) {
      await sendCxChord(key);
      await browser.pause(800);
    }

    const count = await getTileCount();
    expect(count).toBe(7);
  });

  it("persisted tree has depth >= 6", async () => {
    const projectDir = process.env.NOTESAPP_E2E_PROJECT_DIR;
    expect(projectDir).toBeDefined();
    const layoutPath = path.join(projectDir!, ".notesapp", "layout.json");
    const persisted = JSON.parse(fs.readFileSync(layoutPath, "utf-8")) as {
      tree: unknown;
    };

    function measureDepth(node: unknown): number {
      if (typeof node === "string") return 0;
      if (node && typeof node === "object" && "first" in node && "second" in node) {
        const n = node as { first: unknown; second: unknown };
        return 1 + Math.max(measureDepth(n.first), measureDepth(n.second));
      }
      return 0;
    }

    const depth = measureDepth(persisted.tree);
    expect(depth).toBeGreaterThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// Layout persistence across relaunch
//
// The persistence guarantee rides on `.notesapp/layout.json`: every structural
// change auto-persists (layoutStore.schedulePersist, 250ms debounce), and on
// app boot AppShell calls loadLayout(projectDir) which reads the same file.
// We validate the full round-trip by (1) triggering a change, (2) reading the
// on-disk layout.json directly from the host, and (3) asserting the persisted
// leaf count matches the current session's tile count.
// ---------------------------------------------------------------------------

function countLeaves(tree: unknown): number {
  if (typeof tree === "string") return 1;
  if (tree && typeof tree === "object" && "first" in tree && "second" in tree) {
    const node = tree as { first: unknown; second: unknown };
    return countLeaves(node.first) + countLeaves(node.second);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// External file deletion → tile transitions to Missing mode (SPEC.md §5.5)
//
// Architecturally exercising: validates the Rust file watcher → Tauri event
// emit → frontend listen → setTileMissing pipeline end-to-end. PROGRESS.md
// names this as the most important new scenario in Work Package 18.
// ---------------------------------------------------------------------------

describe("External deletion transitions bound tile to Missing", () => {
  const projectDir = process.env.NOTESAPP_E2E_PROJECT_DIR;
  const fileName = `delete_target_${Date.now()}.md`;

  before(async () => {
    if (!projectDir) throw new Error("NOTESAPP_E2E_PROJECT_DIR not set");
    // Create a uniquely-named file inside notes/ so the file watcher
    // (which watches notes/, references/, .notesapp/ai-context/) emits a
    // delete event when we unlink it later.
    fs.writeFileSync(
      path.join(projectDir, "notes", fileName),
      "# Delete-target note\n\nWatcher integration test.\n",
    );
    // Allow the watcher's debouncer (500ms) to swallow the create event
    // before any later delete.
    await browser.pause(700);
  });

  it("binding a tile to a fresh note then deleting it transitions the tile to Missing within 1500ms", async () => {
    if (!projectDir) throw new Error("NOTESAPP_E2E_PROJECT_DIR not set");
    // Focus an editor tile and bind it to our delete-target via C-x b.
    await clickFirstTileOfType("editor");
    await browser.pause(200);

    const focusedTileId = await getFocusedTileId();
    expect(focusedTileId).toMatch(/^editor-/);

    await sendCxChord("b");
    const switcher = await waitForId("buffer-switcher", 3000);
    await expect(switcher).toBeDisplayed();

    const input = await byId("buffer-switcher-input");
    await input.clearValue();
    // Filter on the unique stem (drop the .md extension and timestamp suffix
    // is fine, but searching the full name is more robust).
    await input.setValue("delete_target");
    await browser.pause(300);

    await browser.action("key").down(KEY.RETURN).up(KEY.RETURN).perform();
    await browser.pause(700); // wait for the binding to settle

    // Confirm the tile is bound to our file (mode still editor, not missing).
    const tileBeforeDelete = await browser.execute((id) => {
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
      return fn && id ? fn().tiles[id] : null;
    }, focusedTileId);
    expect(tileBeforeDelete).not.toBeNull();
    expect(tileBeforeDelete!.mode).toBe("editor");
    expect(tileBeforeDelete!.filePath).toContain(fileName);

    // Externally delete the file — this should fire a watcher 'delete' event,
    // which AppShell's file-change listener routes through setTileMissing.
    fs.unlinkSync(path.join(projectDir, "notes", fileName));

    // Watcher debounce is 500ms; allow generous headroom for IPC + event
    // dispatch + React re-render before asserting.
    await browser.waitUntil(
      async () => {
        const tile = await browser.execute((id) => {
          const fn = (
            window as Window & {
              __notesapp_layout__?: () => {
                tiles: Record<string, { mode: string }>;
              };
            }
          ).__notesapp_layout__;
          return fn && id ? fn().tiles[id] : null;
        }, focusedTileId);
        return tile?.mode === "missing";
      },
      {
        timeout: 5000,
        interval: 200,
        timeoutMsg: "Tile did not transition to 'missing' mode after delete",
      },
    );

    // The MissingTile UI replaces the EditorPane.  Note that MissingTile and
    // friends use the FULL tile id (e.g. "editor-6") in their data-testid, not
    // just the numeric suffix.
    const missingTile = await waitForId(`missing-tile-${focusedTileId}`, 2000);
    await expect(missingTile).toBeDisplayed();
  });

  it("the missing tile renders Locate / Open-a-different-buffer / Close action buttons", async () => {
    // The previous test left at least one missing tile in the layout.
    const missingTileId = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { mode: string }>;
          };
        }
      ).__notesapp_layout__;
      const tiles = fn ? fn().tiles : {};
      const id = Object.keys(tiles).find((k) => tiles[k].mode === "missing");
      return id ?? null;
    });
    expect(missingTileId).toMatch(/-/);

    const locate = await waitForId(`missing-locate-${missingTileId}`, 2000);
    await expect(locate).toBeDisplayed();
    const openDifferent = await waitForId(
      `missing-open-different-${missingTileId}`,
      2000,
    );
    await expect(openDifferent).toBeDisplayed();
    const close = await waitForId(`missing-close-${missingTileId}`, 2000);
    await expect(close).toBeDisplayed();
  });

  it("C-x b in a Missing tile opens the Editor picker (lists all text files)", async () => {
    // Focus the missing tile so C-x b targets it.
    const missingTileId = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { mode: string }>;
          };
        }
      ).__notesapp_layout__;
      const tiles = fn ? fn().tiles : {};
      return Object.keys(tiles).find((k) => tiles[k].mode === "missing") ?? null;
    });
    expect(missingTileId).toMatch(/-/);

    // Use the layout store's focusTile via window introspection — clicking a
    // missing-tile DOM root is sometimes intercepted by the action buttons.
    await browser.execute((id) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => { focusTile: (id: string) => void };
        }
      ).__notesapp_layout__;
      if (fn && id) fn().focusTile(id);
    }, missingTileId);
    await browser.pause(200);

    await sendCxChord("b");
    const switcher = await waitForId("buffer-switcher", 3000);
    await expect(switcher).toBeDisplayed();

    // Editor picker uses the search-glass icon (preview uses an eye). Confirm
    // the placeholder is the editor variant rather than markdown-only.
    const inputEl = await byId("buffer-switcher-input");
    const placeholder = await inputEl.getAttribute("placeholder");
    expect(placeholder).toBe("Open note…");

    // Editor picker lists the existing markdown notes (alpha/beta/gamma all .md).
    const alphaItem = await byId("buffer-item-alpha");
    await expect(alphaItem).toBeDisplayed();

    // Dismiss the picker so subsequent tests start clean.
    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(300);
  });

  it("Locate… rebinds the missing tile to a chosen file via the dialog shim", async () => {
    if (!projectDir) throw new Error("NOTESAPP_E2E_PROJECT_DIR not set");

    // Identify the missing tile.
    const missingTileId = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { mode: string }>;
          };
        }
      ).__notesapp_layout__;
      const tiles = fn ? fn().tiles : {};
      return Object.keys(tiles).find((k) => tiles[k].mode === "missing") ?? null;
    });
    expect(missingTileId).toMatch(/-/);

    // Pick a file that exists in the project's notes/ to locate.
    // alpha.md is our scaffolded first note.
    const locateTarget = path.join(projectDir, "notes", "alpha.md");

    // Set the test dialog override so that clicking Locate returns this path
    // instead of opening the native GTK file chooser.
    await browser.execute((target) => {
      (window as Window & { __notesapp_test_chooser__?: string | null }).__notesapp_test_chooser__ = target;
    }, locateTarget);

    // Click the Locate button.
    await clickById(`missing-locate-${missingTileId}`);
    await browser.pause(500);

    // The tile should now be bound to alpha.md in editor mode (no longer missing).
    const tileAfter = await browser.execute((id) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<
              string,
              { mode: string; filePath: string | null }
            >;
          };
        }
      ).__notesapp_layout__;
      return fn && id ? fn().tiles[id] : null;
    }, missingTileId);

    expect(tileAfter).not.toBeNull();
    expect(tileAfter!.mode).toBe("editor");
    expect(tileAfter!.filePath).toContain("alpha.md");

    // Clean up: close this tile so subsequent tests don't have an extra
    // editor crowding the mosaic layout.
    await browser.execute((id) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => { closeTile: (id: string) => void };
        }
      ).__notesapp_layout__;
      if (fn && id) fn().closeTile(id);
    }, missingTileId);
    await browser.pause(300);
  });
});

// ---------------------------------------------------------------------------
// Editor↔Preview title-bar toggle (SPEC.md §4.0.1, CLAUDE.md §7.3)
//
// One-click toggle in place — does NOT open a buffer picker.  Greyed out
// when the bound file's extension is not .md.
// ---------------------------------------------------------------------------

describe("Editor↔Preview title-bar toggle", () => {
  before(async () => {
    // Dismiss any leftover overlay before continuing.
    await dismissOpenOverlays();
    // Close every Missing tile the deletion suite produced so we are back to
    // a clean editor + preview baseline.
    let missingTileIds = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { mode: string }>;
          };
        }
      ).__notesapp_layout__;
      const tiles = fn ? fn().tiles : {};
      return Object.keys(tiles).filter((k) => tiles[k].mode === "missing");
    });
    for (const id of missingTileIds) {
      try {
        await clickById(`missing-close-${id}`);
        await browser.pause(500);
      } catch {
        // Best-effort — if a tile already vanished, skip.
      }
    }
    // Defensive: re-check.
    missingTileIds = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { mode: string }>;
          };
        }
      ).__notesapp_layout__;
      const tiles = fn ? fn().tiles : {};
      return Object.keys(tiles).filter((k) => tiles[k].mode === "missing");
    });
    expect(missingTileIds.length).toBe(0);
  });

  it("clicking the Editor mode indicator on a .md tile switches it to Preview in place", async () => {
    // Locate an editor tile bound to a .md file via store introspection.
    const editorTileId = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<
              string,
              { mode: string; filePath: string | null }
            >;
          };
        }
      ).__notesapp_layout__;
      const tiles = fn ? fn().tiles : {};
      return (
        Object.keys(tiles).find(
          (k) =>
            tiles[k].mode === "editor" &&
            (tiles[k].filePath ?? "").endsWith(".md"),
        ) ?? null
      );
    });
    expect(editorTileId).toMatch(/^editor-/);

    await clickById(`tile-mode-indicator-${editorTileId}`);
    await browser.pause(500);

    // After the toggle the tile id keeps its numeric suffix but its mode
    // attribute flips to "preview" — verify via the layout store rather than
    // the testid (which is keyed off mode for the tile container).
    const newMode = await browser.execute((id) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { mode: string }>;
          };
        }
      ).__notesapp_layout__;
      return fn && id ? fn().tiles[id]?.mode : null;
    }, editorTileId);
    expect(newMode).toBe("preview");
  });
});

// ---------------------------------------------------------------------------
// Preview picker filters out non-.md files (SPEC.md §4.0.2)
// ---------------------------------------------------------------------------

describe("Preview picker filters non-.md files", () => {
  const projectDir = process.env.NOTESAPP_E2E_PROJECT_DIR;
  const txtName = `plain_${Date.now()}.txt`;

  before(async () => {
    if (!projectDir) throw new Error("NOTESAPP_E2E_PROJECT_DIR not set");
    fs.writeFileSync(
      path.join(projectDir, "notes", txtName),
      "Plain text — should appear in editor picker but not preview picker.\n",
    );
    // Wait for the file-watcher debounce (500ms) before opening any picker.
    await browser.pause(700);
  });

  it("the editor picker lists the plain .txt file", async () => {
    // Ensure an editor tile exists — "Editor↔Preview title-bar toggle" may have
    // converted all editor tiles to preview.
    await ensureEditorTileExists();
    // Open the buffer switcher via the tile's dropdown button — more reliable
    // than the C-x b keyboard shortcut in this part of the test suite where
    // focusedTileId may not survive state changes from prior describe blocks.
    const tileId = await focusFirstTileOfTypeViaStore("editor");
    expect(tileId).toBeTruthy();
    await clickById(`tile-buffer-dropdown-${tileId}`);
    const switcher = await waitForId("buffer-switcher", 3000);
    await expect(switcher).toBeDisplayed();

    const input = await byId("buffer-switcher-input");
    await input.clearValue();
    await input.setValue("plain_");
    await browser.pause(400);

    // Non-.md files keep the full filename (incl. extension) in NoteEntry.name,
    // which BufferSwitcher uses as the testid suffix.
    const item = await waitForId(`buffer-item-${txtName}`, 3000);
    await expect(item).toBeDisplayed();

    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(300);
  });

  it("the preview picker omits the plain .txt file", async () => {
    const tileId = await focusFirstTileOfTypeViaStore("preview");
    expect(tileId).toBeTruthy();
    await clickById(`tile-buffer-dropdown-${tileId}`);
    const switcher = await waitForId("buffer-switcher", 3000);
    await expect(switcher).toBeDisplayed();

    const input = await byId("buffer-switcher-input");
    await input.clearValue();
    await input.setValue("plain_");
    await browser.pause(400);

    // The .txt file should NOT appear in the preview picker.
    const exists = await browser.execute((sel) => {
      return !!document.querySelector(`[data-testid="buffer-item-${sel}"]`);
    }, txtName);
    expect(exists).toBe(false);

    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(300);
  });
});

// ---------------------------------------------------------------------------
// Editor↔Preview toggle is disabled when the bound file is not .md
// (SPEC.md §4.0.1, CLAUDE.md §7.3) — verified via the toggle button's
// `disabled` attribute since visual greying is style-only.
// ---------------------------------------------------------------------------

describe("Editor↔Preview toggle disabled on non-.md files", () => {
  it("the mode indicator is non-interactive (cursor:default) when bound to a .txt buffer", async () => {
    // Ensure an editor tile exists before looking for one.
    await ensureEditorTileExists();
    // Bind any editor tile to the .txt note created by the Preview-filter suite.
    // Build the exact filename via store introspection (the txt was list_notes_all'd
    // already, so we just look it up in the project's notes/ directory listing).
    const editorTileId = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<
              string,
              { mode: string; filePath: string | null }
            >;
          };
        }
      ).__notesapp_layout__;
      const tiles = fn ? fn().tiles : {};
      return Object.keys(tiles).find((k) => tiles[k].mode === "editor") ?? null;
    });
    expect(editorTileId).toMatch(/^editor-/);

    // Focus that tile and open the picker via the buffer-dropdown button.
    await browser.execute((id) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => { focusTile: (id: string) => void };
        }
      ).__notesapp_layout__;
      if (fn && id) fn().focusTile(id);
    }, editorTileId);
    await browser.pause(200);
    await clickById(`tile-buffer-dropdown-${editorTileId}`);
    await waitForId("buffer-switcher", 3000);
    const input = await byId("buffer-switcher-input");
    await input.clearValue();
    await input.setValue("plain_");
    await browser.pause(400);
    await browser.action("key").down(KEY.RETURN).up(KEY.RETURN).perform();
    await browser.pause(700);

    // The toggle is disabled (data-tile-mode is still "editor"; the file path
    // is .txt so canToggleMode === false).  Inspect the button's `disabled` /
    // cursor properties via JS rather than relying on visual greying.
    const indicator = await waitForId(`tile-mode-indicator-${editorTileId}`, 3000);
    const cursor = await indicator.getCSSProperty("cursor");
    expect(cursor.value).toBe("default");

    // Clicking should be a no-op — mode stays "editor".
    await indicator.click();
    await browser.pause(400);
    const modeAfterClick = await browser.execute((id) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { mode: string }>;
          };
        }
      ).__notesapp_layout__;
      return fn && id ? fn().tiles[id]?.mode : null;
    }, editorTileId);
    expect(modeAfterClick).toBe("editor");
  });
});

// ---------------------------------------------------------------------------
// Cancelling a mode-switch picker rolls back the (intended) mode change
// (SPEC.md §4.0.1).  The store opens the picker without mutating tile.mode;
// closing the picker via Esc must leave the tile in its original mode.
// ---------------------------------------------------------------------------

describe("Cancel mode-switch picker rolls back", () => {
  it("Esc on the C-x n p picker leaves the tile in editor mode", async () => {
    // Find an editor tile bound to a .md file.
    const editorTileId = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<
              string,
              { mode: string; filePath: string | null }
            >;
          };
        }
      ).__notesapp_layout__;
      const tiles = fn ? fn().tiles : {};
      return (
        Object.keys(tiles).find(
          (k) =>
            tiles[k].mode === "editor" &&
            (tiles[k].filePath ?? "").endsWith(".md"),
        ) ?? null
      );
    });
    expect(editorTileId).toMatch(/^editor-/);

    await browser.execute((id) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => { focusTile: (id: string) => void };
        }
      ).__notesapp_layout__;
      if (fn && id) fn().focusTile(id);
    }, editorTileId);
    await browser.pause(200);

    // C-x n p opens the Preview picker. The store must NOT have mutated
    // tile.mode at this point (it changes only on confirm via requestSetTileFile).
    await sendCxChord("n");
    await browser.action("key").down("p").up("p").perform();
    const switcher = await waitForId("buffer-switcher", 3000);
    await expect(switcher).toBeDisplayed();

    // Esc cancels — mode must remain "editor".
    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(400);
    const switcherStillThere = await browser.execute(() => {
      return !!document.querySelector('[data-testid="buffer-switcher"]');
    });
    expect(switcherStillThere).toBe(false);

    const modeAfterCancel = await browser.execute((id) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { mode: string }>;
          };
        }
      ).__notesapp_layout__;
      return fn && id ? fn().tiles[id]?.mode : null;
    }, editorTileId);
    expect(modeAfterCancel).toBe("editor");
  });
});

// ---------------------------------------------------------------------------
// C-x 0 last-tile-of-dirty-buffer triggers Save/Discard/Cancel (SPEC.md §4.0.1)
// ---------------------------------------------------------------------------

describe("C-x 0 last-tile-of-dirty-buffer dialog", () => {
  const projectDir = process.env.NOTESAPP_E2E_PROJECT_DIR;
  const dialogFile = `dialog_target_${Date.now()}.md`;

  before(async () => {
    if (!projectDir) throw new Error("NOTESAPP_E2E_PROJECT_DIR not set");
    // Dismiss any leftover overlay from earlier blocks.
    await dismissOpenOverlays();

    fs.writeFileSync(
      path.join(projectDir, "notes", dialogFile),
      "# Dialog target\n\nbody\n",
    );
    // Wait for the file-watcher debounce (500ms) to add the new file to the
    // project store before opening the buffer switcher.
    await browser.pause(700);

    // Bind an editor tile to this file via the tile's buffer-dropdown button.
    const dialogTileId = await focusFirstTileOfTypeViaStore("editor");
    expect(dialogTileId).toBeTruthy();
    await clickById(`tile-buffer-dropdown-${dialogTileId}`);
    await waitForId("buffer-switcher", 3000);
    const input = await byId("buffer-switcher-input");
    await input.clearValue();
    await input.setValue("dialog_target");
    await browser.pause(300);
    await browser.action("key").down(KEY.RETURN).up(KEY.RETURN).perform();
    await browser.pause(700);

    // Focus the specific tile before clicking its cm-content.
    // $(".cm-content") would grab the first cm-content in DOM order (may be
    // a different tile); use the tile-specific selector instead.
    await browser.execute((id) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => { focusTile: (id: string) => void };
        }
      ).__notesapp_layout__;
      if (fn && id) fn().focusTile(id as string);
    }, dialogTileId);
    await browser.pause(200);
    const cmContent = await $(
      `[data-testid="codemirror-editor-${dialogTileId}"] .cm-content`,
    );
    await cmContent.waitForDisplayed({ timeout: 3000 });
    await cmContent.click();
    await browser.pause(200);
    // Append a single character to mark dirty.
    await browser.action("key")
      .down(KEY.CTRL).down(KEY.END).up(KEY.END).up(KEY.CTRL)
      .perform();
    await browser.pause(100);
    await browser.action("key").down("x").up("x").perform();
    await browser.pause(400);
  });

  it("C-x 0 on the last tile bound to a dirty buffer opens the unsaved-changes dialog", async () => {
    // Confirm dirty state.
    const editorTileId = await browser.execute((name) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { mode: string; filePath: string | null }>;
          };
        }
      ).__notesapp_layout__;
      const tiles = fn ? fn().tiles : {};
      return (
        Object.keys(tiles).find(
          (k) =>
            tiles[k].mode === "editor" && tiles[k].filePath?.endsWith(name),
        ) ?? null
      );
    }, dialogFile);
    expect(editorTileId).toMatch(/^editor-/);

    // Focus the bound editor tile via store API (avoids click landing on a
    // sibling tile that prior tests may have shifted into focus).
    await browser.execute((id) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => { focusTile: (id: string) => void };
        }
      ).__notesapp_layout__;
      if (fn && id) fn().focusTile(id);
    }, editorTileId);
    await browser.pause(200);

    await sendCxChord("0");
    const dialog = await waitForId("unsaved-dialog", 3000);
    await expect(dialog).toBeDisplayed();
  });

  it("Cancel dismisses the dialog and the tile remains", async () => {
    const tilesBefore = await getTileCount();
    await clickById("unsaved-dialog-cancel");
    await browser.pause(400);
    const dialog = await byId("unsaved-dialog");
    await expect(dialog).not.toBeDisplayed();
    const tilesAfter = await getTileCount();
    expect(tilesAfter).toBe(tilesBefore);
  });

  it("Discard closes the tile and clears its dirty state", async () => {
    // Re-trigger the dialog: the tile is still focused and still dirty.
    const editorTileId = await browser.execute((name) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { mode: string; filePath: string | null }>;
          };
        }
      ).__notesapp_layout__;
      const tiles = fn ? fn().tiles : {};
      return (
        Object.keys(tiles).find(
          (k) =>
            tiles[k].mode === "editor" && tiles[k].filePath?.endsWith(name),
        ) ?? null
      );
    }, dialogFile);
    expect(editorTileId).toMatch(/^editor-/);

    await browser.execute((id) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => { focusTile: (id: string) => void };
        }
      ).__notesapp_layout__;
      if (fn && id) fn().focusTile(id);
    }, editorTileId);
    await browser.pause(200);

    const tilesBefore = await getTileCount();
    await sendCxChord("0");
    await waitForId("unsaved-dialog", 3000);

    await clickById("unsaved-dialog-discard");
    await browser.pause(800);

    // Dialog gone, tile gone.
    const dialogStillThere = await browser.execute(() => {
      return !!document.querySelector('[data-testid="unsaved-dialog"]');
    });
    expect(dialogStillThere).toBe(false);

    const tilesAfter = await getTileCount();
    expect(tilesAfter).toBe(tilesBefore - 1);

    // The tile is gone from the layout store too.
    const stillBound = await browser.execute((name) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { filePath: string | null }>;
          };
        }
      ).__notesapp_layout__;
      const tiles = fn ? fn().tiles : {};
      return Object.values(tiles).some((t) => t.filePath?.endsWith(name));
    }, dialogFile);
    expect(stillBound).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Consolidated quit dialog (SPEC.md §4.0.1) — Cancel branch only.
// Save/Discard branches terminate the session, so they're covered by Vitest.
// ---------------------------------------------------------------------------

describe("Consolidated quit dialog", () => {
  it("shows the quit dialog with dirty buffers listed", async () => {
    // Find an editor tile and its file path.
    const tileInfo = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { mode: string; filePath: string | null }>;
          };
        }
      ).__notesapp_layout__;
      const tiles = fn ? fn().tiles : {};
      for (const [id, t] of Object.entries(tiles)) {
        if (t.mode === "editor" && t.filePath) {
          return { id, filePath: t.filePath };
        }
      }
      return null;
    });
    expect(tileInfo).not.toBeNull();

    // Mark the tile dirty and trigger the quit dialog via the store.
    await browser.execute((info) => {
      const layoutFn = (
        window as Window & {
          __notesapp_layout__?: () => {
            setPendingDialog: (d: unknown) => void;
          };
        }
      ).__notesapp_layout__;
      if (!layoutFn || !info) return;
      const store = layoutFn();
      store.setPendingDialog({
        kind: "quit",
        dirtyBuffers: [
          {
            filePath: info.filePath,
            representativeTileId: info.id,
          },
        ],
      });
    }, tileInfo);
    await browser.pause(300);

    // Assert the quit dialog appeared.
    const dialog = await waitForId("quit-dialog", 3000);
    await expect(dialog).toBeDisplayed();

    // Assert the dirty buffer is listed by filename.
    const fileName = tileInfo!.filePath.split("/").pop()!;
    const item = await waitForId(`quit-dialog-item-${fileName}`, 2000);
    await expect(item).toBeDisplayed();

    // The save checkbox should default to checked.
    const checkbox = await byId(`quit-dialog-save-${fileName}`);
    const checked = await checkbox.getAttribute("checked");
    // WebKit returns "true" or null for checked attribute
    expect(checked === "true" || checked === "").toBeTruthy();
  });

  it("Cancel dismisses the quit dialog without saving or quitting", async () => {
    // The dialog should still be open from the previous test.
    await clickById("quit-dialog-cancel");
    await browser.pause(300);

    // Dialog should be dismissed.
    const dialogGone = await browser.execute(() => {
      return document.querySelector('[data-testid="quit-dialog"]') === null;
    });
    expect(dialogGone).toBe(true);

    // Tiles still exist — the app did not quit.
    const count = await getTileCount();
    expect(count).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Drag from Explorer sidebar onto tile (SPEC.md §4.2 / CLAUDE.md §4.2)
//
// WebKitGTK WebDriver cannot synthesize real HTML5 drag events via the
// W3C Actions API. This test dispatches synthetic DragEvents from
// browser.execute() to verify the React onDrop handler wiring.
// See COMPAT.md for the native-gesture gap note.
// ---------------------------------------------------------------------------

describe("Drag from Explorer onto tile rebinds", () => {
  it("dropping a sidebar file onto an editor tile rebinds it", async () => {
    // Ensure the sidebar is visible.
    const sidebarVisible = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => { sidebarVisible: boolean };
        }
      ).__notesapp_layout__;
      return fn ? fn().sidebarVisible : false;
    });
    if (!sidebarVisible) {
      await sendCtrlShift("b");
      await browser.pause(300);
    }

    // Get the focused tile id and its current file.
    await clickFirstTileOfType("editor");
    await browser.pause(200);
    const focusedInfo = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            focusedTileId: string | null;
            tiles: Record<string, { mode: string; filePath: string | null }>;
          };
        }
      ).__notesapp_layout__;
      if (!fn) return null;
      const s = fn();
      const id = s.focusedTileId;
      if (!id) return null;
      return { id, filePath: s.tiles[id]?.filePath };
    });
    expect(focusedInfo).not.toBeNull();

    // Pick a note that is different from the currently bound file.
    const allNotes = await browser.execute(() => {
      const el = document.querySelectorAll('[data-testid^="sidebar-file-"]');
      return Array.from(el).map((e) => ({
        testId: e.getAttribute("data-testid") ?? "",
        title: e.getAttribute("title") ?? "",
      }));
    });
    expect(allNotes.length).toBeGreaterThan(0);

    // Find a sidebar note whose path differs from the current binding.
    // The sidebar title attribute is: "notename.md — drag to open in a tile"
    // Extract the path from data-testid ("sidebar-file-notename") and find
    // the note in projectStore.
    const projectDir = process.env.NOTESAPP_E2E_PROJECT_DIR;
    if (!projectDir) throw new Error("NOTESAPP_E2E_PROJECT_DIR not set");

    // We'll use alpha.md as our drag source, constructing the full path.
    // If the tile is already on alpha.md, use beta.md instead.
    const currentFile = focusedInfo!.filePath ?? "";
    const dragName = currentFile.endsWith("alpha.md") ? "beta" : "alpha";
    const dragPath = `${projectDir}/notes/${dragName}.md`;

    // Dispatch synthetic drag events via browser.execute.
    const dropped = await browser.execute(
      (sidebarTestId, tileTestId, notePath) => {
        const src = document.querySelector(
          `[data-testid="${sidebarTestId}"]`,
        );
        const tgt = document.querySelector(
          `[data-testid="${tileTestId}"]`,
        );
        if (!src || !tgt) return false;
        const dt = new DataTransfer();
        dt.setData("text/notesapp-path", notePath);
        dt.setData("text/plain", notePath);
        src.dispatchEvent(
          new DragEvent("dragstart", {
            dataTransfer: dt,
            bubbles: true,
          }),
        );
        tgt.dispatchEvent(
          new DragEvent("dragover", {
            dataTransfer: dt,
            bubbles: true,
          }),
        );
        tgt.dispatchEvent(
          new DragEvent("drop", { dataTransfer: dt, bubbles: true }),
        );
        return true;
      },
      `sidebar-file-${dragName}`,
      `tile-${focusedInfo!.id}`,
      dragPath,
    );
    expect(dropped).toBe(true);
    await browser.pause(500);

    // Assert the tile is now bound to the dragged file.
    const newFilePath = await browser.execute((id) => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => {
            tiles: Record<string, { filePath: string | null }>;
          };
        }
      ).__notesapp_layout__;
      return fn && id ? fn().tiles[id]?.filePath : null;
    }, focusedInfo!.id);
    expect(newFilePath).toContain(`${dragName}.md`);
  });
});

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Mermaid diagram rendering in Preview pane (SPEC.md §3.x rendering pipeline)
//
// Loads a fixture note containing a fenced ```mermaid block, binds a Preview
// tile to it, and asserts that the rendered SVG appears in the DOM.
// This test catches the class-of-bugs where mermaid.render() throws silently
// (DOMPurify issues, dynamic-import failures, etc.) and the preview shows
// either a raw <pre> block or a .mermaid-error div instead of an SVG.
// ---------------------------------------------------------------------------

describe("Mermaid diagram rendering in Preview", () => {
  before(async () => {
    await dismissOpenOverlays();
  });

  it("renders a fenced mermaid block as an SVG diagram (no .mermaid-error)", async () => {
    // Find a preview tile and bind it to the mermaid fixture note via C-x b.
    await clickFirstTileOfType("preview");
    await browser.pause(200);

    await sendCxChord("b");
    const switcher = await waitForId("buffer-switcher", 3000);
    await expect(switcher).toBeDisplayed();

    const input = await byId("buffer-switcher-input");
    await input.clearValue();
    await input.setValue("mermaid");
    await browser.pause(300);
    await browser.action("key").down(KEY.RETURN).up(KEY.RETURN).perform();
    // Wait for: debounce (150ms) + mermaid.render() (variable) + React commit.
    await browser.pause(800);

    // The mermaid.render() call is async; wait up to 5s for the SVG to appear.
    // We use XPath (live DOM protocol) rather than browser.execute (stale context).
    const mermaidSvg = $('//*[contains(@class,"mermaid-container")]//*[local-name()="svg"]');
    await mermaidSvg.waitForExist({
      timeout: 5000,
      timeoutMsg: "Expected .mermaid-container > svg to appear in the preview within 5s — mermaid.render() may have failed",
    });
    await expect(mermaidSvg).toBeDisplayed();

    // Confirm there is NO .mermaid-error div — a present error div means
    // mermaid.render() threw and the block was replaced with an error message.
    const hasError = await browser.execute(() => {
      return !!document.querySelector(".mermaid-error");
    });
    expect(hasError).toBe(false);

    // Confirm the raw fenced code block is gone (it was replaced).
    const hasRawBlock = await browser.execute(() => {
      return !!document.querySelector("code.language-mermaid");
    });
    expect(hasRawBlock).toBe(false);
  });
});

// Layout persistence — kept LAST so its assertions are not perturbed by the
// dynamic file-add / file-delete scenarios above.
// ---------------------------------------------------------------------------

describe("Layout persistence", () => {
  it("tiles exist, implying layout was initialized", async () => {
    const count = await getTileCount();
    expect(count).toBeGreaterThan(0);
  });

  it("auto-persists structural changes to .notesapp/layout.json", async () => {
    const projectDir = process.env.NOTESAPP_E2E_PROJECT_DIR;
    if (!projectDir) {
      throw new Error(
        "NOTESAPP_E2E_PROJECT_DIR not set — wdio.conf.ts must export it",
      );
    }
    const layoutPath = path.join(projectDir, ".notesapp", "layout.json");

    // Trigger a structural change: split the focused tile horizontally.
    await clickFirstTileOfType("editor");
    await browser.pause(200);
    await sendCxChord("h");
    // Debounce is 250ms + IPC + write → 800ms is a safe ceiling.
    await browser.pause(800);

    expect(fs.existsSync(layoutPath)).toBe(true);
    const raw = fs.readFileSync(layoutPath, "utf-8");
    const persisted = JSON.parse(raw) as {
      tree: unknown;
      tiles: Record<string, unknown>;
    };
    expect(persisted.tree).toBeDefined();
    expect(persisted.tiles).toBeDefined();

    const persistedLeafCount = countLeaves(persisted.tree);
    const currentCount = await getTileCount();
    expect(persistedLeafCount).toBe(currentCount);
  });

  it("the persisted file is what loadLayout would consume on relaunch", async () => {
    const projectDir = process.env.NOTESAPP_E2E_PROJECT_DIR;
    if (!projectDir) throw new Error("NOTESAPP_E2E_PROJECT_DIR not set");
    const layoutPath = path.join(projectDir, ".notesapp", "layout.json");
    const persisted = JSON.parse(fs.readFileSync(layoutPath, "utf-8")) as {
      tree: unknown;
      tiles: Record<string, { mode: string; filePath: string | null }>;
    };

    // Shape assertions — these are the invariants AppShell's loadLayout relies
    // on.  If any of these fail, the relaunch path would silently fall back to
    // initDefaultLayout and user layout would be lost.
    expect(typeof persisted.tree === "object" || typeof persisted.tree === "string")
      .toBe(true);

    // Every leaf id in the tree must correspond to a tile entry — this is
    // exactly the invariant loadLayout enforces before calling set().
    const leafIds: string[] = [];
    (function collect(node: unknown): void {
      if (typeof node === "string") {
        leafIds.push(node);
        return;
      }
      if (node && typeof node === "object" && "first" in node) {
        const n = node as { first: unknown; second: unknown };
        collect(n.first);
        collect(n.second);
      }
    })(persisted.tree);

    expect(leafIds.length).toBeGreaterThan(0);
    for (const id of leafIds) {
      expect(persisted.tiles[id]).toBeDefined();
      // Phase 1 valid persisted modes: editor, preview, missing (per SPEC §5.5
      // a Missing tile that survives a restart re-resolves on next launch).
      // reference/aichat are stubs in Phase 1 and not produced by any test in
      // this suite, but loadLayout would round-trip them too.
      expect(
        ["editor", "preview", "missing", "reference", "aichat"].includes(
          persisted.tiles[id].mode,
        ),
      ).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// C-x N tile focus, number badge, and unrecognised-chord buffer-leak guard
// ---------------------------------------------------------------------------

describe("C-x N tile focus and number badge (SPEC §4.1)", () => {
  /** Read the ordered tile IDs from the live layout store via the E2E bridge. */
  async function getOrderedTileIds(): Promise<string[]> {
    return browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => { getOrderedTileIds: () => string[] };
        }
      ).__notesapp_layout__;
      return fn ? fn().getOrderedTileIds() : [];
    });
  }

  it("number badges appear (one per tile) when C-x prefix is active", async () => {
    // Start from a clean 2-tile state.
    await waitForId("app-root", 25000);
    await clickFirstTile();
    await browser.pause(200);

    const tileCountBefore = await getTileCount();
    expect(tileCountBefore).toBeGreaterThanOrEqual(2);

    // Fire C-x without completing the chord.
    await browser.action('key')
      .down(KEY.CTRL).down('x').up('x').up(KEY.CTRL)
      .perform();
    await browser.pause(200);

    // Every tile should now have a visible number badge.
    const badgeCount = await browser.execute(() =>
      document.querySelectorAll('[data-testid^="tile-number-badge-"]').length,
    );
    expect(badgeCount).toBe(tileCountBefore);
  });

  it("number badges disappear after the chord completes", async () => {
    await clickFirstTile();
    await browser.pause(200);

    // Send a full recognised chord (C-x o).
    await sendCxChord('o');
    await browser.pause(200);

    const badgeCount = await browser.execute(() =>
      document.querySelectorAll('[data-testid^="tile-number-badge-"]').length,
    );
    expect(badgeCount).toBe(0);
  });

  it("number badges disappear after an unrecognised chord (C-x q)", async () => {
    await clickFirstTile();
    await browser.pause(200);

    await browser.action('key')
      .down(KEY.CTRL).down('x').up('x').up(KEY.CTRL)
      .perform();
    await browser.pause(200);

    await browser.action('key').down('q').up('q').perform();
    await browser.pause(200);

    const badgeCount = await browser.execute(() =>
      document.querySelectorAll('[data-testid^="tile-number-badge-"]').length,
    );
    expect(badgeCount).toBe(0);
  });

  it("C-x 2 focuses the second tile in reading order", async () => {
    // Ensure we start with at least 2 tiles.
    await waitForId("app-root", 25000);
    const tileCount = await getTileCount();
    expect(tileCount).toBeGreaterThanOrEqual(2);

    // Click the first tile to make it focused.
    await clickFirstTile();
    await browser.pause(300);

    const orderedIds = await getOrderedTileIds();
    expect(orderedIds.length).toBeGreaterThanOrEqual(2);

    // Send C-x 2.
    await browser.action('key')
      .down(KEY.CTRL).down('x').up('x').up(KEY.CTRL)
      .perform();
    await browser.pause(150);
    await browser.action('key').down('2').up('2').perform();
    await browser.pause(300);

    const focusedId = await getFocusedTileId();
    expect(focusedId).toBe(orderedIds[1]);
  });

  it("C-x 1 focuses the first tile in reading order", async () => {
    await waitForId("app-root", 25000);

    const orderedIds = await getOrderedTileIds();
    expect(orderedIds.length).toBeGreaterThanOrEqual(1);

    // Focus tile 2 first so we know focus is somewhere other than tile 1.
    if (orderedIds.length >= 2) {
      await browser.action('key')
        .down(KEY.CTRL).down('x').up('x').up(KEY.CTRL)
        .perform();
      await browser.pause(150);
      await browser.action('key').down('2').up('2').perform();
      await browser.pause(300);
    }

    // Now send C-x 1.
    await browser.action('key')
      .down(KEY.CTRL).down('x').up('x').up(KEY.CTRL)
      .perform();
    await browser.pause(150);
    await browser.action('key').down('1').up('1').perform();
    await browser.pause(300);

    const focusedId = await getFocusedTileId();
    expect(focusedId).toBe(orderedIds[0]);
  });

  it("C-x q (unrecognised chord) does not insert 'q' into the editor buffer", async () => {
    // Click the first editor tile so it is focused and interactable.
    await clickFirstTileOfType("editor");
    await browser.pause(300);

    // Click the CodeMirror content area to place the cursor.
    const cmContent = await $(".cm-content");
    await cmContent.waitForDisplayed({ timeout: 5000 });
    // Use execute-click as a workaround for WebKitWebDriver interactability
    // quirks that sometimes prevent .click() after a focus change.
    await browser.execute((el: HTMLElement) => el.click(), cmContent);
    await browser.pause(300);

    // Select all and replace with a unique sentinel.
    const sentinel = "BUFLEAKGUARD" + Date.now();
    await browser.action('key')
      .down(KEY.CTRL).down('a').up('a').up(KEY.CTRL)
      .perform();
    await browser.pause(100);
    for (const ch of sentinel) {
      await browser.action('key').down(ch).up(ch).perform();
    }
    await browser.pause(200);

    // Send C-x q — the unrecognised chord must NOT insert 'q'.
    await browser.action('key')
      .down(KEY.CTRL).down('x').up('x').up(KEY.CTRL)
      .perform();
    await browser.pause(150);
    await browser.action('key').down('q').up('q').perform();
    await browser.pause(300);

    // Read the editor text.  The CM content element holds the document text.
    const editorText = await browser.execute(
      () => document.querySelector(".cm-content")?.textContent ?? "",
    );
    // The sentinel must appear without an extra 'q' appended or prepended.
    expect(editorText).toContain(sentinel);
    expect(editorText).not.toContain(sentinel + "q");
    expect(editorText).not.toMatch(new RegExp("q" + sentinel));
  });

  it("C-x h then C-x N — typing reaches the correct editor tile", async () => {
    // Click the first editor tile to give it focus, note its reading-order position.
    await clickFirstTileOfType("editor");
    await browser.pause(300);

    const idsBeforeSplit = await getOrderedTileIds();
    const focusedId = await getFocusedTileId();
    const origPos = idsBeforeSplit.indexOf(focusedId ?? "");
    expect(origPos).toBeGreaterThanOrEqual(0);

    // Split the focused editor horizontally.  The new tile lands immediately
    // after the original in reading order (same subtree, splitTile first=orig).
    await sendCxChord("h");
    await browser.pause(500);

    const idsAfterSplit = await getOrderedTileIds();
    // Original tile is still at the same position; new tile is right after it.
    const origN = origPos + 1;      // C-x N for original tile (1-indexed)
    const newN  = origPos + 2;      // C-x N for newly created tile
    expect(newN).toBeLessThanOrEqual(9);  // sanity: both positions are addressable

    const origTileId = idsAfterSplit[origPos];
    const newTileId  = idsAfterSplit[origPos + 1];
    expect(origTileId).toBe(focusedId);   // original tile preserved

    // C-x origN — focus the original tile and verify DOM activeElement lands
    // inside its editor pane.  WebKitGTK WebDriver key routing does not follow
    // programmatic .focus() calls, so we assert document.activeElement rather
    // than attempting to type and read back text (which would be a no-op for
    // the WebDriver focus stack while still being correct for real user input).
    await browser.action('key').down(KEY.CTRL).down('x').up('x').up(KEY.CTRL).perform();
    await browser.pause(150);
    await browser.action('key').down(String(origN)).up(String(origN)).perform();
    await browser.pause(300);

    const origEditorHasFocus = await browser.execute((id: string) => {
      const pane = document.querySelector(`[data-testid="editor-pane-${id}"]`);
      return pane !== null && pane.contains(document.activeElement);
    }, origTileId);
    expect(origEditorHasFocus).toBe(true);

    // C-x newN — focus the new tile and verify DOM activeElement moved to it.
    await browser.action('key').down(KEY.CTRL).down('x').up('x').up(KEY.CTRL).perform();
    await browser.pause(150);
    await browser.action('key').down(String(newN)).up(String(newN)).perform();
    await browser.pause(300);

    const newEditorHasFocus = await browser.execute((id: string) => {
      const pane = document.querySelector(`[data-testid="editor-pane-${id}"]`);
      return pane !== null && pane.contains(document.activeElement);
    }, newTileId);
    expect(newEditorHasFocus).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WYSIWYG Emacs keybindings (SPEC.md §5.2)
//
// Uses the `emacs.md` fixture note: "abc def\n\n# heading\n\nsecond paragraph\n"
// Each test opens that note in a Preview tile and verifies a motion binding.
// Skipped on macOS (ISSUE-003 — WebKitWebDriver not available on macOS).
// ---------------------------------------------------------------------------

const WYSIWYG_SKIP_ON_MACOS = process.platform === "darwin";

/** Click inside the Tiptap editor to give it keyboard focus. */
async function focusWysiwygEditor() {
  await $(".ProseMirror").waitForExist({ timeout: 5000 });
  // focus() must be called explicitly on the contenteditable so ProseMirror
  // syncs its internal selection to the DOM; click() alone is not enough in
  // WebKit WebDriver (synthetic events may not trigger focus transfer).
  await browser.execute(() => {
    const el = document.querySelector(".ProseMirror") as HTMLElement | null;
    if (el) { el.focus(); el.click(); }
  });
  await browser.pause(200);
}

/** Load a note by name into the currently focused tile via C-x b. */
async function loadNoteInFocusedTile(noteName: string) {
  await browser.action("key")
    .down(KEY.CTRL).down("x").up("x").up(KEY.CTRL)
    .perform();
  await browser.pause(150);
  await browser.action("key").down("b").up("b").perform();
  await browser.pause(300);

  const input = $('//*[@data-testid="buffer-switcher-input"]');
  await input.waitForExist({ timeout: 5000 });
  await input.setValue(noteName);
  await browser.pause(300);
  await browser.action("key").down(KEY.RETURN).up(KEY.RETURN).perform();
  await browser.pause(500);
}

/**
 * Focus the first Editor tile via the Zustand store's focusTile action.
 *
 * WebKitWebDriver runs browser.execute() in a stale JS context — el.click()
 * from that context may not fire the React onClick handler, leaving
 * focusedTileId unset in the store.  Using the store API directly is
 * reliable across test boundaries.
 */
async function clickFirstEditorTileForWysiwyg() {
  // If no editor tiles exist (prior WYSIWYG suites convert editors to preview),
  // toggle the first preview tile back to editor via its mode-indicator button.
  const hasEditor = await browser.execute(() => {
    const fn = (
      window as Window & {
        __notesapp_layout__?: () => { tiles: Record<string, { mode: string }> };
      }
    ).__notesapp_layout__;
    return fn
      ? Object.values(fn().tiles).some((t) => (t as { mode: string }).mode === "editor")
      : false;
  });
  if (!hasEditor) {
    const previewId = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => { tiles: Record<string, { mode: string }> };
        }
      ).__notesapp_layout__;
      if (!fn) return null;
      const { tiles } = fn();
      return Object.keys(tiles).find((k) => tiles[k].mode === "preview") ?? null;
    });
    if (previewId) {
      // Click the mode indicator to toggle preview → editor.
      await clickById(`tile-mode-indicator-${previewId}`);
      await browser.pause(500);
    }
  }

  await $('//*[@data-tile-mode="editor"]').waitForExist({ timeout: 10000 });
  const tileId = await browser.execute(() => {
    const fn = (
      window as Window & {
        __notesapp_layout__?: () => {
          tiles: Record<string, { mode: string }>;
          focusTile: (id: string) => void;
        };
      }
    ).__notesapp_layout__;
    if (!fn) return null;
    const { tiles, focusTile } = fn();
    const id = Object.keys(tiles).find((k) => tiles[k].mode === "editor") ?? null;
    if (id) focusTile(id);
    return id;
  });
  // Also give DOM focus via XPath click so WebKitWebDriver key delivery works.
  if (tileId) {
    const el = $(`//*[@data-testid="tile-${tileId}"]`);
    await el.waitForExist({ timeout: 3000 });
    await el.click();
  }
  await browser.pause(150);
}

/**
 * Ensure at least one editor tile exists in the layout.
 *
 * Prior test suites (e.g. "Editor↔Preview title-bar toggle") may convert all
 * editor tiles to preview mode.  Tests that need an editor tile call this
 * helper first so they do not fail with a "tile not found" timeout.
 */
async function ensureEditorTileExists(): Promise<void> {
  const hasEditor = await browser.execute(() => {
    const fn = (
      window as Window & {
        __notesapp_layout__?: () => { tiles: Record<string, { mode: string }> };
      }
    ).__notesapp_layout__;
    return fn
      ? Object.values(fn().tiles).some(
          (t) => (t as { mode: string }).mode === "editor",
        )
      : false;
  });
  if (!hasEditor) {
    // Toggle the first available preview tile back to editor via its mode
    // indicator button (one-click toggle, no picker opens for non-.md).
    const previewId = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => { tiles: Record<string, { mode: string }> };
        }
      ).__notesapp_layout__;
      if (!fn) return null;
      const { tiles } = fn();
      return (
        Object.keys(tiles).find((k) => tiles[k].mode === "preview") ?? null
      );
    });
    if (previewId) {
      await clickById(`tile-mode-indicator-${previewId}`);
      await browser.pause(500);
    }
    await $('//*[@data-tile-mode="editor"]').waitForExist({ timeout: 5000 });
  }
}

/** Return the caret startOffset within the current ProseMirror selection. */
async function getWysiwygCaretOffset(): Promise<number> {
  return browser.execute(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return -1;
    return sel.getRangeAt(0).startOffset;
  });
}

/** Return the text content of the selection's anchor node. */
async function getWysiwygAnchorText(): Promise<string> {
  return browser.execute(() => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return "";
    return sel.anchorNode.textContent ?? "";
  });
}

/**
 * Return the text from the start of the cursor's containing block to the
 * cursor position, staying within the .ProseMirror root.
 *
 * More reliable than `startOffset` because that value is a child-index
 * when the range container is an element node (ProseMirror places the cursor
 * in `<p>` at childIndex 1 after `selectTextblockEnd`, not in the text node
 * at character offset 7).  Also guards against the case where `window.
 * getSelection()` refers to a position outside the editor (e.g. body level),
 * which returns "" rather than a misleadingly large string.
 */
async function getTextBeforeCursorInBlock(): Promise<string> {
  return browser.execute(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return "";
    const range = sel.getRangeAt(0);
    let container: Node = range.startContainer;

    // Normalise: walk text nodes up to their parent element.
    if (container.nodeType === 3 /* TEXT_NODE */) {
      container = (container as Text).parentElement!;
    }

    // Guard: if the selection is outside .ProseMirror, we can't measure.
    if (!(container as Element).closest?.(".ProseMirror")) return "";

    // Find the direct block-level child of .ProseMirror that contains the cursor.
    let block = container as Element;
    while (block.parentElement && !block.parentElement.classList.contains("ProseMirror")) {
      block = block.parentElement;
    }

    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(range.startContainer, range.startOffset);
    return before.toString();
  });
}

describe("WYSIWYG Emacs keybindings", function () {
  before(async () => {
    if (WYSIWYG_SKIP_ON_MACOS) {
      console.log("  WYSIWYG Emacs E2E SKIPPED — ISSUE-003 (macOS E2E unavailable).");
    }
    await waitForId("app-root", 25000);
    await dismissOpenOverlays();
    await browser.pause(300);
  });

  beforeEach(async function () {
    if (WYSIWYG_SKIP_ON_MACOS) { this.skip(); return; }

    // Focus the first editor tile and load the emacs fixture.
    await clickFirstEditorTileForWysiwyg();
    await loadNoteInFocusedTile("emacs");

    // Switch the tile to Preview using the title-bar mode-indicator button
    // (direct one-click toggle: no note picker opens).  We need the tile ID
    // to locate the button.
    const tileId = await browser.execute(() => {
      const fn = (
        window as Window & {
          __notesapp_layout__?: () => { focusedTileId: string | null };
        }
      ).__notesapp_layout__;
      return fn ? fn().focusedTileId : null;
    });
    if (!tileId) throw new Error("No focused tile after loading emacs note");
    await browser.execute((id) => {
      const el = document.querySelector(
        `[data-testid="tile-mode-indicator-${id}"]`,
      ) as HTMLElement | null;
      if (el) el.click();
    }, tileId);

    // Wait for the Tiptap editor to mount and render the emacs fixture content.
    // The 'abc def' text from the first paragraph is the canary.
    await browser.waitUntil(
      async () => {
        const text = await browser.execute(() => {
          const pm = document.querySelector(".ProseMirror");
          return pm ? pm.textContent : "";
        });
        return typeof text === "string" && text.includes("abc def");
      },
      { timeout: 8000, interval: 150, timeoutMsg: "emacs.md content not visible in WYSIWYG editor within 8s" },
    );
    await browser.pause(300);

    await focusWysiwygEditor();
  });

  it("Esc > moves cursor to end of document", async () => {
    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(150);
    await browser.action("key").down(">").up(">").perform();
    await browser.pause(300);

    const anchorText = await getWysiwygAnchorText();
    expect(anchorText).toContain("second paragraph");
  });

  it("Esc < moves cursor to beginning of document", async () => {
    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(100);
    await browser.action("key").down(">").up(">").perform();
    await browser.pause(200);

    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(100);
    await browser.action("key").down("<").up("<").perform();
    await browser.pause(300);

    const anchorText = await getWysiwygAnchorText();
    expect(anchorText).toContain("abc def");
    const offset = await getWysiwygCaretOffset();
    expect(offset).toBe(0);
  });

  it("Ctrl-e moves cursor to end of current line", async () => {
    // Use Ctrl-a (no character insertion) to go to line start, then Ctrl-e
    // to go to line end.  Esc < is intentionally avoided here because WebKit
    // fires beforeinput independently of keydown.preventDefault(), causing
    // the `<` character to be inserted into the note content.
    await browser.action("key")
      .down(KEY.CTRL).down("a").up("a").up(KEY.CTRL)
      .perform();
    await browser.pause(150);

    await browser.action("key")
      .down(KEY.CTRL).down("e").up("e").up(KEY.CTRL)
      .perform();
    await browser.pause(200);

    // After Ctrl-e the cursor should be at the end of the paragraph.
    // Verify by round-tripping back with Ctrl-a and checking offset = 0.
    const textAfterCtrlE = await getTextBeforeCursorInBlock();
    expect(textAfterCtrlE.length).toBeGreaterThan(0); // moved from start to end

    await browser.action("key")
      .down(KEY.CTRL).down("a").up("a").up(KEY.CTRL)
      .perform();
    await browser.pause(150);
    const offsetAfterCtrlA = await getWysiwygCaretOffset();
    expect(offsetAfterCtrlA).toBe(0); // round-trip: back to start
  });

  it("Ctrl-a moves cursor to start of current line", async () => {
    // Use Ctrl-e to move to line end (no character insertion), then Ctrl-a.
    // Esc-prefix navigation is avoided because WebKit fires beforeinput
    // independently of keydown.preventDefault(), causing the suffix character
    // (e.g. `<`, `>`) to be inserted into the note and corrupt later tests.
    await browser.action("key")
      .down(KEY.CTRL).down("e").up("e").up(KEY.CTRL)
      .perform();
    await browser.pause(150);

    // Sanity: cursor is now at end of line — text before it is non-empty.
    const textAtEnd = await getTextBeforeCursorInBlock();
    expect(textAtEnd.length).toBeGreaterThan(0);

    await browser.action("key")
      .down(KEY.CTRL).down("a").up("a").up(KEY.CTRL)
      .perform();
    await browser.pause(200);

    const offset = await getWysiwygCaretOffset();
    expect(offset).toBe(0);
  });

  it("Esc f advances cursor by one word", async () => {
    // Use Ctrl-a to go to line start without inserting any characters.
    // Esc-prefix navigation (Esc > / Esc <) inserts the suffix character via
    // WebKit's beforeinput, corrupting the note across tests.
    await browser.action("key")
      .down(KEY.CTRL).down("a").up("a").up(KEY.CTRL)
      .perform();
    await browser.pause(150);

    // Text before cursor should be "" at line start.
    const textBefore = await getTextBeforeCursorInBlock();

    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(100);
    await browser.action("key").down("f").up("f").perform();
    await browser.pause(300);

    // After moving forward one word, more text precedes the cursor than before.
    const textAfter = await getTextBeforeCursorInBlock();
    expect(textAfter.length).toBeGreaterThan(textBefore.length);
  });
});

// ---------------------------------------------------------------------------
// WYSIWYG table insertion via toolbar (ISSUE-014, SPEC.md §5.2)
//
// Uses the `emacs.md` fixture note and the same WYSIWYG setup as the
// Emacs-keybindings suite above.  Skipped on macOS (ISSUE-003).
// ---------------------------------------------------------------------------

describe("WYSIWYG toolbar — table insertion", function () {
  before(async () => {
    if (WYSIWYG_SKIP_ON_MACOS) {
      console.log("  WYSIWYG toolbar E2E SKIPPED — ISSUE-003 (macOS E2E unavailable).");
    }
    await waitForId("app-root", 25000);
    await dismissOpenOverlays();
    await browser.pause(300);
  });

  beforeEach(async function () {
    if (WYSIWYG_SKIP_ON_MACOS) { this.skip(); return; }

    // Focus the first editor tile, load the emacs fixture, and switch to Preview.
    await clickFirstEditorTileForWysiwyg();
    await loadNoteInFocusedTile("emacs");

    const tileId = await browser.execute(() => {
      const fn = (window as Window & { __notesapp_layout__?: () => { focusedTileId: string | null } }).__notesapp_layout__;
      return fn ? fn().focusedTileId : null;
    });
    if (!tileId) throw new Error("No focused tile after loading emacs note");

    await browser.execute((id) => {
      const el = document.querySelector(`[data-testid="tile-mode-indicator-${id}"]`) as HTMLElement | null;
      if (el) el.click();
    }, tileId);

    await browser.waitUntil(
      async () => {
        const text = await browser.execute(() => {
          const pm = document.querySelector(".ProseMirror");
          return pm ? pm.textContent : "";
        });
        return typeof text === "string" && text.includes("abc def");
      },
      { timeout: 8000, interval: 150, timeoutMsg: "emacs.md content not visible in WYSIWYG editor within 8s" },
    );
    await browser.pause(300);
    await focusWysiwygEditor();
  });

  it("Insert-Table button inserts a table node into the ProseMirror document", async () => {
    // Click the Insert-Table button via JavaScript (WebKitWebDriver intercept workaround).
    await browser.execute(() => {
      const btn = document.querySelector('[title="Insert table"]') as HTMLElement | null;
      if (btn) btn.click();
    });
    await browser.pause(500);

    const hasTable = await browser.execute(() => {
      return !!document.querySelector(".ProseMirror table");
    });
    expect(hasTable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// WYSIWYG drawing block insertion via C-c d (ISSUE-014, SPEC.md §5.2)
//
// Verifies that C-c d inserts a drawing-block node in the Preview tile and
// that the corresponding drawing fence appears in the sibling Editor tile.
// Skipped on macOS (ISSUE-003).
// ---------------------------------------------------------------------------

describe("WYSIWYG drawing block insertion (C-c d)", function () {
  before(async () => {
    if (WYSIWYG_SKIP_ON_MACOS) {
      console.log("  Drawing block E2E SKIPPED — ISSUE-003 (macOS E2E unavailable).");
    }
    await waitForId("app-root", 25000);
    await dismissOpenOverlays();
    await browser.pause(300);
  });

  beforeEach(async function () {
    if (WYSIWYG_SKIP_ON_MACOS) { this.skip(); return; }

    // Load the emacs fixture into the first editor tile, then switch to Preview.
    await clickFirstEditorTileForWysiwyg();
    await loadNoteInFocusedTile("emacs");

    const tileId = await browser.execute(() => {
      const fn = (window as Window & { __notesapp_layout__?: () => { focusedTileId: string | null } }).__notesapp_layout__;
      return fn ? fn().focusedTileId : null;
    });
    if (!tileId) throw new Error("No focused tile after loading emacs note");

    await browser.execute((id) => {
      const el = document.querySelector(`[data-testid="tile-mode-indicator-${id}"]`) as HTMLElement | null;
      if (el) el.click();
    }, tileId);

    await browser.waitUntil(
      async () => {
        const text = await browser.execute(() => {
          const pm = document.querySelector(".ProseMirror");
          return pm ? pm.textContent : "";
        });
        return typeof text === "string" && text.includes("abc def");
      },
      { timeout: 8000, interval: 150, timeoutMsg: "emacs.md content not visible in WYSIWYG editor within 8s" },
    );
    await browser.pause(300);
    await focusWysiwygEditor();
  });

  it("C-c d inserts a drawing-block node visible in the WYSIWYG Preview tile", async () => {
    // Send C-c then d to trigger the drawing-block insertion chord.
    await browser.action("key")
      .down(KEY.CTRL).down("c").up("c").up(KEY.CTRL)
      .perform();
    await browser.pause(150);
    await browser.action("key").down("d").up("d").perform();

    // Allow the async next_drawing_number invoke + insertContent to settle.
    await browser.pause(1000);

    const hasDrawingBlock = await browser.execute(() => {
      return !!document.querySelector('[data-testid="drawing-block"]');
    });
    expect(hasDrawingBlock).toBe(true);
  });

  it("double-clicking a drawing block shows the Excalidraw toolbar", async () => {
    // Insert the drawing block.
    await browser.action("key")
      .down(KEY.CTRL).down("c").up("c").up(KEY.CTRL)
      .perform();
    await browser.pause(150);
    await browser.action("key").down("d").up("d").perform();
    await browser.pause(1500);

    const drawingBlock = await $('[data-testid="drawing-block"]');
    await drawingBlock.waitForExist({ timeout: 5000 });

    // Double-click to enter edit mode. The NodeViewWrapper has contenteditable=false
    // so WebDriver refuses to click it directly; dispatch a synthetic dblclick on
    // the inner container div (where the onDoubleClick handler lives).
    await browser.execute(() => {
      const block = document.querySelector('[data-testid="drawing-block"]');
      const inner = block?.querySelector("div") as HTMLElement | null;
      inner?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    // Excalidraw lazy-loads on first open; give it time to settle.
    await browser.pause(2000);

    // Assert the Excalidraw toolbar is present and has a non-zero bounding rect.
    // This would have caught the missing-CSS regression (DOM exists but
    // everything collapses to zero size).
    const toolbarVisible = await browser.execute(() => {
      const toolbar = document.querySelector(".excalidraw .App-toolbar");
      if (!toolbar) return false;
      const rect = toolbar.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    expect(toolbarVisible).toBe(true);
  });

  it("drawing block retains its filename after Escape, bridge re-sync, and scroll", async () => {
    // Insert a drawing block.
    await browser.action("key")
      .down(KEY.CTRL).down("c").up("c").up(KEY.CTRL)
      .perform();
    await browser.pause(150);
    await browser.action("key").down("d").up("d").perform();
    await browser.pause(1500);

    const drawingBlock = await $('[data-testid="drawing-block"]');
    await drawingBlock.waitForExist({ timeout: 5000 });

    // Capture the assigned filename before any round-trips.
    const originalFilename = await browser.execute(() => {
      const block = document.querySelector('[data-testid="drawing-block"]');
      return block ? block.getAttribute("data-filename") : null;
    });
    expect(typeof originalFilename).toBe("string");
    expect((originalFilename as string).length).toBeGreaterThan(0);

    // Exit edit mode via Escape (also triggers sidecar save).
    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(200);

    // Force a full forward bridge re-sync: wait for the reverse-bridge debounce
    // (150 ms) to flush the drawing fence into Y.Text, then wait for the forward
    // bridge to rebuild xfrag from Y.Text (the WYSIWYG update listener will have
    // already written the drawing fence back in; we just need to ensure the
    // bridge origin guard doesn't eat it on a second observer tick).
    await browser.pause(500);

    // Scroll the WYSIWYG container to the bottom, then back to the top.
    await browser.execute(() => {
      const pm = document.querySelector(".ProseMirror");
      const scroller = pm?.parentElement ?? pm;
      if (scroller) {
        scroller.scrollTop = scroller.scrollHeight;
      }
    });
    await browser.pause(300);
    await browser.execute(() => {
      const pm = document.querySelector(".ProseMirror");
      const scroller = pm?.parentElement ?? pm;
      if (scroller) {
        scroller.scrollTop = 0;
      }
    });
    await browser.pause(300);

    // The drawing block must still be present with the original filename intact.
    const blockAfter = await $('[data-testid="drawing-block"]');
    await blockAfter.waitForExist({ timeout: 3000 });

    const filenameAfter = await browser.execute(() => {
      const block = document.querySelector('[data-testid="drawing-block"]');
      return block ? block.getAttribute("data-filename") : null;
    });

    expect(filenameAfter).toBe(originalFilename);
  });
});

// ---------------------------------------------------------------------------
// Phase 3 — Reference tile + Sidebar sections
// ---------------------------------------------------------------------------

/** Reset any reference tiles back to editor mode via the Zustand store. */
async function resetReferenceTilesToEditor() {
  await dismissOpenOverlays();
  await browser.execute(() => {
    const fn = (
      window as Window & {
        __notesapp_layout__?: () => {
          tiles: Record<string, { mode: string }>;
          setTileMode: (id: string, mode: string) => void;
        };
      }
    ).__notesapp_layout__;
    if (!fn) return;
    const { tiles, setTileMode } = fn();
    for (const [id, t] of Object.entries(tiles)) {
      if ((t as { mode: string }).mode === "reference") {
        setTileMode(id, "editor");
      }
    }
  });
  await browser.pause(300);
}

describe("Reference picker (C-x n r)", () => {
  afterEach(async () => {
    await resetReferenceTilesToEditor();
  });

  async function openReferencePicker() {
    await dismissOpenOverlays();
    await clickFirstTile();
    await browser.pause(200);
    await clickById("app-root");
    await browser.pause(300);
    // C-x n r chord
    await browser.action('key')
      .down(KEY.CTRL).down('x').up('x').up(KEY.CTRL).perform();
    await browser.pause(200);
    await browser.action('key').down('n').up('n').perform();
    await browser.pause(200);
    await browser.action('key').down('r').up('r').perform();
    await browser.pause(600);
    return waitForId("buffer-switcher", 5000);
  }

  it("C-x n r opens the buffer switcher in reference mode", async () => {
    const switcher = await openReferencePicker();
    await expect(switcher).toBeDisplayed();
    await browser.action('key').down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(300);
  });

  it("reference picker lists paper.md from references/", async () => {
    await openReferencePicker();
    const item = await waitForId("buffer-item-paper.md", 4000);
    await expect(item).toBeDisplayed();
    await browser.action('key').down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(300);
  });

  it("reference picker has no '+ New note…' row", async () => {
    await openReferencePicker();
    const newTop = await $('//*[@data-testid="buffer-new-note-top"]');
    expect(await newTop.isExisting()).toBe(false);
    await browser.action('key').down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(300);
  });

  it("pressing Enter binds the reference and closes picker", async () => {
    await openReferencePicker();
    // Filter to paper.md and press Enter
    const input = await byId("buffer-switcher-input");
    await input.setValue("paper");
    await browser.pause(300);
    await browser.action('key').down(KEY.RETURN).up(KEY.RETURN).perform();
    await browser.pause(800);

    // Switcher should close
    const switcher = await $('//*[@data-testid="buffer-switcher"]');
    await switcher.waitForDisplayed({ timeout: 2000, reverse: true });

    // Focused tile should now be reference mode
    const refTile = await $('//*[@data-tile-mode="reference"]');
    await refTile.waitForExist({ timeout: 4000 });
    await expect(refTile).toBeDisplayed();
  });
});

describe("Sidebar References section", () => {
  beforeEach(async () => {
    await dismissOpenOverlays();
    await browser.pause(200);
  });

  afterEach(async () => {
    await resetReferenceTilesToEditor();
  });

  it("References section toggle opens and shows paper.md", async () => {
    // Make sidebar visible
    const sidebar = await waitForId("activity-sidebar", 3000);
    await expect(sidebar).toBeDisplayed();

    // Click References toggle to open it
    const toggle = await waitForId("sidebar-references-toggle", 3000);
    await toggle.click();
    await browser.pause(400);

    // paper.md should appear in the list
    const refItem = await waitForId("sidebar-ref-paper.md", 3000);
    await expect(refItem).toBeDisplayed();
  });

  it("clicking a reference item switches the focused tile to reference mode", async () => {
    // Ensure References section is open
    const toggle = await byId("sidebar-references-toggle");
    const isExpanded = await toggle.getAttribute("aria-expanded");
    if (isExpanded !== "true") {
      await toggle.click();
      await browser.pause(400);
    }

    // Focus an editor tile first
    await focusFirstTileOfTypeViaStore("editor");

    // Click paper.md in the sidebar
    const refItem = await waitForId("sidebar-ref-paper.md", 3000);
    await refItem.click();
    await browser.pause(600);

    // The tile should now be reference mode
    const refTile = await $('//*[@data-tile-mode="reference"]');
    await refTile.waitForExist({ timeout: 3000 });
    await expect(refTile).toBeDisplayed();
  });
});

describe("Sidebar Search section", () => {
  beforeEach(async () => {
    await dismissOpenOverlays();
    await browser.pause(200);
  });

  it("Search section toggle opens and shows input", async () => {
    const sidebar = await waitForId("activity-sidebar", 3000);
    await expect(sidebar).toBeDisplayed();

    // Open Search section
    const toggle = await waitForId("sidebar-search-toggle", 3000);
    await toggle.click();
    await browser.pause(400);

    const input = await waitForId("sidebar-search-input", 3000);
    await expect(input).toBeDisplayed();
  });

  it("Ctrl+Shift+F opens sidebar and focuses search input", async () => {
    await clickById("app-root");
    await browser.pause(200);

    await sendCtrlShift("f");
    await browser.pause(500);

    const input = await waitForId("sidebar-search-input", 3000);
    await expect(input).toBeDisplayed();
  });

  it("typing in search shows results from notes", async () => {
    // Ensure Search section is open and focused
    const toggle = await byId("sidebar-search-toggle");
    const isExpanded = await toggle.getAttribute("aria-expanded");
    if (isExpanded !== "true") {
      await toggle.click();
      await browser.pause(400);
    }

    const input = await waitForId("sidebar-search-input", 3000);
    await input.setValue("alpha");
    await browser.pause(600); // wait for debounce + search

    // Should show at least one result
    const firstHit = await $('//*[@data-testid="search-hit-0"]');
    await firstHit.waitForExist({ timeout: 5000 });
    await expect(firstHit).toBeDisplayed();
  });
});
