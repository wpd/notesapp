// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * E2E tests — Emacs keybindings in the WYSIWYG (Preview) tile.
 *
 * SPEC.md §5.2 — Emacs keybindings in the WYSIWYG editor.
 *
 * These tests use the `emacs.md` fixture note created by wdio.conf.ts:
 *   "abc def\n\n# heading\n\nsecond paragraph\n"
 *
 * All cursor-position assertions use the ProseMirror selection state, which
 * is directly readable from the React editorStore via window.__NOTESAPP_*
 * globals (not exposed), so we use `browser.execute` against the DOM to infer
 * cursor position from window.getSelection().
 *
 * WebKitWebDriver limitations: same as app.e2e.ts — CSS attribute selectors
 * unsupported in findElement; use XPath-based element refs.
 *
 * Skipped on macOS: ISSUE-003 (WebKitWebDriver not available on macOS).
 */

// W3C WebDriver Unicode key codes (duplicated from app.e2e.ts — no shared module)
const KEY = {
  CTRL:  '\uE009',
  SHIFT: '\uE008',
  ALT:   '\uE00A',
  ESC:   '\uE00C',
  RETURN:'\uE006',
} as const;

/** Wait for a data-testid element (XPath). */
async function waitForId(testId: string, timeout = 20000) {
  const el = $(`//*[@data-testid="${testId}"]`);
  await el.waitForExist({ timeout });
  return el;
}

/** Click the first Editor tile. */
async function clickFirstEditorTile() {
  const el = $('//*[@data-tile-mode="editor"]');
  await el.waitForExist({ timeout: 10000 });
  await el.click();
  await browser.pause(100);
}

/** Open the buffer switcher on the currently focused tile and load a note by name. */
async function loadNoteInFocusedTile(noteName: string) {
  // C-x b
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

/** Click inside the Tiptap editor to ensure it has keyboard focus. */
async function focusWysiwygEditor() {
  const pm = await $(".ProseMirror");
  await pm.waitForExist({ timeout: 5000 });
  await pm.click();
  await browser.pause(100);
}

/**
 * Return the caret character offset within the ProseMirror contenteditable
 * using window.getSelection().  Returns -1 if selection is unavailable.
 */
async function getCaretOffset(): Promise<number> {
  return browser.execute(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return -1;
    return sel.getRangeAt(0).startOffset;
  });
}

/**
 * Return the text content of the focused node (anchorNode).
 */
async function getAnchorText(): Promise<string> {
  return browser.execute(() => {
    const sel = window.getSelection();
    if (!sel || !sel.anchorNode) return "";
    return sel.anchorNode.textContent ?? "";
  });
}

// Skip entire suite on macOS (ISSUE-003).
const SKIP_ON_MACOS = process.platform === "darwin";

describe("WYSIWYG Emacs keybindings", function () {
  before(async () => {
    if (SKIP_ON_MACOS) {
      console.log("⚠️  WYSIWYG Emacs E2E SKIPPED — ISSUE-003 (macOS E2E unavailable).");
    }
    await waitForId("app-root", 25000);
  });

  // Open a Preview tile bound to emacs.md before each test.
  beforeEach(async function () {
    if (SKIP_ON_MACOS) { this.skip(); return; }

    // Click the first editor tile and use C-x n p to switch it to Preview mode.
    await clickFirstEditorTile();
    await loadNoteInFocusedTile("emacs");
    // Switch the tile to Preview mode (C-x n p).
    await browser.action("key")
      .down(KEY.CTRL).down("x").up("x").up(KEY.CTRL)
      .perform();
    await browser.pause(150);
    await browser.action("key").down("n").up("n").perform();
    await browser.pause(100);
    await browser.action("key").down("p").up("p").perform();
    await browser.pause(800); // allow Tiptap to mount and bridge to sync

    await focusWysiwygEditor();
  });

  // ---------------------------------------------------------------------------
  // M-< / M-> document bounds via Esc-prefix
  // ---------------------------------------------------------------------------

  it("Esc > moves cursor to end of document", async () => {
    // Move cursor to position somewhere in the middle first via Esc >.
    // Then verify the anchor node text is from the last paragraph.
    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(150);
    await browser.action("key").down(">").up(">").perform();
    await browser.pause(300);

    const anchorText = await getAnchorText();
    // The last paragraph is "second paragraph"; anchorNode should contain that text.
    expect(anchorText).toContain("second paragraph");
  });

  it("Esc < moves cursor to beginning of document", async () => {
    // First go to end, then come back to start.
    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(100);
    await browser.action("key").down(">").up(">").perform();
    await browser.pause(200);

    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(100);
    await browser.action("key").down("<").up("<").perform();
    await browser.pause(300);

    const anchorText = await getAnchorText();
    // First paragraph is "abc def"; cursor should be at the start.
    expect(anchorText).toContain("abc def");
    const offset = await getCaretOffset();
    expect(offset).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // C-a / C-e line motion
  // ---------------------------------------------------------------------------

  it("Ctrl-e moves cursor to end of current line", async () => {
    // Position cursor at the start of "abc def" paragraph.
    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(100);
    await browser.action("key").down("<").up("<").perform();
    await browser.pause(200);

    await browser.action("key")
      .down(KEY.CTRL).down("e").up("e").up(KEY.CTRL)
      .perform();
    await browser.pause(200);

    const offset = await getCaretOffset();
    const anchorText = await getAnchorText();
    // "abc def" is 7 chars; end of textblock is offset 7.
    expect(anchorText).toContain("abc def");
    expect(offset).toBe(7);
  });

  it("Ctrl-a moves cursor to start of current line", async () => {
    // Go to end of "abc def" paragraph, then C-a.
    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(100);
    await browser.action("key").down("<").up("<").perform();
    await browser.pause(200);
    await browser.action("key")
      .down(KEY.CTRL).down("e").up("e").up(KEY.CTRL)
      .perform();
    await browser.pause(150);

    await browser.action("key")
      .down(KEY.CTRL).down("a").up("a").up(KEY.CTRL)
      .perform();
    await browser.pause(200);

    const offset = await getCaretOffset();
    expect(offset).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Esc f — word motion
  // ---------------------------------------------------------------------------

  it("Esc f advances cursor by one word", async () => {
    // Start at beginning of doc (cursor at offset 0 of "abc def").
    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(100);
    await browser.action("key").down("<").up("<").perform();
    await browser.pause(200);

    const offsetBefore = await getCaretOffset();

    await browser.action("key").down(KEY.ESC).up(KEY.ESC).perform();
    await browser.pause(100);
    await browser.action("key").down("f").up("f").perform();
    await browser.pause(300);

    const offsetAfter = await getCaretOffset();
    // After moving forward one word, cursor should have advanced past "abc".
    expect(offsetAfter).toBeGreaterThan(offsetBefore);
  });
});
