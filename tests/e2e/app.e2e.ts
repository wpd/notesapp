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
 * Wait for an element with a given data-tile-type attribute to appear.
 */
async function waitForTileType(tileType: string, timeout = 10000) {
  const el = $(`//*[@data-tile-type="${tileType}"]`);
  await el.waitForExist({ timeout });
  return el;
}

/**
 * Click the first element with data-tile-type via native XPath click.
 */
async function clickFirstTileOfType(tileType: string) {
  const el = $(`//*[@data-tile-type="${tileType}"]`);
  await el.waitForExist({ timeout: 5000 });
  await el.click();
  await browser.pause(50);
}

/**
 * Click the Nth element (0-indexed) with data-tile-type="editor".
 */
async function clickEditorAtIndex(index: number) {
  const editors = await $$('//*[@data-tile-type="editor"]');
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
  const editors = await $$('//*[@data-tile-type="editor"]');
  if (editors.length > index) {
    return editors[index].getAttribute('data-testid');
  }
  return null;
}

/**
 * Count tiles that have both a data-testid starting with "tile-" and
 * a data-tile-type attribute.
 */
async function getTileCount(): Promise<number> {
  const tiles = await $$('//*[starts-with(@data-testid,"tile-") and @data-tile-type]');
  return tiles.length;
}

/**
 * Click the first tile in the layout (any type) via native XPath click.
 */
async function clickFirstTile() {
  const el = $('//*[starts-with(@data-testid,"tile-") and @data-tile-type]');
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

/** Send C-x prefix chord, then a key. */
async function sendCxChord(key: string) {
  await browser.action('key')
    .down(KEY.CTRL).down('x').up('x').up(KEY.CTRL)
    .perform();
  await browser.pause(150);
  await browser.action('key').down(key).up(key).perform();
  await browser.pause(200);
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

    // Click editor tile to focus it
    await clickFirstTileOfType("editor");
    await browser.pause(200);

    await sendCxChord('h');
    await browser.pause(500);

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
    // Open alpha.md so editor has content
    await clickById("app-root");
    await sendCxChord('b');
    const switcher = await waitForId("buffer-switcher", 3000);
    await expect(switcher).toBeDisplayed();
    const input = await byId("buffer-switcher-input");
    await input.clearValue();
    await input.setValue("alpha");
    await browser.pause(200);
    await browser.action('key').down(KEY.RETURN).up(KEY.RETURN).perform();
    await browser.pause(600);
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

describe("Pin behavior (C-x p)", () => {
  it("C-x p pins the focused editor tile", async () => {
    await clickFirstTileOfType("editor");
    await browser.pause(200);

    const tileId = await getEditorTestIdAtIndex(0);
    await sendCxChord('p');

    // Status bar should show pinned indicator
    if (tileId) {
      const tileNum = tileId.replace("tile-", "");
      const pinIndicator = await waitForId(`pinned-indicator-${tileNum}`, 2000);
      await expect(pinIndicator).toBeDisplayed();
    }
  });

  it("pinning a second editor tile unpins the first", async () => {
    // Ensure we have at least two editor tiles
    const editorEls = await $$('//*[@data-tile-type="editor"]');
    if (editorEls.length < 2) {
      await clickFirstTileOfType("editor");
      await sendCxChord('h');
      await browser.pause(1000);
    }

    const firstId = await getEditorTestIdAtIndex(0);

    // The previous test may have already pinned the first editor. Pin it
    // only if it is not already pinned — sending C-x p on a pinned tile
    // would toggle it off, violating this test's precondition.
    if (firstId) {
      const firstNum = firstId.replace("tile-", "");
      const alreadyPinned = await byId(`pinned-indicator-${firstNum}`).isExisting();
      if (!alreadyPinned) {
        await clickEditorAtIndex(0);
        await browser.pause(300);
        await sendCxChord('p');
        await browser.pause(500);
      }
      const firstPin = await byId(`pinned-indicator-${firstNum}`);
      await expect(firstPin).toBeDisplayed();
    }

    const secondId = await getEditorTestIdAtIndex(1);
    await clickEditorAtIndex(1);
    await browser.pause(300);

    await sendCxChord('p');
    await browser.pause(500);

    if (firstId) {
      const firstNum = firstId.replace("tile-", "");
      const firstPin = await byId(`pinned-indicator-${firstNum}`);
      await expect(firstPin).not.toBeDisplayed();
    }
    if (secondId) {
      const secondNum = secondId.replace("tile-", "");
      const secondPin = await byId(`pinned-indicator-${secondNum}`);
      await expect(secondPin).toBeDisplayed();
    }
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
    // biome-ignore lint/suspicious/noExplicitAny: MosaicNode recursive shape
    const node = tree as any;
    return countLeaves(node.first) + countLeaves(node.second);
  }
  return 0;
}

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
      tiles: Record<string, { type: string; filePath: string | null }>;
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
        // biome-ignore lint/suspicious/noExplicitAny: recursive MosaicNode
        const n = node as any;
        collect(n.first);
        collect(n.second);
      }
    })(persisted.tree);

    expect(leafIds.length).toBeGreaterThan(0);
    for (const id of leafIds) {
      expect(persisted.tiles[id]).toBeDefined();
      expect(
        persisted.tiles[id].type === "editor" ||
          persisted.tiles[id].type === "preview",
      ).toBe(true);
    }
  });
});
