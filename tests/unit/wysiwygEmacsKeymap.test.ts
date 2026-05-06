// SPDX-License-Identifier: MIT
// Copyright (c) 2026 NotesApp Contributors
// Co-authored with Claude (Anthropic) — https://www.anthropic.com/claude

/**
 * Unit tests for the EmacsKeymap Tiptap extension.
 *
 * Exercises the Emacs-style bindings that SPEC.md §5.2 requires in the
 * WYSIWYG (Preview tile) editor.  C-n / C-p (line motion) rely on
 * window.getSelection().modify(), which jsdom does not implement, so
 * those bindings are covered by the E2E test instead.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { EmacsKeymap, _killRingForTest } from "../../src/editor/emacsKeymap";

/** Minimal Tiptap Editor for unit testing (no Yjs, undo enabled). */
function makeEditor(html = "<p>hello world</p>"): { editor: Editor; container: HTMLElement } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const editor = new Editor({
    element: container,
    extensions: [
      StarterKit.configure({ undoRedo: {} }),
      EmacsKeymap,
    ],
    content: html,
    immediatelyRender: false,
  });
  return { editor, container };
}

/** Fire a keydown event on the ProseMirror content-editable element. */
function fireKey(
  editor: Editor,
  key: string,
  opts: { ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean } = {},
): void {
  editor.view.dom.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ctrlKey: opts.ctrlKey ?? false,
      altKey: opts.altKey ?? false,
      shiftKey: opts.shiftKey ?? false,
    }),
  );
}

let editor: Editor;
let container: HTMLElement;

beforeEach(() => {
  _killRingForTest.reset();
  ({ editor, container } = makeEditor());
  // Position cursor at start of text (position 1 = inside first paragraph).
  editor.commands.setTextSelection(1);
});

afterEach(() => {
  editor.destroy();
  container.remove();
});

// ---------------------------------------------------------------------------
// Character motion
// ---------------------------------------------------------------------------

describe("EmacsKeymap — C-f / C-b character motion", () => {
  it("Ctrl-f advances cursor by one character", () => {
    editor.commands.setTextSelection(1); // before "h"
    fireKey(editor, "f", { ctrlKey: true });
    expect(editor.state.selection.head).toBe(2); // after "h"
  });

  it("Ctrl-b retreats cursor by one character", () => {
    editor.commands.setTextSelection(4); // after "hel"
    fireKey(editor, "b", { ctrlKey: true });
    expect(editor.state.selection.head).toBe(3);
  });

  it("Ctrl-f clamps at document end", () => {
    const end = editor.state.doc.content.size - 1;
    editor.commands.setTextSelection(end);
    fireKey(editor, "f", { ctrlKey: true });
    // Should not throw or go past document size.
    expect(editor.state.selection.head).toBeGreaterThanOrEqual(end);
  });

  it("Ctrl-b clamps at document start", () => {
    editor.commands.setTextSelection(1);
    fireKey(editor, "b", { ctrlKey: true });
    expect(editor.state.selection.head).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// Line start / end
// ---------------------------------------------------------------------------

describe("EmacsKeymap — C-a / C-e line motion", () => {
  it("Ctrl-a moves to start of text block", () => {
    editor.commands.setTextSelection(5); // inside "hello"
    fireKey(editor, "a", { ctrlKey: true });
    // selectTextblockStart moves to position 1 (inside first paragraph).
    expect(editor.state.selection.head).toBe(1);
  });

  it("Ctrl-e moves to end of text block", () => {
    editor.commands.setTextSelection(1);
    fireKey(editor, "e", { ctrlKey: true });
    // "hello world" is 11 chars; end-of-block is at pos 12.
    expect(editor.state.selection.head).toBe(12);
  });
});

// ---------------------------------------------------------------------------
// Document bounds (M-< / M->)
// ---------------------------------------------------------------------------

describe("EmacsKeymap — M-< / M-> document bounds", () => {
  it("Alt-< moves cursor to start of document", () => {
    editor.commands.setTextSelection(8); // mid-document
    fireKey(editor, "<", { altKey: true });
    // After focus("start") the head should be at position 1.
    expect(editor.state.selection.head).toBe(1);
  });

  it("Alt-> moves cursor to end of document", () => {
    editor.commands.setTextSelection(1);
    fireKey(editor, ">", { altKey: true });
    const endOfText = editor.state.doc.content.size - 1; // inside last paragraph
    expect(editor.state.selection.head).toBeGreaterThanOrEqual(endOfText);
  });
});

// ---------------------------------------------------------------------------
// Kill ring — C-k and C-y
// ---------------------------------------------------------------------------

describe("EmacsKeymap — C-k (kill to EOL) and C-y (yank)", () => {
  it("Ctrl-k deletes from cursor to end of text block", () => {
    editor.commands.setTextSelection(6); // after "hello" (before " world")
    fireKey(editor, "k", { ctrlKey: true });
    // Should delete " world" (6 chars), leaving "hello".
    expect(editor.state.doc.textContent).toBe("hello");
  });

  it("Ctrl-k copies killed text to kill ring", () => {
    editor.commands.setTextSelection(6); // after "hello"
    fireKey(editor, "k", { ctrlKey: true });
    expect(_killRingForTest.top()).toBe(" world");
  });

  it("Ctrl-y inserts top of kill ring at cursor", () => {
    // Kill " world", then yank it back.
    editor.commands.setTextSelection(6);
    fireKey(editor, "k", { ctrlKey: true }); // kills " world"
    expect(editor.state.doc.textContent).toBe("hello");
    fireKey(editor, "y", { ctrlKey: true });
    expect(editor.state.doc.textContent).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// Mark / region — C-space, C-w, M-w
// ---------------------------------------------------------------------------

describe("EmacsKeymap — mark, C-w, M-w", () => {
  it("Ctrl-space sets the mark at cursor position", () => {
    editor.commands.setTextSelection(1); // pos 1
    fireKey(editor, " ", { ctrlKey: true }); // C-space
    fireKey(editor, "f", { ctrlKey: true }); // C-f to move away
    fireKey(editor, "f", { ctrlKey: true });
    fireKey(editor, "w", { ctrlKey: true }); // C-w: kill from mark (pos 1) to pos 3
    expect(editor.state.doc.textContent).toBe("llo world");
  });

  it("M-w copies region without deleting", () => {
    editor.commands.setTextSelection(1);
    fireKey(editor, " ", { ctrlKey: true }); // set mark at 1
    fireKey(editor, "f", { ctrlKey: true }); // move to 2
    fireKey(editor, "f", { ctrlKey: true }); // move to 3
    fireKey(editor, "w", { altKey: true }); // M-w: copy "he"
    // Content should be unchanged.
    expect(editor.state.doc.textContent).toBe("hello world");
    // Kill ring should have the copied text.
    expect(_killRingForTest.top()).toBe("he");
  });
});

// ---------------------------------------------------------------------------
// Undo — C-/
// ---------------------------------------------------------------------------

describe("EmacsKeymap — C-/ undo", () => {
  it("Ctrl-/ undoes the last edit", () => {
    editor.commands.setTextSelection(1);
    editor.commands.insertContent("X"); // inserts "X" at start → "Xhello world"
    expect(editor.state.doc.textContent).toBe("Xhello world");
    fireKey(editor, "/", { ctrlKey: true }); // undo
    expect(editor.state.doc.textContent).toBe("hello world");
  });
});

// ---------------------------------------------------------------------------
// Cancel — C-g
// ---------------------------------------------------------------------------

describe("EmacsKeymap — C-g cancel", () => {
  it("Ctrl-g collapses selection and clears mark", () => {
    // Set mark, move cursor, then press C-g.
    editor.commands.setTextSelection(1);
    fireKey(editor, " ", { ctrlKey: true }); // set mark
    editor.commands.setTextSelection({ from: 1, to: 5 }); // extend selection
    fireKey(editor, "g", { ctrlKey: true }); // C-g
    // Selection should be collapsed (from === to).
    expect(editor.state.selection.from).toBe(editor.state.selection.to);
    // Subsequent C-w should be a no-op (mark cleared).
    fireKey(editor, "w", { ctrlKey: true });
    expect(editor.state.doc.textContent).toBe("hello world");
  });
});
